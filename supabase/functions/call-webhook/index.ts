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

    if (!to) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination number</Say></Response>`, {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Mono-line : Dial direct avec recording
    // AMD est gere par process-analysis (detection messagerie par transcription)
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
      statusCallback="${SUPABASE_URL}/functions/v1/status-callback"
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
