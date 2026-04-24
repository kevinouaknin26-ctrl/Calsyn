/**
 * recording-sign — émet une URL signée courte pour lire un recording Twilio.
 *
 * Pourquoi : le <audio> HTML natif ne peut pas envoyer de header Authorization,
 * donc le proxy protégé par JWT Bearer n'était pas utilisable depuis le player.
 * Ici on fait le check JWT + ownership côté serveur puis on retourne une URL
 * signée (HMAC) valide 10 min que le <audio> peut consommer directement.
 *
 * POST /functions/v1/recording-sign
 *   Headers: Authorization: Bearer <user_jwt>
 *   Body:    { recording_url: "https://api.twilio.com/.../Recordings/REXXXX" }
 *   Response 200: { url: "<SUPABASE>/functions/v1/recording-proxy?sid=...&exp=...&sig=...", expires_at: <ts> }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { corsHeaders } from '../_shared/cors.ts'
import { deriveSigningKey, signHex, RECORDING_SID_RE } from '../_shared/recording-signing.ts'

const TTL_SECONDS = 10 * 60

serve(async (req) => {
  const cors = corsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors })
  }

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

  let body: { recording_url?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: cors })
  }

  const recordingUrl = body.recording_url || ''
  if (!recordingUrl.includes('twilio.com')) {
    return new Response('Invalid recording URL', { status: 400, headers: cors })
  }
  const m = recordingUrl.match(/\/Recordings\/(RE[a-f0-9]+)/i)
  if (!m) {
    return new Response('Invalid Twilio recording URL', { status: 400, headers: cors })
  }
  const sid = m[1]
  if (!RECORDING_SID_RE.test(sid)) {
    return new Response('Invalid recording SID', { status: 400, headers: cors })
  }

  const adminClient = createClient(supabaseUrl, serviceRole)
  const { data: call, error: callErr } = await adminClient
    .from('calls')
    .select('id, sdr_id, organisation_id')
    .ilike('recording_url', `%${sid}%`)
    .maybeSingle()

  if (callErr) {
    console.error('[recording-sign] DB lookup error:', callErr)
    return new Response('Lookup error', { status: 500, headers: cors })
  }
  if (!call) {
    console.warn(`[recording-sign] Recording ${sid} not found — denied`)
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
      console.warn(`[recording-sign] Forbidden: user ${user.id} on call ${call.id}`)
      return new Response('Forbidden', { status: 403, headers: cors })
    }
  }

  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS
  const key = await deriveSigningKey()
  const sig = await signHex(key, `${sid}|${exp}`)

  const signedUrl =
    `${supabaseUrl}/functions/v1/recording-proxy`
    + `?sid=${encodeURIComponent(sid)}`
    + `&exp=${exp}`
    + `&sig=${sig}`

  return new Response(JSON.stringify({ url: signedUrl, expires_at: exp }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
