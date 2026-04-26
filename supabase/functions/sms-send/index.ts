/**
 * sms-send — Envoie un SMS via Twilio + log dans sms_messages.
 *
 * POST { to, body, prospectId?, fromNumber? }
 * - to : numéro destinataire (E.164)
 * - body : texte du SMS (max 1600 chars segmenté auto par Twilio)
 * - prospectId : optionnel, pour lier le SMS au prospect
 * - fromNumber : optionnel, sinon prend le 1er numéro Twilio de l'org
 *
 * Auth : JWT Supabase (verify_jwt: true).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { captureError } from '../_shared/sentry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://calsyn.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function getAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const admin = getAdmin()
    const { data: { user }, error: authError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = await req.json()
    // Compat camelCase + snake_case (channel registry envoie snake)
    let to: string | undefined = payload.to
    const body: string | undefined = payload.body
    const prospectId: string | undefined = payload.prospectId || payload.prospect_id
    const fromNumber: string | undefined = payload.fromNumber || payload.from_number

    // Si pas de `to` explicite, lookup via prospect_id (cas messagerie unifiée)
    if (!to && prospectId) {
      const { data: p } = await getAdmin()
        .from('prospects').select('phone').eq('id', prospectId).maybeSingle()
      to = p?.phone || undefined
    }

    if (!to || !body) {
      return new Response(JSON.stringify({ error: 'Missing to or body' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Trouve l'organisation_id du user
    const { data: profile } = await admin
      .from('profiles').select('organisation_id').eq('id', user.id).maybeSingle()
    const orgId = profile?.organisation_id
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'No organisation' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Rate limit : 100 SMS / jour / user ──
    const { data: rl } = await admin.rpc('check_rate_limit', {
      p_user_id: user.id,
      p_organisation_id: orgId,
      p_action: 'sms_send',
      p_metadata: { to: to.slice(-4) },  // garde juste les 4 derniers chiffres pour audit
    })
    if (rl && rl.allowed === false) {
      return new Response(JSON.stringify({
        error: 'Limite SMS atteinte',
        message: `Tu as envoyé ${rl.count}/${rl.limit} SMS aujourd'hui. La limite se reset à minuit.`,
        rate_limit: rl,
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Détermine le numéro from
    let from = fromNumber
    if (!from) {
      const { data: org } = await admin
        .from('organisations').select('from_number').eq('id', orgId).maybeSingle()
      from = org?.from_number
    }
    if (!from) {
      return new Response(JSON.stringify({ error: 'Aucun numéro Twilio configuré' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Envoi via Twilio API
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
    if (!accountSid || !authToken) {
      return new Response(JSON.stringify({ error: 'Twilio not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }),
    })
    const twilioData = await twilioRes.json()
    if (!twilioRes.ok) {
      console.error('[sms-send] Twilio error:', twilioData)
      return new Response(JSON.stringify({ error: twilioData.message || 'Twilio send failed' }), {
        status: twilioRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Log dans sms_messages (INSERT direct via service role)
    await admin.from('sms_messages').insert({
      organisation_id: orgId,
      prospect_id: prospectId || null,
      user_id: user.id,
      twilio_sid: twilioData.sid,
      from_number: from,
      to_number: to,
      body,
      direction: 'outbound',
      status: twilioData.status || 'queued',
    })

    return new Response(JSON.stringify({ ok: true, sid: twilioData.sid, status: twilioData.status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[sms-send] Error:', err)
    captureError(err, { tags: { fn: 'sms-send' } }).catch(() => {})
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
