/**
 * amd-callback — Reçoit le résultat AMD de Twilio.
 *
 * Twilio envoie ce webhook 2-3 secondes après le décroché avec :
 * - CallSid
 * - AnsweredBy : human | machine_start | machine_end_beep | machine_end_silence | machine_end_other | fax | unknown
 * - MachineDetectionDuration (ms)
 *
 * Actions :
 * - Si machine → update call_outcome = 'voicemail' + amd_result = 'machine'
 * - Si human → update amd_result = 'human' (call_outcome reste ce que status-callback a mis)
 * - Supabase Realtime propage le changement au frontend
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
    const answeredBy = params.AnsweredBy || 'unknown'
    const detectionDuration = parseInt(params.MachineDetectionDuration || '0', 10)

    console.log(`[amd-callback] ${callSid}: AnsweredBy=${answeredBy} (${detectionDuration}ms)`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    const isMachine = answeredBy.startsWith('machine') || answeredBy === 'fax'
    const isHuman = answeredBy === 'human'

    const updates: Record<string, unknown> = {
      amd_result: isMachine ? 'machine' : isHuman ? 'human' : 'unknown',
      amd_detected_at: new Date().toISOString(),
    }

    // Si machine → corriger le call_outcome
    if (isMachine) {
      updates.call_outcome = 'voicemail'
    }

    // Update le call par call_sid
    const { data: call, error } = await supabase
      .from('calls')
      .update(updates)
      .eq('call_sid', callSid)
      .select('id, prospect_id')
      .single()

    if (error) {
      console.error('[amd-callback] Update error:', error)
    }

    // Si machine → mettre à jour le prospect aussi (avec priorité)
    if (isMachine && call?.prospect_id) {
      const outcomePriority: Record<string, number> = {
        'connected': 100, 'callback': 60, 'not_interested': 50,
        'voicemail': 40, 'busy': 35, 'no_answer': 30,
        'cancelled': 20, 'failed': 10, 'wrong_number': 5,
      }

      const { data: prospect } = await supabase
        .from('prospects')
        .select('last_call_outcome')
        .eq('id', call.prospect_id)
        .single()

      const currentPriority = outcomePriority[prospect?.last_call_outcome || ''] || 0
      const voicemailPriority = outcomePriority['voicemail'] || 0

      // Ne downgrade pas si le prospect a déjà un meilleur statut
      if (voicemailPriority >= currentPriority) {
        await supabase
          .from('prospects')
          .update({ last_call_outcome: 'voicemail' })
          .eq('id', call.prospect_id)
      }

      console.log(`[amd-callback] Machine detected for ${callSid} — prospect updated`)
    }

    if (isHuman) {
      console.log(`[amd-callback] Human detected for ${callSid}`)
    }

    return new Response(JSON.stringify({ ok: true, answeredBy, isMachine }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[amd-callback] Error:', err)
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
