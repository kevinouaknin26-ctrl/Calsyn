/**
 * recording-sign — émet une URL signée pour lire un recording.
 *
 * Stratégie : on ingest le MP3 depuis Twilio dans Supabase Storage (bucket
 * `recordings` privé) au premier sign. Les sign suivants retournent directement
 * une signed URL Storage native, qui supporte les Range requests et permet
 * démarrage rapide + seek bar parfaite via le <audio> HTML.
 *
 * POST /functions/v1/recording-sign
 *   Headers: Authorization: Bearer <user_jwt>
 *   Body:    { recording_url: "https://api.twilio.com/.../Recordings/REXXXX" }
 *   Response 200: { url: "<storage_signed_url>", expires_at: <ts> }
 *
 * Fallback : si l'ingestion Storage échoue (ex. erreur Twilio temporaire), on
 * retourne l'ancienne signed URL HMAC vers recording-proxy pour ne pas casser
 * la lecture.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { corsHeaders } from '../_shared/cors.ts'
import { deriveSigningKey, signHex, RECORDING_SID_RE } from '../_shared/recording-signing.ts'
import { captureError } from '../_shared/sentry.ts'

const TTL_SECONDS = 10 * 60
const STORAGE_BUCKET = 'recordings'

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
  if (!token) return new Response('Unauthorized', { status: 401, headers: cors })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token)
  if (authErr || !user) return new Response('Invalid JWT', { status: 401, headers: cors })

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
  if (!m) return new Response('Invalid Twilio recording URL', { status: 400, headers: cors })
  const sid = m[1]
  if (!RECORDING_SID_RE.test(sid)) return new Response('Invalid recording SID', { status: 400, headers: cors })

  const adminClient = createClient(supabaseUrl, serviceRole)
  const { data: call, error: callErr } = await adminClient
    .from('calls')
    .select('id, sdr_id, organisation_id, recording_storage_path')
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

  // Ownership check
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
      return new Response('Forbidden', { status: 403, headers: cors })
    }
  }

  // ── Storage path : le déduit du SID ──
  const storagePath = call.recording_storage_path || `${sid}.mp3`

  // 1. Try Storage signed URL d'abord (rapide, déjà ingestée)
  if (call.recording_storage_path) {
    const { data: signed, error: sErr } = await adminClient
      .storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(call.recording_storage_path, TTL_SECONDS)
    if (signed?.signedUrl) {
      return new Response(JSON.stringify({
        url: signed.signedUrl,
        expires_at: Math.floor(Date.now() / 1000) + TTL_SECONDS,
      }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    console.warn(`[recording-sign] Storage signedUrl failed for ${call.recording_storage_path}:`, sErr)
  }

  // 2. Pas encore ingesté → download Twilio + upload Storage + UPDATE calls
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
    const twilioMp3 = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}.mp3`
    const twilioRes = await fetch(twilioMp3, {
      headers: { Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`) },
    })
    if (!twilioRes.ok) throw new Error(`Twilio fetch ${twilioRes.status}`)
    const audio = new Uint8Array(await twilioRes.arrayBuffer())

    const { error: upErr } = await adminClient
      .storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, audio, { contentType: 'audio/mpeg', upsert: true })
    if (upErr) throw new Error(`Storage upload: ${upErr.message}`)

    await adminClient
      .from('calls')
      .update({ recording_storage_path: storagePath })
      .eq('id', call.id)

    const { data: signed, error: sErr } = await adminClient
      .storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, TTL_SECONDS)
    if (!signed?.signedUrl) throw new Error(`Sign after upload: ${sErr?.message || 'no url'}`)

    return new Response(JSON.stringify({
      url: signed.signedUrl,
      expires_at: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err) {
    // 3. Fallback : ancienne signed URL HMAC vers le proxy (legacy)
    console.warn('[recording-sign] Storage ingest failed, fallback proxy:', err)
    captureError(err, { tags: { fn: 'recording-sign', stage: 'storage_ingest_fallback' }, level: 'warning', extra: { sid } }).catch(() => {})
    const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS
    const key = await deriveSigningKey()
    const sig = await signHex(key, `${sid}|${exp}`)
    const fallbackUrl =
      `${supabaseUrl}/functions/v1/recording-proxy`
      + `?sid=${encodeURIComponent(sid)}&exp=${exp}&sig=${sig}`
    return new Response(JSON.stringify({ url: fallbackUrl, expires_at: exp }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
