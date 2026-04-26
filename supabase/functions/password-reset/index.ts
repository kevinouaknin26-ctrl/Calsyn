/**
 * password-reset — Envoie un email de réinitialisation de mot de passe.
 *
 * 1. Vérifie que l'email existe en DB (sans révéler à l'attaquant si non)
 * 2. Génère un magic link Supabase type=recovery
 * 3. Envoie un email Resend avec template custom (style invite-member)
 *
 * Public (pas de JWT requis — l'user est par définition pas connecté).
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { renderResetEmail } from './email-template.ts'
import { captureError } from '../_shared/sentry.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'Calsyn <onboarding@resend.dev>'
const APP_URL = Deno.env.get('APP_URL') || 'https://calsyn.app'

const CORS = {
  'Access-Control-Allow-Origin': '*',  // public endpoint (pas de creds)
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
    const body = await req.json().catch(() => null)
    const email = String(body?.email || '').trim().toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Email invalide' }, 400)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

    // Vérifie que l'email existe (sans révéler à l'attaquant si oui/non — toujours 200)
    const { data: profile } = await admin
      .from('profiles').select('id, email').eq('email', email).maybeSingle()
    if (!profile) {
      // Toujours renvoyer succès pour ne pas révéler les emails enregistrés
      console.log(`[password-reset] email not found: ${email}`)
      return json({ ok: true })
    }

    // Génère un magic link recovery (Supabase Auth)
    const redirectTo = `${APP_URL}/reset-password`
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      console.error('[password-reset] generateLink failed:', linkErr)
      return json({ error: 'Impossible de générer le lien' }, 500)
    }

    const actionUrl = linkData.properties.action_link

    // Envoi email via Resend
    if (!RESEND_API_KEY) {
      console.error('[password-reset] RESEND_API_KEY not configured')
      return json({ error: 'Email service not configured' }, 500)
    }

    const logoUrl = `${APP_URL}/favicon.svg`
    const { subject, html, text } = renderResetEmail({ email, actionUrl, logoUrl })

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email],
        subject,
        html,
        text,
      }),
    })
    if (!resendRes.ok) {
      const errTxt = await resendRes.text()
      console.error('[password-reset] Resend error:', resendRes.status, errTxt)
      return json({ error: 'Envoi email échoué' }, 500)
    }

    return json({ ok: true })
  } catch (err) {
    console.error('[password-reset] Error:', err)
    captureError(err, { tags: { fn: 'password-reset' } }).catch(() => {})
    return json({ error: 'Internal error' }, 500)
  }
})
