import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

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

    switch (action) {
      case 'resend_invite': {
        const { error } = await admin.auth.admin.inviteUserByEmail(target.email, {
          data: { organisation_id: caller.organisation_id, role: target.role, invited_by: user.id },
          redirectTo: `${Deno.env.get('APP_URL') || 'http://localhost:5173'}/login`,
        })
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true, action })
      }
      case 'cancel_invite': {
        const { data: authUser } = await admin.auth.admin.getUserById(targetId)
        if (authUser?.user?.email_confirmed_at) return json({ error: 'Utilisateur déjà confirmé — utiliser delete_user' }, 400)
        const { error } = await admin.auth.admin.deleteUser(targetId)
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true, action })
      }
      case 'toggle_status': {
        const newVal = target.deactivated_at ? null : new Date().toISOString()
        const { error } = await admin.from('profiles').update({ deactivated_at: newVal }).eq('id', targetId)
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true, action, deactivated: !!newVal })
      }
      case 'delete_user': {
        const { error } = await admin.auth.admin.deleteUser(targetId)
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true, action })
      }
      default:
        return json({ error: 'Action inconnue' }, 400)
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
