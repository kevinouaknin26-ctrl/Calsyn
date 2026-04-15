/**
 * token-gen — Genere un JWT Twilio Access Token pour le SDK browser.
 * Auth : JWT Supabase requis.
 * Le frontend appelle cette fonction pour obtenir un token avant d'initialiser le Device.
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
    // Verifier l'auth JWT Supabase
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const _jwtAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    )
    const _token = (authHeader || '').replace('Bearer ', '')
    const { data: { user }, error: authError } = await _jwtAdmin.auth.getUser(_token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generer le token Twilio
    const apiKeySid = Deno.env.get('TWILIO_API_KEY_SID') || ''
    const apiKeySecret = Deno.env.get('TWILIO_API_KEY_SECRET') || ''
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
    const twimlAppSid = Deno.env.get('TWILIO_TWIML_APP_SID') || ''

    if (!apiKeySid || !apiKeySecret || !accountSid) {
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const twilio = await import('https://esm.sh/twilio@5.5.1')
    const AccessToken = twilio.default.jwt.AccessToken
    const VoiceGrant = AccessToken.VoiceGrant

    const identity = `calsyn_${user.id.substring(0, 8)}`

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    })

    const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
      identity,
      ttl: 3600, // 1 heure
    })
    token.addGrant(voiceGrant)

    return new Response(JSON.stringify({ token: token.toJwt(), identity }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[token-gen] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
