/**
 * gdpr — RGPD : export et suppression des données personnelles.
 *
 * POST /functions/v1/gdpr
 *   Auth : Bearer JWT
 *
 * Body :
 *   { action: 'export' }                  → user récupère ses données (Article 20)
 *   { action: 'request_deletion' }        → user demande suppression (Article 17)
 *   { action: 'delete_user', user_id }    → super_admin supprime un user (immédiat)
 *
 * Process suppression :
 *   1. Anonymise user_id dans messages (SET NULL via FK existante ou direct)
 *   2. Hard delete auth.users → cascade profiles, integrations, sessions
 *   3. Audit log 'user.gdpr_deleted'
 *
 * Process export :
 *   - Profile, calls (user_id=me), messages (user_id=me), email_templates,
 *     user_integrations (provider info, pas les tokens), audit_events où je suis acteur
 *   - Return JSON Blob avec download URL signée (storage)
 *
 * Process request_deletion :
 *   - Marque profiles.deletion_requested_at = now()
 *   - Audit log 'user.gdpr_deletion_requested'
 *   - L'admin de l'org reçoit l'info, peut traiter via team-manage > delete_user
 */

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

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

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
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, full_name, role, organisation_id')
      .eq('id', user.id).single()
    if (!profile) return json({ error: 'Profil introuvable' }, 404)

    const body = await req.json().catch(() => null)
    const action = body?.action as string

    const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || null
    const ua = req.headers.get('user-agent') || null

    switch (action) {
      // ── 1. Export (Article 20 — droit à la portabilité) ──
      case 'export': {
        const userId = user.id
        const orgId = profile.organisation_id

        const [
          { data: callsMine },
          { data: messagesMine },
          { data: smsMessagesMine },
          { data: emailTemplatesMine },
          { data: integrations },
          { data: auditAsActor },
        ] = await Promise.all([
          admin.from('calls').select('*').eq('sdr_id', userId).limit(10000),
          admin.from('messages').select('*').eq('user_id', userId).limit(10000),
          admin.from('sms_messages').select('*').eq('user_id', userId).limit(10000),
          admin.from('email_templates').select('*').eq('user_id', userId).limit(1000),
          admin.from('user_integrations').select('id, provider, email, scope, created_at, updated_at').eq('user_id', userId),
          admin.from('audit_events').select('*').eq('actor_user_id', userId).limit(10000),
        ])

        await admin.rpc('log_audit_event', {
          p_organisation_id: orgId,
          p_actor_user_id: userId,
          p_event_type: 'user.gdpr_export',
          p_event_category: 'gdpr',
          p_description: `Export RGPD demandé par ${profile.email}`,
          p_target_user_id: userId,
          p_metadata: {},
          p_ip: ip, p_ua: ua,
        }).then(() => {}, () => {})

        return json({
          generated_at: new Date().toISOString(),
          user: {
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            role: profile.role,
            organisation_id: profile.organisation_id,
          },
          calls: callsMine || [],
          messages: messagesMine || [],
          sms_messages: smsMessagesMine || [],
          email_templates: emailTemplatesMine || [],
          integrations: integrations || [],
          audit_events_as_actor: auditAsActor || [],
        })
      }

      // ── 2. Demande suppression (Article 17 — droit à l'oubli, soft) ──
      case 'request_deletion': {
        const { error } = await admin
          .from('profiles')
          .update({ deletion_requested_at: new Date().toISOString() })
          .eq('id', user.id)
        if (error) return json({ error: error.message }, 400)

        await admin.rpc('log_audit_event', {
          p_organisation_id: profile.organisation_id,
          p_actor_user_id: user.id,
          p_event_type: 'user.gdpr_deletion_requested',
          p_event_category: 'gdpr',
          p_description: `Demande de suppression RGPD par ${profile.email}`,
          p_target_user_id: user.id,
          p_metadata: {},
          p_ip: ip, p_ua: ua,
        }).then(() => {}, () => {})

        return json({ ok: true, message: 'Demande de suppression enregistrée. Un admin la traitera sous 30 jours.' })
      }

      // ── 3. Suppression effective (super_admin uniquement) ──
      case 'delete_user': {
        if (profile.role !== 'super_admin') return json({ error: 'Réservé aux super_admins' }, 403)
        const targetId = String(body?.user_id || '').trim()
        if (!targetId) return json({ error: 'user_id requis' }, 400)
        if (targetId === user.id) return json({ error: 'Action interdite sur soi-même' }, 403)

        const { data: target } = await admin
          .from('profiles').select('id, email, full_name, role, organisation_id').eq('id', targetId).single()
        if (!target) return json({ error: 'User introuvable' }, 404)
        if (target.organisation_id !== profile.organisation_id) return json({ error: 'Cross-org interdit' }, 403)

        // 1. Anonymise les références qui ne cascadent pas
        await admin.from('messages').update({ user_id: null }).eq('user_id', targetId)
        await admin.from('sms_messages').update({ user_id: null }).eq('user_id', targetId)
        await admin.from('email_templates').update({ user_id: null }).eq('user_id', targetId)
        await admin.from('calls').update({ sdr_id: null }).eq('sdr_id', targetId)
        await admin.from('activity_logs').update({ user_id: null }).eq('user_id', targetId)

        // 2. Audit log AVANT suppression (l'auth.users.delete cascade peut casser l'INSERT)
        await admin.rpc('log_audit_event', {
          p_organisation_id: target.organisation_id,
          p_actor_user_id: user.id,
          p_event_type: 'user.gdpr_deleted',
          p_event_category: 'gdpr',
          p_description: `Suppression RGPD de ${target.email} par ${profile.email}`,
          p_target_user_id: target.id,
          p_metadata: { target_email: target.email, target_role: target.role },
          p_ip: ip, p_ua: ua,
        }).then(() => {}, () => {})

        // 3. Hard delete auth.users → cascade profiles, integrations, sessions, etc.
        const { error: delErr } = await admin.auth.admin.deleteUser(targetId)
        if (delErr) return json({ error: delErr.message }, 400)

        return json({ ok: true, message: `User ${target.email} supprimé.` })
      }

      default:
        return json({ error: 'Action inconnue. Utiliser export | request_deletion | delete_user' }, 400)
    }
  } catch (e) {
    captureError(e, { tags: { fn: 'gdpr' } }).catch(() => {})
    return json({ error: (e as Error).message }, 500)
  }
})
