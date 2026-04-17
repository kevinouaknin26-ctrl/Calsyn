/**
 * recording-proxy — Proxy pour accéder aux recordings Twilio sans auth côté client.
 *
 * Sécu (C3) : avant de relayer le fichier, on :
 *   1. Vérifie le JWT Bearer (user authentifié)
 *   2. Extrait le Recording SID de l'URL
 *   3. Lookup dans calls → vérifie que user.id = sdr_id OU admin même org
 *
 * Sans ces checks, n'importe qui avec une URL Twilio pouvait écouter
 * n'importe quel audio (même d'un autre user / org).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://calsyn.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── 1. JWT user ──
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token)
  if (authErr || !user) {
    return new Response('Invalid JWT', { status: 401, headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const recordingUrl = url.searchParams.get('url')

    if (!recordingUrl || !recordingUrl.includes('twilio.com')) {
      return new Response('Missing or invalid url param', { status: 400, headers: corsHeaders })
    }

    // ── 2. Extraire le Recording SID (format /Recordings/REXXXXX...) ──
    const match = recordingUrl.match(/\/Recordings\/(RE[a-f0-9]+)/i)
    if (!match) {
      return new Response('Invalid Twilio recording URL', { status: 400, headers: corsHeaders })
    }
    const recordingSid = match[1]

    // ── 3. Lookup du call via recording_url LIKE + ownership check ──
    const adminClient = createClient(supabaseUrl, serviceRole)
    const { data: call, error: callErr } = await adminClient
      .from('calls')
      .select('id, sdr_id, organisation_id')
      .ilike('recording_url', `%${recordingSid}%`)
      .maybeSingle()

    if (callErr) {
      console.error('[recording-proxy] DB lookup error:', callErr)
      return new Response('Lookup error', { status: 500, headers: corsHeaders })
    }

    if (!call) {
      // Recording non-tracké → refuser (jamais valide)
      console.warn(`[recording-proxy] Recording ${recordingSid} not found in DB — denied`)
      return new Response('Not found', { status: 404, headers: corsHeaders })
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
        return new Response('Forbidden', { status: 403, headers: corsHeaders })
      }
    }

    // ── 4. Fetch audio depuis Twilio ──
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
