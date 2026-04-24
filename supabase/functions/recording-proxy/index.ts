/**
 * recording-proxy — relaie le fichier audio d'un recording Twilio au navigateur.
 *
 * Deux modes d'authentification (rétro-compatibles) :
 *
 * 1. Signed URL (recommandé, utilisé par <audio> et par tous les fetch côté front) :
 *      GET ?sid=REXXX&exp=<unix>&sig=<hmac_hex>
 *    Vérifie exp > now et HMAC-SHA256("sid|exp") == sig avec la clé dérivée de
 *    SERVICE_ROLE_KEY. Pas besoin de header Authorization — le <audio> natif
 *    peut donc charger l'URL directement.
 *
 * 2. Legacy Bearer (conservé pour compatibilité ascendante) :
 *      GET ?url=<twilio_recording_url>
 *      Headers: Authorization: Bearer <user_jwt>
 *    Vérifie le JWT, le Recording SID, l'ownership (sdr_id ou admin même org).
 *
 * Dans les deux modes, le proxy fetch l'audio depuis Twilio avec Basic auth
 * (ACCOUNT_SID:AUTH_TOKEN) et le stream au client.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { corsHeaders } from '../_shared/cors.ts'
import {
  deriveSigningKey,
  signHex,
  constantTimeEquals,
  RECORDING_SID_RE,
} from '../_shared/recording-signing.ts'

async function fetchTwilioAudio(
  twilioUrl: string,
  cors: Record<string, string>,
  rangeHeader?: string | null,
): Promise<Response> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || ''

  const upstreamHeaders: Record<string, string> = {
    'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
  }
  if (rangeHeader) upstreamHeaders['Range'] = rangeHeader

  const res = await fetch(twilioUrl, { headers: upstreamHeaders })

  if (!res.ok && res.status !== 206) {
    return new Response(`Twilio error: ${res.status}`, { status: res.status, headers: cors })
  }

  const responseHeaders: Record<string, string> = {
    ...cors,
    'Content-Type': 'audio/mpeg',
    'Content-Disposition': 'inline',
    'Cache-Control': 'private, max-age=600',
    'Accept-Ranges': 'bytes',
  }
  const contentLength = res.headers.get('content-length')
  const contentRange = res.headers.get('content-range')
  if (contentLength) responseHeaders['Content-Length'] = contentLength
  if (contentRange) responseHeaders['Content-Range'] = contentRange

  const body = await res.arrayBuffer()
  return new Response(body, { status: res.status, headers: responseHeaders })
}

serve(async (req) => {
  const cors = corsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const url = new URL(req.url)
    const sid = url.searchParams.get('sid')
    const exp = url.searchParams.get('exp')
    const sig = url.searchParams.get('sig')

    // ── Mode 1 : signed URL (HMAC) ──
    if (sid && exp && sig) {
      if (!RECORDING_SID_RE.test(sid)) {
        return new Response('Invalid sid', { status: 400, headers: cors })
      }
      const expNum = Number(exp)
      if (!Number.isFinite(expNum)) {
        return new Response('Invalid exp', { status: 400, headers: cors })
      }
      const now = Math.floor(Date.now() / 1000)
      if (expNum < now) {
        return new Response('Signed URL expired', { status: 410, headers: cors })
      }

      const key = await deriveSigningKey()
      const expected = await signHex(key, `${sid}|${exp}`)
      if (!constantTimeEquals(expected, sig)) {
        return new Response('Invalid signature', { status: 401, headers: cors })
      }

      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}.mp3`
      return await fetchTwilioAudio(twilioUrl, cors, req.headers.get('range'))
    }

    // ── Mode 2 : legacy Bearer + ?url= ──
    const authHeader = req.headers.get('authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) {
      return new Response('Unauthorized', { status: 401, headers: cors })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token)
    if (authErr || !user) {
      return new Response('Invalid JWT', { status: 401, headers: cors })
    }

    const recordingUrl = url.searchParams.get('url')
    if (!recordingUrl || !recordingUrl.includes('twilio.com')) {
      return new Response('Missing or invalid url param', { status: 400, headers: cors })
    }

    const match = recordingUrl.match(/\/Recordings\/(RE[a-f0-9]+)/i)
    if (!match) {
      return new Response('Invalid Twilio recording URL', { status: 400, headers: cors })
    }
    const recordingSid = match[1]

    const adminClient = createClient(supabaseUrl, serviceRole)
    const { data: call, error: callErr } = await adminClient
      .from('calls')
      .select('id, sdr_id, organisation_id')
      .ilike('recording_url', `%${recordingSid}%`)
      .maybeSingle()

    if (callErr) {
      console.error('[recording-proxy] DB lookup error:', callErr)
      return new Response('Lookup error', { status: 500, headers: cors })
    }
    if (!call) {
      console.warn(`[recording-proxy] Recording ${recordingSid} not found in DB — denied`)
      return new Response('Not found', { status: 404, headers: cors })
    }

    const isOwner = call.sdr_id === user.id
    if (!isOwner) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('role, organisation_id')
        .eq('id', user.id)
        .single()
      const isAdminSameOrg = profile
        && profile.organisation_id === call.organisation_id
        && ['super_admin', 'admin', 'manager'].includes(profile.role)
      if (!isAdminSameOrg) {
        console.warn(`[recording-proxy] Forbidden: user ${user.id} tried to access call ${call.id} (sdr=${call.sdr_id})`)
        return new Response('Forbidden', { status: 403, headers: cors })
      }
    }

    return await fetchTwilioAudio(recordingUrl, cors, req.headers.get('range'))
  } catch (err) {
    console.error('[recording-proxy] Error:', err)
    return new Response('Internal error', { status: 500, headers: cors })
  }
})
