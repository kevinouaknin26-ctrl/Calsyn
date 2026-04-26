/**
 * impersonate-user — Génère un magic link pour qu'un super_admin puisse se
 * connecter en tant qu'un autre user (debugging, support).
 *
 * SÉCURITÉ :
 *  - Caller doit être super_admin (vérifié via JWT + role en DB)
 *  - Target ne peut pas être un super_admin (évite escalade)
 *  - Action loggée dans activity_logs (audit trail)
 *
 * POST { user_id: <target> }
 * Auth : Bearer JWT du super_admin
 * Returns : { url: <magic_link> }
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') || 'https://calsyn.app'

const CORS = {
  'Access-Control-Allow-Origin': 'https://calsyn.app',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

    // Vérifie que le caller est super_admin
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !caller) return json({ error: 'Invalid session' }, 401)
    const { data: callerProfile } = await admin
      .from('profiles').select('role, full_name').eq('id', caller.id).single()
    if (!callerProfile || callerProfile.role !== 'super_admin') {
      return json({ error: 'Seul un super_admin peut impersonner' }, 403)
    }

    const body = await req.json().catch(() => null)
    const targetUserId = String(body?.user_id || '').trim()
    if (!targetUserId) return json({ error: 'user_id requis' }, 400)

    // Récupère target
    const { data: target } = await admin
      .from('profiles').select('id, email, full_name, role').eq('id', targetUserId).single()
    if (!target) return json({ error: 'User cible introuvable' }, 404)
    if (target.role === 'super_admin') {
      return json({ error: 'Impossible d\'impersonner un autre super_admin' }, 403)
    }
    if (target.id === caller.id) {
      return json({ error: 'Tu es déjà toi-même' }, 400)
    }

    // Génère le magic link
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: target.email,
      options: { redirectTo: `${APP_URL}/app/dialer` },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      console.error('[impersonate] generateLink failed:', linkErr)
      return json({ error: 'Échec génération du lien' }, 500)
    }

    // Audit log
    await admin.from('activity_logs').insert({
      action: 'impersonate',
      details: `Super admin ${callerProfile.full_name || caller.email} → impersonne ${target.full_name || target.email} (${target.role})`,
      user_id: caller.id,
    }).then(() => {}, () => {})

    return json({
      url: linkData.properties.action_link,
      target: { email: target.email, name: target.full_name, role: target.role },
    })
  } catch (err) {
    console.error('[impersonate] Error:', err)
    return json({ error: 'Internal error' }, 500)
  }
})
