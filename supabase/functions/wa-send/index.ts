/**
 * wa-send — Envoie un message WhatsApp via Twilio Messaging API.
 *
 * Twilio WhatsApp utilise le même endpoint que SMS, le seul changement est le
 * préfixe 'whatsapp:' devant les numéros (ex: whatsapp:+33757918461).
 *
 * Prérequis Twilio Console (à faire 1 fois côté admin) :
 * 1. Demander un WhatsApp Sender (Business Profile) : Console > Messaging > Try
 *    it out > Send a WhatsApp message OU passer en production via "Senders".
 * 2. Côté sandbox dev : envoyer "join <code>" depuis WhatsApp au numéro Twilio
 *    sandbox (ex: +1 415 523 8886) pour autoriser l'envoi vers ce numéro.
 * 3. Setter `TWILIO_WHATSAPP_FROM` (ex: "whatsapp:+14155238886" en sandbox,
 *    "whatsapp:+33757918461" en prod) dans les env vars du projet Supabase.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { corsHeaders } from '../_shared/cors.ts'
import { captureError } from '../_shared/sentry.ts'

serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors })

  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return new Response('Unauthorized', { status: 401, headers: cors })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM') || ''

  if (!waFrom) {
    return new Response(JSON.stringify({
      error: 'TWILIO_WHATSAPP_FROM non configuré',
      hint: 'Demander un WhatsApp Sender Twilio puis setter TWILIO_WHATSAPP_FROM (ex: whatsapp:+14155238886)',
    }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token)
  if (authErr || !user) return new Response('Invalid JWT', { status: 401, headers: cors })

  let body: { prospect_id?: string; body?: string; to?: string }
  try { body = await req.json() }
  catch { return new Response('Invalid JSON', { status: 400, headers: cors }) }

  const { prospect_id, body: msgBody, to: overrideTo } = body
  if (!prospect_id || !msgBody) {
    return new Response('Missing prospect_id or body', { status: 400, headers: cors })
  }

  const admin = createClient(supabaseUrl, serviceRole)
  const { data: prospect, error: pErr } = await admin
    .from('prospects')
    .select('id, organisation_id, phone, name')
    .eq('id', prospect_id)
    .single()
  if (pErr || !prospect) return new Response('Prospect not found', { status: 404, headers: cors })

  const toNumber = overrideTo || prospect.phone
  if (!toNumber) return new Response('No phone number for prospect', { status: 400, headers: cors })

  // Préfixe whatsapp:
  const waTo = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`

  // Envoi via Twilio
  const twilioRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: waFrom,
        To: waTo,
        Body: msgBody,
      }).toString(),
    }
  )

  if (!twilioRes.ok) {
    const errText = await twilioRes.text()
    console.error('[wa-send] Twilio error:', twilioRes.status, errText)
    captureError(new Error(`Twilio WA failed: ${errText}`), { tags: { fn: 'wa-send', twilio_status: String(twilioRes.status) } }).catch(() => {})
    return new Response(JSON.stringify({ error: 'Twilio WhatsApp send failed', details: errText }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const twilioData = await twilioRes.json() as { sid: string; status: string }

  // Insert dans messages (table unifiée, pas de table whatsapp_messages legacy)
  await admin.from('messages').insert({
    organisation_id: prospect.organisation_id,
    prospect_id: prospect.id,
    user_id: user.id,
    channel: 'whatsapp',
    direction: 'out',
    external_id: twilioData.sid,
    from_address: waFrom,
    to_address: waTo,
    body: msgBody,
    sent_at: new Date().toISOString(),
    status: twilioData.status,
  })

  return new Response(JSON.stringify({ sid: twilioData.sid, status: twilioData.status }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
