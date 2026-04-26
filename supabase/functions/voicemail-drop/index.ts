/**
 * voicemail-drop — Modifie le child call (leg prospect) avec <Play><Hangup/>.
 *
 * Pré-requis : Kevin clique APRÈS AMD machine_end_beep (bouton grisé avant).
 * La messagerie du prospect est prête à enregistrer dès que le Play démarre.
 *
 * Le child reçoit son propre TwiML → sort du <Dial> parent. Après le Play et
 * le Hangup, le child se termine. answerOnBridge=true du parent cascade le
 * hangup, ce qui libère le SDR (Kevin peut passer au suivant).
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

    // callSid reçu = PARENT (leg SDR). Cibler le CHILD (leg prospect).
    const childsRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json?ParentCallSid=${callSid}&Status=in-progress`,
      { headers: { Authorization: twilioAuth } }
    )
    const childsData = await childsRes.json()
    let childSid = (childsData?.calls?.[0]?.sid as string | undefined) || ''
    if (!childSid) {
      const anyRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json?ParentCallSid=${callSid}`,
        { headers: { Authorization: twilioAuth } }
      )
      const anyData = await anyRes.json()
      childSid = (anyData?.calls?.[0]?.sid as string | undefined) || ''
    }
    console.log(`[voicemail-drop] parent=${callSid} child=${childSid || 'NONE'}`)

    if (!childSid) {
      return new Response(JSON.stringify({ error: 'Child call not found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Marquer l'outcome avant que status-callback n'arrive pour l'écraser
    await admin
      .from('calls')
      .update({ call_outcome: 'voicemail' })
      .eq('call_sid', childSid)

    // Modify child → Play + Hangup
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
      console.error('[voicemail-drop] Twilio error:', data)
      return new Response(JSON.stringify({ error: data.message || 'Modify failed' }), {
        status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[voicemail-drop] Posted on child=${childSid}`)
    return new Response(JSON.stringify({ ok: true, childSid }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[voicemail-drop] Error:', err)
    captureError(err, { tags: { fn: 'voicemail-drop' } }).catch(() => {})
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
