/**
 * initiate-call — Crée un appel sortant via l'API REST Twilio avec AMD.
 *
 * Remplace l'initiation côté client (device.connect).
 * Le SDR reste connecté via le Voice SDK (audio browser), mais l'appel
 * vers le prospect est créé côté serveur pour activer l'AMD.
 *
 * Flow :
 * 1. Frontend POST { to, from, prospectId, prospectName, conferenceName }
 * 2. On crée l'appel REST Twilio avec MachineDetection + AsyncAmd
 * 3. Twilio appelle le prospect → TwiML Conference
 * 4. AMD tourne en background → webhook amd-callback
 * 5. Le SDR rejoint la même conférence via device.connect()
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { to, from, prospectId, prospectName, conferenceName } = body

    if (!to || !from) {
      return new Response(JSON.stringify({ error: 'Missing to or from' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''

    // Générer un nom de conférence unique si pas fourni
    const confName = conferenceName || `callio_${user.id}_${Date.now()}`

    // Service role pour créer le call en DB
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    // Chercher le profile pour l'org_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, organisation_id')
      .eq('id', user.id)
      .single()

    // ── Créer l'appel prospect via API REST Twilio avec AMD ──
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`

    // TwiML URL : le prospect rejoint la conférence
    const twimlUrl = `${supabaseUrl}/functions/v1/call-webhook?conference=${encodeURIComponent(confName)}&prospectId=${encodeURIComponent(prospectId || '')}&prospectName=${encodeURIComponent(prospectName || '')}`

    const formData = new URLSearchParams({
      To: to,
      From: from,
      Url: twimlUrl,
      // AMD — Answering Machine Detection
      MachineDetection: 'Enable',
      MachineDetectionTimeout: '3',
      AsyncAmd: 'true',
      AsyncAmdStatusCallback: `${supabaseUrl}/functions/v1/amd-callback`,
      AsyncAmdStatusCallbackMethod: 'POST',
      // Status callbacks
      StatusCallback: `${supabaseUrl}/functions/v1/status-callback`,
      StatusCallbackEvent: 'initiated ringing answered completed',
      StatusCallbackMethod: 'POST',
      // Recording
      Record: 'true',
      RecordingStatusCallback: `${supabaseUrl}/functions/v1/recording-callback`,
      RecordingStatusCallbackMethod: 'POST',
      RecordingChannels: 'dual',
      // Timeout
      Timeout: '30',
    })

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    if (!twilioRes.ok) {
      const err = await twilioRes.text()
      console.error('[initiate-call] Twilio error:', err)
      return new Response(JSON.stringify({ error: `Twilio error: ${twilioRes.status}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const twilioData = await twilioRes.json()
    const callSid = twilioData.sid

    console.log(`[initiate-call] Call created: ${callSid} → ${to} (conference: ${confName})`)

    // Pré-créer le call en DB avec amd_result = pending
    const { error: insertErr } = await supabase.from('calls').insert({
      call_sid: callSid,
      prospect_phone: to,
      prospect_name: prospectName || null,
      prospect_id: prospectId || null,
      from_number: from,
      organisation_id: profile?.organisation_id || null,
      sdr_id: user.id,
      provider: 'twilio',
      call_outcome: 'no_answer', // default, sera mis à jour par status-callback/amd-callback
      amd_result: 'pending',
    })

    if (insertErr) {
      console.error('[initiate-call] DB insert error:', insertErr)
    }

    return new Response(JSON.stringify({
      ok: true,
      callSid,
      conferenceName: confName,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[initiate-call] Error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
