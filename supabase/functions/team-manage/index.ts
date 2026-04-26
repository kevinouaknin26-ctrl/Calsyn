import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { captureError } from '../_shared/sentry.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': 'https://calsyn.app',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Action = 'resend_invite' | 'cancel_invite' | 'toggle_status' | 'delete_user'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error: userErr } = await authClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Invalid session' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
    const { data: caller } = await admin.from('profiles').select('role, organisation_id').eq('id', user.id).single()
    if (!caller) return json({ error: 'Profile not found' }, 404)
    if (!['super_admin', 'admin', 'manager'].includes(caller.role)) return json({ error: 'Forbidden' }, 403)

    const body = await req.json().catch(() => null)
    const action = body?.action as Action
    const targetId = String(body?.user_id || '')
    if (!targetId) return json({ error: 'user_id requis' }, 400)
    if (targetId === user.id) return json({ error: 'Action interdite sur soi-même' }, 403)

    const { data: target } = await admin.from('profiles').select('id, email, organisation_id, role, deactivated_at').eq('id', targetId).single()
    if (!target) return json({ error: 'Utilisateur introuvable' }, 404)
    if (target.organisation_id !== caller.organisation_id) return json({ error: 'Cross-org interdit' }, 403)
    if (target.role === 'super_admin' && caller.role !== 'super_admin') return json({ error: 'Cannot act on super_admin' }, 403)

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || null
    const ua = req.headers.get('user-agent') || null
    const logAudit = (event_type: string, description: string, metadata: Record<string, unknown> = {}) =>
      admin.rpc('log_audit_event', {
        p_organisation_id: caller.organisation_id,
        p_actor_user_id: user.id,
        p_event_type: event_type,
        p_description: description,
        p_target_user_id: targetId,
        p_metadata: metadata,
        p_event_category: 'admin',
        p_ip: ip,
        p_ua: ua,
      }).then(() => {}).catch(() => {})

    switch (action) {
      case 'resend_invite': {
        const { error } = await admin.auth.admin.inviteUserByEmail(target.email, {
          data: { organisation_id: caller.organisation_id, role: target.role, invited_by: user.id },
          redirectTo: `${Deno.env.get('APP_URL') || 'http://localhost:5173'}/login`,
        })
        if (error) return json({ error: error.message }, 400)
        await logAudit('user.invite_resent', `Re-envoi d'invitation à ${target.email}`)
        return json({ ok: true, action })
      }
      case 'cancel_invite': {
        const { data: authUser } = await admin.auth.admin.getUserById(targetId)
        if (authUser?.user?.email_confirmed_at) return json({ error: 'Utilisateur déjà confirmé — utiliser delete_user' }, 400)
        const { error } = await admin.auth.admin.deleteUser(targetId)
        if (error) return json({ error: error.message }, 400)
        await logAudit('user.invite_cancelled', `Annulation invitation ${target.email}`)
        return json({ ok: true, action })
      }
      case 'toggle_status': {
        // Si on suspend un super_admin, vérifier qu'il en reste au moins 1 actif après
        if (target.role === 'super_admin' && !target.deactivated_at) {
          const { count } = await admin.from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('organisation_id', caller.organisation_id)
            .eq('role', 'super_admin')
            .is('deactivated_at', null)
            .neq('id', targetId)
          if ((count || 0) === 0) {
            return json({ error: 'Impossible de suspendre le dernier super_admin actif de l\'organisation' }, 403)
          }
        }
        const newVal = target.deactivated_at ? null : new Date().toISOString()
        const { error } = await admin.from('profiles').update({ deactivated_at: newVal }).eq('id', targetId)
        if (error) return json({ error: error.message }, 400)
        await logAudit(
          newVal ? 'user.suspended' : 'user.reactivated',
          newVal ? `Suspension de ${target.email}` : `Réactivation de ${target.email}`,
          { previous_role: target.role },
        )
        return json({ ok: true, action, deactivated: !!newVal })
      }
      case 'delete_user': {
        // Si on supprime un super_admin, vérifier qu'il en reste au moins 1 actif après
        if (target.role === 'super_admin') {
          const { count } = await admin.from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('organisation_id', caller.organisation_id)
            .eq('role', 'super_admin')
            .is('deactivated_at', null)
            .neq('id', targetId)
          if ((count || 0) === 0) {
            return json({ error: 'Impossible d\'archiver le dernier super_admin de l\'organisation' }, 403)
          }
        }
        const { error } = await admin.auth.admin.deleteUser(targetId)
        if (error) return json({ error: error.message }, 400)
        await logAudit('user.archived', `Archivage de ${target.email}`, { previous_role: target.role })
        return json({ ok: true, action })
      }
      default:
        return json({ error: 'Action inconnue' }, 400)
    }
  } catch (e) {
    captureError(e, { tags: { fn: 'team-manage' } }).catch(() => {})
    return json({ error: (e as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
