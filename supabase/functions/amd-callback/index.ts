/**
 * amd-callback — Reçoit le résultat AMD de Twilio (DetectMessageEnd).
 *
 * Timing Twilio avec DetectMessageEnd : le webhook est POSTé PILE quand la fin
 * de l'annonce répondeur est détectée (généralement au bip). C'est le moment
 * exact où la messagerie commence à enregistrer → fenêtre optimale pour poser
 * un voicemail drop.
 *
 * Flow voicemail drop :
 * - Si calls.pending_voicemail_url set (SDR a armé via le bouton voicemail) →
 *   modify TwiML <Play>+<Hangup/> immédiatement, clear pending, outcome=voicemail.
 * - Sinon si organisations.voicemail_drop + voicemail_audio_url → auto-drop
 *   (feature Minari historique).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { captureError } from '../_shared/sentry.ts'
import { verifyTwilioSignature } from '../_shared/twilio-signature.ts'

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

    if (!await verifyTwilioSignature(req, params)) {
      console.warn('[amd-callback] Invalid Twilio signature, rejecting')
      return new Response('Forbidden', { status: 403, headers: corsHeaders })
    }

    const callSid = params.CallSid || ''
    const answeredBy = params.AnsweredBy || 'unknown'
    const detectionDuration = parseInt(params.MachineDetectionDuration || '0', 10)

    console.log(`[amd-callback] ${callSid}: AnsweredBy=${answeredBy} (${detectionDuration}ms)`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    const { data: existingCall } = await supabase
      .from('calls')
      .select('id, call_outcome, call_duration, organisation_id, prospect_id, pending_voicemail_url')
      .eq('call_sid', callSid)
      .maybeSingle()

    const callStatus = params.CallStatus || ''
    const isActuallyAnswered = callStatus === 'in-progress' || callStatus === 'completed' ||
      (existingCall && existingCall.call_duration > 0)

    const isMachine = answeredBy.startsWith('machine') || answeredBy === 'fax'
    const isHuman = answeredBy === 'human'

    const updates: Record<string, unknown> = {
      amd_result: isMachine ? 'machine' : isHuman ? 'human' : 'unknown',
      amd_detected_at: new Date().toISOString(),
    }

    if (isMachine && isActuallyAnswered) {
      updates.call_outcome = 'voicemail'
      console.log(`[amd-callback] Machine confirmed → outcome=voicemail`)
    }

    await supabase.from('calls').update(updates).eq('call_sid', callSid)

    // ── Voicemail drop : priorité au pending armé par le SDR, sinon auto-org ──
    if (isMachine && isActuallyAnswered && existingCall) {
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
      const twilioAuth = 'Basic ' + btoa(`${accountSid}:${authToken}`)

      let audioUrl: string | null = existingCall.pending_voicemail_url || null
      let source = 'pending'

      if (!audioUrl && existingCall.organisation_id) {
        const { data: org } = await supabase
          .from('organisations')
          .select('voicemail_drop, voicemail_audio_url')
          .eq('id', existingCall.organisation_id)
          .single()
        if (org?.voicemail_drop && org?.voicemail_audio_url) {
          audioUrl = org.voicemail_audio_url
          source = 'org-auto'
        }
      }

      if (audioUrl) {
        // callSid ici = child leg (Twilio envoie amd-callback pour le leg prospect).
        // On modifie directement — pas besoin de chercher le parent.
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${audioUrl}</Play><Hangup/></Response>`
        const updateRes = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
          {
            method: 'POST',
            headers: {
              'Authorization': twilioAuth,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ Twiml: twiml }).toString(),
          }
        )

        if (updateRes.ok) {
          console.log(`[amd-callback] Voicemail drop posted (source=${source}) on ${callSid}`)
          if (source === 'pending') {
            await supabase
              .from('calls')
              .update({ pending_voicemail_url: null })
              .eq('call_sid', callSid)
          }
        } else {
          console.error(`[amd-callback] Voicemail drop failed: ${await updateRes.text()}`)
        }
      }
    }

    // ── Prospect : last_call_outcome = voicemail si machine ──
    if (isMachine && isActuallyAnswered && existingCall?.prospect_id) {
      const outcomePriority: Record<string, number> = {
        'connected': 100, 'callback': 60, 'not_interested': 50,
        'voicemail': 40, 'busy': 35, 'no_answer': 30,
        'cancelled': 20, 'failed': 10, 'wrong_number': 5,
      }
      const { data: prospect } = await supabase
        .from('prospects')
        .select('last_call_outcome')
        .eq('id', existingCall.prospect_id)
        .single()
      const currentPriority = outcomePriority[prospect?.last_call_outcome || ''] || 0
      const voicemailPriority = outcomePriority['voicemail'] || 0
      if (voicemailPriority >= currentPriority) {
        await supabase
          .from('prospects')
          .update({ last_call_outcome: 'voicemail' })
          .eq('id', existingCall.prospect_id)
      }
    }

    return new Response(JSON.stringify({ ok: true, answeredBy, isMachine }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[amd-callback] Error:', err)
    captureError(err, { tags: { fn: 'amd-callback' } }).catch(() => {})
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
