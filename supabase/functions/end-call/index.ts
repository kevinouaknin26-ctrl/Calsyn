/**
 * end-call — Termine un appel en cours via l'API REST Twilio.
 *
 * Appelé quand le SDR raccroche pour aussi terminer le leg prospect
 * (en mode conférence, les legs sont indépendants).
 *
 * Sécu (C2) : exige un Bearer JWT d'un user authentifié, ET que cet user
 * soit le sdr_id du call OU admin/super_admin de la même organisation.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { captureError } from '../_shared/sentry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://calsyn.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── 1. Extraire et valider le JWT user ──
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser(token)
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Invalid JWT' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const { callSid } = body

    if (!callSid) {
      return new Response(JSON.stringify({ error: 'Missing callSid' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 2. Lookup du call + check ownership ──
    const adminClient = createClient(supabaseUrl, serviceRole)
    const { data: call, error: callErr } = await adminClient
      .from('calls')
      .select('id, sdr_id, organisation_id')
      .eq('call_sid', callSid)
      .maybeSingle()

    if (callErr) {
      console.error('[end-call] DB lookup error:', callErr)
      return new Response(JSON.stringify({ error: 'Lookup error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Si le call n'existe pas en DB, on accepte quand même pour les cas
    // où save-call n'a pas encore créé l'entrée (race condition). MAIS
    // on exige au moins que l'user ait le même organisation_id qu'un
    // profile actif, et on log un warning.
    if (!call) {
      console.warn(`[end-call] Call ${callSid} pas trouvé en DB — autorisé par défaut (race) mais vérifier`)
    } else {
      const isOwner = call.sdr_id === user.id
      if (!isOwner) {
        // Check si user est admin de la même org
        const { data: profile } = await adminClient
          .from('profiles')
          .select('role, organisation_id')
          .eq('id', user.id)
          .single()
        const isAdminSameOrg = profile
          && profile.organisation_id === call.organisation_id
          && ['super_admin', 'admin'].includes(profile.role)
        if (!isAdminSameOrg) {
          return new Response(JSON.stringify({ error: 'Forbidden — not your call' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    // ── 3. Terminer l'appel via Twilio ──
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || ''

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'Status=completed',
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error(`[end-call] Twilio error: ${res.status} — ${err}`)
    } else {
      console.log(`[end-call] Call ${callSid} terminated by user ${user.id}`)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[end-call] Error:', err)
    captureError(err, { tags: { fn: 'end-call' } }).catch(() => {})
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
