/**
 * twilio-numbers — Gère les numéros Twilio (lister, acheter).
 * Auth : JWT Supabase requis.
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // ── Lister les numéros du compte ──
    if (action === 'list') {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=50`,
        { headers: { Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`) } }
      )
      const data = await res.json()
      const numbers = (data.incoming_phone_numbers || []).map((n: any) => ({
        sid: n.sid,
        phone: n.phone_number,
        friendlyName: n.friendly_name,
        capabilities: n.capabilities,
      }))
      return new Response(JSON.stringify({ numbers }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[twilio-numbers] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
