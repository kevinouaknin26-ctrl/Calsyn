/**
 * recording-callback — Recoit l'URL de l'enregistrement quand il est pret.
 *
 * Actions :
 * 1. UPDATE calls SET recording_url (match via conference_sid ou call_sid)
 * 2. INSERT analysis_jobs (lance la queue d'analyse IA async)
 *
 * Note : en mode Conference, le payload contient ConferenceSid.
 * En mode Dial direct, il contient CallSid.
 * On gere les deux cas.
 *
 * Auth : Signature Twilio
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
    const conferenceSid = params.ConferenceSid || ''
    const recordingUrl = params.RecordingUrl || ''
    const recordingSid = params.RecordingSid || ''
    const recordingDuration = parseInt(params.RecordingDuration || '0', 10)

    console.log(`[recording-callback] Recording ready: ${recordingSid} (${recordingDuration}s)`)

    if (!recordingUrl) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    // Trouver le call via conference_sid ou call_sid
    let callId: string | null = null

    if (conferenceSid) {
      const { data } = await supabase
        .from('calls')
        .select('id')
        .eq('conference_sid', conferenceSid)
        .limit(1)
        .single()
      if (data) callId = data.id
    }

    if (!callId && callSid) {
      const { data } = await supabase
        .from('calls')
        .select('id')
        .eq('call_sid', callSid)
        .maybeSingle()
      if (data) callId = data.id
    }

    // Fallback : le recording est attaché au leg parent (SDR/inbound)
    // mais la DB a le leg child (prospect/outbound-dial).
    // Chercher le call le plus récent dans les 2 dernières minutes.
    if (!callId) {
      const twoMinAgo = new Date(Date.now() - 120000).toISOString()
      const { data } = await supabase
        .from('calls')
        .select('id')
        .gte('created_at', twoMinAgo)
        .is('recording_url', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) {
        callId = data.id
        console.log(`[recording-callback] Matched by recent call fallback: ${callId}`)
      }
    }

    if (!callId) {
      console.warn('[recording-callback] No matching call found for', { callSid, conferenceSid })
      return new Response(JSON.stringify({ ok: true, warning: 'no matching call' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update le call avec l'URL du recording
    const recordingUrlMp3 = recordingUrl.endsWith('.mp3') ? recordingUrl : recordingUrl + '.mp3'
    await supabase
      .from('calls')
      .update({ recording_url: recordingUrlMp3 })
      .eq('id', callId)

    // Creer le job d'analyse IA (queue async)
    const { error: jobError } = await supabase
      .from('analysis_jobs')
      .upsert({
        call_id: callId,
        status: 'pending',
        attempts: 0,
      }, {
        onConflict: 'call_id',
        ignoreDuplicates: true,
      })

    if (jobError) {
      console.error('[recording-callback] analysis_jobs insert error:', jobError)
    } else {
      console.log(`[recording-callback] Analysis job created for call ${callId}`)

      // Déclencher process-analysis immédiatement (fire & forget)
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
      fetch(`${supabaseUrl}/functions/v1/process-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ callId }),
      }).then(r => {
        console.log(`[recording-callback] process-analysis triggered: ${r.status}`)
      }).catch(err => {
        console.error('[recording-callback] process-analysis trigger failed:', err)
      })
    }

    return new Response(JSON.stringify({ ok: true, callId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[recording-callback] Error:', err)
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
