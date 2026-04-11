/**
 * status-callback — Recoit les events de progression d'appel de Twilio.
 *
 * C'est ici que la DB est mise a jour (source de verite = webhooks, pas le client).
 * Si l'agent ferme son onglet, cet endpoint sauve quand meme le call.
 *
 * Auth : Signature Twilio (X-Twilio-Signature)
 * TODO: validation signature
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const text = await req.text()
    const params = Object.fromEntries(new URLSearchParams(text).entries())

    const callSid = params.CallSid || ''
    const callStatus = params.CallStatus || ''
    const duration = parseInt(params.CallDuration || '0', 10)
    const conferenceSid = params.ConferenceSid || null
    const from = params.From || ''
    const to = params.To || ''

    console.log(`[status-callback] ${callSid}: ${callStatus} (${duration}s)`)

    // Seulement traiter les status finaux
    if (!['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(callStatus)) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    // Mapper le status Twilio vers notre disposition
    const outcomeMap: Record<string, string> = {
      'completed': 'connected',
      'busy': 'busy',
      'no-answer': 'no_answer',
      'canceled': 'no_answer',
      'failed': 'no_answer',
    }

    // Upsert le call (idempotent via UNIQUE call_sid)
    const { error } = await supabase
      .from('calls')
      .upsert({
        call_sid: callSid,
        conference_sid: conferenceSid,
        call_duration: duration,
        call_outcome: outcomeMap[callStatus] || callStatus,
        prospect_phone: to,
        from_number: from,
        provider: 'twilio',
      }, {
        onConflict: 'call_sid',
        ignoreDuplicates: false,
      })

    if (error) {
      console.error('[status-callback] Upsert error:', error)
    }

    // Mettre a jour le prospect (call_count, last_call_at)
    if (to) {
      await supabase
        .from('prospects')
        .update({
          call_count: supabase.rpc ? undefined : undefined, // sera fait via RPC plus tard
          last_call_at: new Date().toISOString(),
        })
        .eq('phone', to)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[status-callback] Error:', err)
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
