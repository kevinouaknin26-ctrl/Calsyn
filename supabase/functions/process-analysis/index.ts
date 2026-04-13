/**
 * process-analysis — Worker async pour transcription + analyse IA.
 *
 * Declenche par pg_cron toutes les 10s (ou manuellement).
 * Lit 1 job pending dans analysis_jobs, le traite, met a jour calls.
 *
 * Pipeline : recording_url → Deepgram (transcription) → Claude (analyse) → UPDATE calls
 *
 * Auth : Internal (service_role via pg_cron POST)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Deepgram transcription (R17 — instantane, pas de polling) ──────
async function transcribe(audioUrl: string): Promise<{ text: string; utterances: Array<{ speaker: number; text: string }> }> {
  const dgKey = Deno.env.get('DEEPGRAM_API_KEY')
  if (!dgKey) throw new Error('DEEPGRAM_API_KEY not configured')

  // Twilio recordings need Basic Auth — download the audio first then send raw bytes to Deepgram
  const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
  const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
  const isTwilioUrl = audioUrl.includes('api.twilio.com') || audioUrl.includes('recordings')

  let audioBody: BodyInit
  let contentType: string

  if (isTwilioUrl && twilioSid && twilioToken) {
    console.log('[process-analysis] Downloading audio from Twilio with auth...')
    const audioRes = await fetch(audioUrl, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`),
      },
    })
    if (!audioRes.ok) throw new Error(`Twilio download error (${audioRes.status})`)
    audioBody = await audioRes.arrayBuffer()
    contentType = 'audio/mpeg'
  } else {
    // URL publique — envoyer l'URL directement
    audioBody = JSON.stringify({ url: audioUrl })
    contentType = 'application/json'
  }

  const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=fr&diarize=true&punctuate=true&utterances=true&multichannel=true', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${dgKey}`,
      'Content-Type': contentType,
    },
    body: audioBody,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Deepgram error (${res.status}): ${err}`)
  }

  const data = await res.json()
  const channels = data.results?.channels || []

  // Multichannel : combiner les transcriptions des 2 canaux (SDR + prospect)
  let transcript = ''
  const utterances: Array<{ speaker: number; text: string }> = []

  if (channels.length >= 2) {
    // Channel 0 = SDR, Channel 1 = prospect (Twilio dual-channel)
    const ch0 = channels[0]?.alternatives?.[0]?.transcript || ''
    const ch1 = channels[1]?.alternatives?.[0]?.transcript || ''
    transcript = `Commercial: ${ch0}\nProspect: ${ch1}`

    // Utiliser les utterances multichannel si disponibles
    const multiUtterances = data.results?.utterances || []
    if (multiUtterances.length > 0) {
      for (const u of multiUtterances) {
        utterances.push({ speaker: u.channel || u.speaker || 0, text: u.transcript })
      }
    } else {
      // Fallback : 2 utterances simples
      if (ch0) utterances.push({ speaker: 0, text: ch0 })
      if (ch1) utterances.push({ speaker: 1, text: ch1 })
    }
  } else {
    // Single channel fallback
    transcript = channels[0]?.alternatives?.[0]?.transcript || ''
    const singleUtterances = data.results?.utterances || []
    for (const u of singleUtterances) {
      utterances.push({ speaker: u.speaker || 0, text: u.transcript })
    }
  }

  return { text: transcript, utterances }
}

// ── Claude analyse (R18 — structured output) ───────────────────────
async function analyze(transcript: string): Promise<any> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `Tu es un coach commercial expert en prospection téléphonique B2B. Analyse cette transcription d'appel et retourne UNIQUEMENT un JSON valide :
{
  "resume": "Un paragraphe de 2-3 phrases résumant l'appel : qui a appelé qui, le sujet, ce qui s'est passé, et le résultat.",
  "summary": ["point clé 1", "point clé 2", "point clé 3"],
  "score_global": <0-100>,
  "score_accroche": <0-100>,
  "score_objection": <0-100>,
  "score_closing": <0-100>,
  "points_forts": ["ce que le commercial a bien fait"],
  "points_amelioration": ["ce qu'il pourrait améliorer"],
  "intention_prospect": "intéressé / pas intéressé / à rappeler / indécis",
  "prochaine_etape": "action recommandée pour le prochain contact"
}`,
      messages: [{ role: 'user', content: `Transcription :\n\n${transcript}` }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error (${res.status}): ${err}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || ''

  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('Failed to parse Claude response')
  }
}

// ── Main ────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  )

  try {
    // Prendre le job pending le plus ancien
    const { data: job, error: jobError } = await supabase
      .from('analysis_jobs')
      .select('id, call_id, attempts')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (jobError || !job) {
      return new Response(JSON.stringify({ ok: true, message: 'No pending jobs' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Marquer comme processing
    await supabase.from('analysis_jobs').update({
      status: 'processing',
      attempts: job.attempts + 1,
    }).eq('id', job.id)

    // Recuperer le recording_url + durée
    const { data: call } = await supabase
      .from('calls')
      .select('recording_url, call_duration')
      .eq('id', job.call_id)
      .single()

    // Skip transcription si durée < 20 secondes (Minari rule)
    // Ne PAS auto-corriger les 8-20s en voicemail — status-callback/save-call gèrent déjà le seuil 8s
    if (call && call.call_duration < 20) {

      await supabase.from('analysis_jobs').update({ status: 'completed' }).eq('id', job.id)
      await supabase.from('calls').update({ ai_analysis_status: 'completed' }).eq('id', job.call_id)

      console.log(`[process-analysis] Skipped: call ${job.call_id} duration ${call.call_duration}s < 20s`)
      return new Response(JSON.stringify({ ok: true, skipped: 'duration < 20s' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!call?.recording_url) {
      await supabase.from('analysis_jobs').update({
        status: 'error',
        error_message: 'No recording URL',
      }).eq('id', job.id)

      await supabase.from('calls').update({
        ai_analysis_status: 'completed',
      }).eq('id', job.call_id)

      return new Response(JSON.stringify({ ok: true, skipped: 'no recording' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Transcrire
    console.log(`[process-analysis] Transcribing call ${job.call_id}...`)
    const { text: transcript, utterances } = await transcribe(call.recording_url)
    console.log(`[process-analysis] Transcript: ${transcript.length} chars, ${utterances.length} utterances`)

    // Formater la transcription avec speakers
    const formattedTranscript = utterances.length > 0
      ? utterances.map(u => `Speaker ${u.speaker}: ${u.text}`).join('\n')
      : transcript

    // ── Detection messagerie par contenu de transcription ──
    const vmKeywords = [
      'messagerie', 'laissez un message', 'laisser un message', 'après le bip',
      'après le signal', 'boîte vocale', 'pas disponible', 'n\'est pas disponible',
      'rappeler ultérieurement', 'rappeler plus tard', 'votre correspondant',
      'répondeur', 'veuillez laisser', 'enregistrez votre message',
      'ce correspondant', 'actuellement indisponible', 'absence',
    ]
    const transcriptLower = formattedTranscript.toLowerCase()
    const isVoicemail = vmKeywords.some(kw => transcriptLower.includes(kw))

    if (isVoicemail) {
      console.log(`[process-analysis] Voicemail detected for call ${job.call_id} — auto-correcting status`)
      // Corriger le statut de l'appel et du prospect
      const { data: callData } = await supabase.from('calls').select('prospect_id, call_outcome').eq('id', job.call_id).single()
      if (callData && callData.call_outcome !== 'voicemail') {
        await supabase.from('calls').update({ call_outcome: 'voicemail' }).eq('id', job.call_id)
        if (callData.prospect_id) {
          // La transcription IA fait foi — corriger même si "connected" (faux connected = messagerie longue)
          // Ne pas downgrade seulement si meeting_booked/callback/rdv_pris (actions humaines volontaires)
          const { data: prospect } = await supabase.from('prospects').select('last_call_outcome').eq('id', callData.prospect_id).single()
          const humanStatuses = ['meeting_booked', 'rdv_pris', 'callback']
          if (prospect && !humanStatuses.includes(prospect.last_call_outcome || '')) {
            await supabase.from('prospects').update({ last_call_outcome: 'voicemail' }).eq('id', callData.prospect_id)
          }
        }
      }
    }

    // Analyser (sauf si messagerie — pas besoin de coaching)
    let analysis: any
    if (isVoicemail) {
      analysis = {
        summary: ['Messagerie vocale détectée automatiquement'],
        score_global: null, score_accroche: null, score_objection: null, score_closing: null,
        points_forts: [], points_amelioration: [],
        intention_prospect: 'Messagerie', prochaine_etape: 'Rappeler',
      }
      console.log(`[process-analysis] Skipping Claude analysis (voicemail)`)
    } else {
      console.log(`[process-analysis] Analyzing with Claude...`)
      analysis = await analyze(formattedTranscript)
      console.log(`[process-analysis] Score: ${analysis.score_global}`)
    }

    // Sauvegarder
    await supabase.from('calls').update({
      ai_transcript: formattedTranscript,
      ai_summary: analysis.resume ? [analysis.resume, ...(analysis.summary || [])] : analysis.summary,
      ai_score_global: analysis.score_global,
      ai_score_accroche: analysis.score_accroche,
      ai_score_objection: analysis.score_objection,
      ai_score_closing: analysis.score_closing,
      ai_points_forts: analysis.points_forts,
      ai_points_amelioration: analysis.points_amelioration,
      ai_intention_prospect: analysis.intention_prospect,
      ai_prochaine_etape: analysis.prochaine_etape,
      ai_analysis_status: 'completed',
      ai_analyzed_at: new Date().toISOString(),
    }).eq('id', job.call_id)

    await supabase.from('analysis_jobs').update({
      status: 'completed',
      raw_output: analysis,
      completed_at: new Date().toISOString(),
    }).eq('id', job.id)

    return new Response(JSON.stringify({
      ok: true,
      callId: job.call_id,
      score: analysis.score_global,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[process-analysis] Error:', err)

    // Remettre le job en pending si < 3 tentatives
    try {
      const { data: failedJob } = await supabase
        .from('analysis_jobs')
        .select('id, call_id, attempts')
        .eq('status', 'processing')
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (failedJob) {
        if (failedJob.attempts >= 3) {
          await supabase.from('analysis_jobs').update({
            status: 'error',
            error_message: (err as Error).message,
          }).eq('id', failedJob.id)

          await supabase.from('calls').update({
            ai_analysis_status: 'error',
          }).eq('id', failedJob.call_id)
        } else {
          await supabase.from('analysis_jobs').update({
            status: 'pending',
          }).eq('id', failedJob.id)
        }
      }
    } catch {}

    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
