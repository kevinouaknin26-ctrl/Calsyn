/**
 * sms-webhook — Reçoit les SMS entrants depuis Twilio.
 *
 * Twilio appelle cette URL (form-urlencoded) à chaque SMS reçu sur
 * un numéro configuré dans la console Twilio (Messaging Webhook URL).
 *
 * Paramètres Twilio : From, To, Body, MessageSid, AccountSid…
 *
 * On INSERT le row sms_messages avec direction='inbound' + match auto
 * du prospect par numéro de téléphone (any phone field).
 *
 * verify_jwt: false (Twilio n'envoie pas de JWT).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

function getAdmin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  )
}

serve(async (req) => {
  try {
    const text = await req.text()
    const params = Object.fromEntries(new URLSearchParams(text).entries())

    const from = params.From || ''
    const to = params.To || ''
    const body = params.Body || ''
    const sid = params.MessageSid || ''

    if (!from || !to || !sid) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    const admin = getAdmin()

    // Match prospect par n'importe quel champ téléphone
    const { data: prospects } = await admin
      .from('prospects')
      .select('id, organisation_id')
      .or(`phone.eq.${from},phone2.eq.${from},phone3.eq.${from},phone4.eq.${from},phone5.eq.${from}`)
      .is('deleted_at', null)
      .limit(1)
    const matched = prospects?.[0]

    // Match l'organisation par le numéro destinataire (organisations.from_number)
    let orgId = matched?.organisation_id
    if (!orgId) {
      const { data: org } = await admin
        .from('organisations').select('id').eq('from_number', to).is('deleted_at', null).maybeSingle()
      orgId = org?.id
    }

    if (!orgId) {
      console.warn('[sms-webhook] Unable to match org for inbound from', from, 'to', to)
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    await admin.from('sms_messages').insert({
      organisation_id: orgId,
      prospect_id: matched?.id || null,
      twilio_sid: sid,
      from_number: from,
      to_number: to,
      body,
      direction: 'inbound',
      status: 'received',
    })

    // Réponse TwiML vide (pas d'auto-reply)
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (err) {
    console.error('[sms-webhook] Error:', err)
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
})
