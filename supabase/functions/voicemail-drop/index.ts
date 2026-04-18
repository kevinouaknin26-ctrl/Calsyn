/**
 * voicemail-drop — Arme un voicemail drop sur le call actif.
 *
 * Flow (latence zéro) :
 * - Frontend envoie le PARENT call_sid (leg SDR via Twilio Device SDK)
 * - On identifie le CHILD call_sid (leg prospect) via Twilio API ParentCallSid
 * - UPDATE calls SET pending_voicemail_url = audioUrl, call_outcome = 'voicemail'
 *   WHERE call_sid = childSid (c'est cette row qui a le vrai prospect)
 * - amd-callback (qui reçoit le CHILD callSid depuis Twilio AMD) pose le TwiML
 *   <Play><Hangup/> pile au machine_end_beep
 * - Fallback : si AMD a déjà détecté machine avant l'armement, on modify direct
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://calsyn.app',
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

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    )
    const _token = (authHeader || '').replace('Bearer ', '')
    const { data: { user } } = await admin.auth.getUser(_token)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { callSid, audioUrl } = body

    if (!callSid || !audioUrl) {
      return new Response(JSON.stringify({ error: 'callSid and audioUrl required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
    const twilioAuth = 'Basic ' + btoa(`${accountSid}:${authToken}`)

    // 1. Identifier le child call_sid (leg prospect) via Twilio API
    const childsRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json?ParentCallSid=${callSid}&Status=in-progress`,
      { headers: { Authorization: twilioAuth } }
    )
    const childsData = await childsRes.json()
    let childSid = (childsData?.calls?.[0]?.sid as string | undefined) || ''
    if (!childSid) {
      const anyChildsRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json?ParentCallSid=${callSid}`,
        { headers: { Authorization: twilioAuth } }
      )
      const anyChildsData = await anyChildsRes.json()
      childSid = (anyChildsData?.calls?.[0]?.sid as string | undefined) || ''
    }
    console.log(`[voicemail-drop] parent=${callSid} child=${childSid || 'NONE'}`)

    if (!childSid) {
      return new Response(JSON.stringify({ error: 'No child call found (prospect leg not bridged yet)' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Armer le drop sur la row DB du child
    const { data: callRow } = await admin
      .from('calls')
      .select('amd_result, call_outcome')
      .eq('call_sid', childSid)
      .maybeSingle()

    await admin
      .from('calls')
      .update({ pending_voicemail_url: audioUrl, call_outcome: 'voicemail' })
      .eq('call_sid', childSid)

    // 3. Fallback immédiat : si AMD a déjà détecté machine, on pose le TwiML maintenant
    if (callRow?.amd_result === 'machine') {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${audioUrl}</Play><Hangup/></Response>`
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${childSid}.json`,
        {
          method: 'POST',
          headers: { Authorization: twilioAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ Twiml: twiml }).toString(),
        }
      )
      const data = await res.json()
      if (!res.ok) {
        console.error('[voicemail-drop] Fallback Twilio error:', data)
        return new Response(JSON.stringify({ error: data.message || 'Fallback failed' }), {
          status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      console.log(`[voicemail-drop] Fallback immediate drop on child=${childSid}`)
      await admin.from('calls').update({ pending_voicemail_url: null }).eq('call_sid', childSid)
      return new Response(JSON.stringify({ ok: true, fallback: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[voicemail-drop] Armed (AMD pending) for child=${childSid}`)
    return new Response(JSON.stringify({ ok: true, armed: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[voicemail-drop] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
