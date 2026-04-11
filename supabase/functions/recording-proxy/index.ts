/**
 * recording-proxy — Proxy pour accéder aux recordings Twilio sans auth côté client.
 * Le client appelle /recording-proxy?url=... et cette fonction fetch le fichier avec les credentials Twilio.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const recordingUrl = url.searchParams.get('url')

    if (!recordingUrl || !recordingUrl.includes('twilio.com')) {
      return new Response('Missing or invalid url param', { status: 400, headers: corsHeaders })
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || ''

    const res = await fetch(recordingUrl, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      },
    })

    if (!res.ok) {
      return new Response(`Twilio error: ${res.status}`, { status: res.status, headers: corsHeaders })
    }

    const body = await res.arrayBuffer()

    return new Response(body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'inline',
      },
    })
  } catch (err) {
    console.error('[recording-proxy] Error:', err)
    return new Response('Internal error', { status: 500, headers: corsHeaders })
  }
})
