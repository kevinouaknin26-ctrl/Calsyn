/**
 * twilio-numbers — Gère les numéros Twilio (lister, chercher, acheter, supprimer).
 * Auth : JWT Supabase requis.
 *
 * Actions via query param ?action=
 *   - list     : liste les numéros du compte
 *   - search   : cherche des numéros disponibles (params: country, type, contains)
 *   - buy      : achète un numéro (body: { phoneNumber })
 *   - release  : supprime un numéro (body: { sid })
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://calsyn.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function twilioAuth() {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
  const token = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
  return { sid, token, header: 'Basic ' + btoa(`${sid}:${token}`) }
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
    const _jwtAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    )
    const _token = (authHeader || '').replace('Bearer ', '')
    const { data: { user }, error: authError } = await _jwtAdmin.auth.getUser(_token)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { sid: accountSid, header: authBasic } = twilioAuth()
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // ── LIST : numéros du compte ──
    if (action === 'list') {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=50`,
        { headers: { Authorization: authBasic } }
      )
      const data = await res.json()
      const numbers = (data.incoming_phone_numbers || []).map((n: any) => ({
        sid: n.sid,
        phone: n.phone_number,
        friendlyName: n.friendly_name,
        capabilities: n.capabilities,
        dateCreated: n.date_created,
        monthlyPrice: n.monthly_price || null,
      }))
      return new Response(JSON.stringify({ numbers }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── SEARCH : numéros disponibles ──
    if (action === 'search') {
      const country = url.searchParams.get('country') || 'FR'
      const type = url.searchParams.get('type') || 'mobile' // mobile, local, tollFree
      const contains = url.searchParams.get('contains') || ''
      const limit = url.searchParams.get('limit') || '10'

      const typeMap: Record<string, string> = {
        mobile: 'Mobile',
        local: 'Local',
        tollFree: 'TollFree',
      }
      const twilioType = typeMap[type] || 'Mobile'

      const params = new URLSearchParams({ PageSize: limit })
      if (contains) params.set('Contains', contains)

      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/${country}/${twilioType}.json?${params}`,
        { headers: { Authorization: authBasic } }
      )
      const data = await res.json()

      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.message || 'Search failed', numbers: [] }), {
          status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const numbers = (data.available_phone_numbers || []).map((n: any) => ({
        phone: n.phone_number,
        friendlyName: n.friendly_name,
        capabilities: n.capabilities,
        region: n.region,
        locality: n.locality,
        monthlyPrice: n.monthly_price || null,
      }))
      return new Response(JSON.stringify({ numbers }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── BUY : acheter un numéro ──
    if (action === 'buy') {
      const body = await req.json()
      const phoneNumber = body.phoneNumber
      if (!phoneNumber) {
        return new Response(JSON.stringify({ error: 'phoneNumber required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Configurer le TwiML App automatiquement
      const twimlAppSid = Deno.env.get('TWILIO_TWIML_APP_SID') || ''

      const formData = new URLSearchParams({
        PhoneNumber: phoneNumber,
        ...(twimlAppSid ? { VoiceApplicationSid: twimlAppSid } : {}),
      })

      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
        {
          method: 'POST',
          headers: { Authorization: authBasic, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        }
      )
      const data = await res.json()

      if (!res.ok) {
        return new Response(JSON.stringify({ error: data.message || 'Purchase failed' }), {
          status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({
        ok: true,
        number: {
          sid: data.sid,
          phone: data.phone_number,
          friendlyName: data.friendly_name,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── RELEASE : supprimer un numéro ──
    if (action === 'release') {
      const body = await req.json()
      const numberSid = body.sid
      if (!numberSid) {
        return new Response(JSON.stringify({ error: 'sid required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${numberSid}.json`,
        {
          method: 'DELETE',
          headers: { Authorization: authBasic },
        }
      )

      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}))
        return new Response(JSON.stringify({ error: (data as any).message || 'Release failed' }), {
          status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use: list, search, buy, release' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[twilio-numbers] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
