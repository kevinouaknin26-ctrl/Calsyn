/**
 * wa-webhook — Reçoit les messages WhatsApp inbound depuis Twilio.
 *
 * Configuration Twilio Console : Messaging > Senders > [WA Sender] >
 * Webhook URL = https://<project>.supabase.co/functions/v1/wa-webhook
 * Method : HTTP POST
 *
 * Le payload est en x-www-form-urlencoded (comme SMS).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const text = await req.text()
    const params = Object.fromEntries(new URLSearchParams(text).entries())

    const messageSid = params.MessageSid || params.SmsMessageSid || ''
    const from = params.From || ''  // 'whatsapp:+33XXX...'
    const to = params.To || ''      // 'whatsapp:+33XXX...'
    const body = params.Body || ''
    const numMedia = parseInt(params.NumMedia || '0', 10)

    console.log(`[wa-webhook] inbound ${messageSid} from=${from} to=${to}`)

    // Récup attachments (média WA)
    const attachments: Array<{ name: string; url: string; mime: string }> = []
    for (let i = 0; i < numMedia; i++) {
      const url = params[`MediaUrl${i}`]
      const mime = params[`MediaContentType${i}`] || 'application/octet-stream'
      if (url) attachments.push({ name: `media_${i}`, url, mime })
    }

    // Match prospect par phone (normalisé sans préfixe whatsapp:)
    const fromPhone = from.replace(/^whatsapp:/, '')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    const { data: prospects } = await supabase
      .from('prospects')
      .select('id, organisation_id, name')
      .or(`phone.eq.${fromPhone},phone2.eq.${fromPhone},phone3.eq.${fromPhone},phone4.eq.${fromPhone},phone5.eq.${fromPhone}`)
      .limit(1)

    const prospect = prospects?.[0]
    if (!prospect) {
      console.warn(`[wa-webhook] no prospect found for ${fromPhone}`)
      // On insère quand même le message orphelin (sans prospect_id)
    }

    await supabase.from('messages').insert({
      organisation_id: prospect?.organisation_id || null,
      prospect_id: prospect?.id || null,
      channel: 'whatsapp',
      direction: 'in',
      external_id: messageSid,
      from_address: from,
      to_address: to,
      body,
      attachments: attachments.length > 0 ? attachments : [],
      sent_at: new Date().toISOString(),
      status: 'received',
    })

    return new Response('<Response/>', {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    })
  } catch (err) {
    console.error('[wa-webhook] Error:', err)
    return new Response('<Response/>', {
      headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
    })
  }
})
