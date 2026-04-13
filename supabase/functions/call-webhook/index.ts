/**
 * call-webhook — TwiML pour appels sortants.
 *
 * MVP MONO-LINE : <Dial><Number> direct.
 * Le SDR appelle, Twilio bridge vers le prospect. Quand l'un raccroche, l'autre aussi.
 * Recording via record="record-from-answer-dual" sur le Dial.
 *
 * V2.1 PARALLEL : passera en Conference double-leg.
 *
 * ULTRA LEGER : zero import lourd, zero DB.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }})
  }

  try {
    const contentType = req.headers.get('content-type') || ''
    let params: Record<string, string> = {}

    if (contentType.includes('form-urlencoded')) {
      const text = await req.text()
      params = Object.fromEntries(new URLSearchParams(text).entries())
    } else if (contentType.includes('json')) {
      params = await req.json()
    }

    const to = params.To || ''
    const from = params.From || params.Caller || ''

    // Mode conférence : si un paramètre 'conference' ou 'ConferenceId' est passé
    // - Depuis initiate-call (prospect) : ?conference=name dans l'URL
    // - Depuis device.connect (SDR) : ConferenceId dans le body params
    const url = new URL(req.url)
    const conferenceName = url.searchParams.get('conference') || params.conference || params.ConferenceId || ''

    if (conferenceName) {
      // Mode AMD : le prospect rejoint la conférence (l'appel a été créé par initiate-call)
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="false"
      startConferenceOnEnter="true"
      endConferenceOnExit="true"
      record="record-from-start"
      recordingStatusCallback="${SUPABASE_URL}/functions/v1/recording-callback"
      recordingStatusCallbackMethod="POST"
      statusCallback="${SUPABASE_URL}/functions/v1/status-callback"
      statusCallbackEvent="start end join leave">
      ${conferenceName}
    </Conference>
  </Dial>
</Response>`
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } })
    }

    // Mode legacy : Dial direct (SDR appelle via device.connect sans AMD)
    if (!to) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination number</Say></Response>`, {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Passer le prospectId/Name dans l'URL du statusCallback
    // pour que status-callback associe l'appel au bon prospect (même numéro dans plusieurs listes)
    const prospectId = params.ProspectId || ''
    const prospectName = params.ProspectName || ''
    // IMPORTANT: & → &amp; pour XML valide dans les attributs TwiML
    const statusCbUrl = `${SUPABASE_URL}/functions/v1/status-callback?prospectId=${encodeURIComponent(prospectId)}&amp;prospectName=${encodeURIComponent(prospectName)}`

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${from}"
    answerOnBridge="true"
    record="record-from-answer-dual"
    recordingStatusCallback="${SUPABASE_URL}/functions/v1/recording-callback"
    recordingStatusCallbackMethod="POST"
    timeout="30">
    <Number
      statusCallbackEvent="initiated ringing answered completed"
      statusCallback="${statusCbUrl}"
      statusCallbackMethod="POST">
      ${to}
    </Number>
  </Dial>
</Response>`

    return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('[call-webhook] Error:', err)
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred</Say></Response>`, {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
})
