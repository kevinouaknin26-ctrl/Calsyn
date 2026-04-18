/**
 * voicemail-drop — Arme un voicemail drop sur le call actif.
 *
 * Mécanisme propre (zéro latence) :
 * - Update calls.pending_voicemail_url = audioUrl
 * - amd-callback pose automatiquement le TwiML <Play>+<Hangup/> sur le leg prospect
 *   pile quand Twilio détecte machine_end_beep (pas de round-trip frontend)
 * - Si amd_result='machine' est DÉJÀ posé (Kevin arme tardivement), on pose le
 *   TwiML immédiatement en fallback
 *
 * Body JSON : { callSid (parent SDR), audioUrl }
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

    // 1. Armer le drop : amd-callback le posera automatiquement au machine_end_beep
    const { data: callRow } = await admin
      .from('calls')
      .select('amd_result, call_outcome')
      .eq('call_sid', callSid)
      .maybeSingle()

    await admin
      .from('calls')
      .update({ pending_voicemail_url: audioUrl })
      .eq('call_sid', callSid)

    // Mettre déjà le call_outcome à voicemail pour que status-callback ne l'écrase pas
    await admin
      .from('calls')
      .update({ call_outcome: 'voicemail' })
      .eq('call_sid', callSid)

    // 2. Si AMD a déjà détecté la machine AVANT le click, on pose le TwiML
    //    immédiatement (fallback) en plus d'armer. Double sécurité idempotente
    //    — si amd-callback re-tire plus tard, le modify Twilio retournera juste
    //    un no-op car le call sera déjà terminé.
    if (callRow?.amd_result === 'machine') {
      const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || ''
      const authToken = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
      const twilioAuth = 'Basic ' + btoa(`${accountSid}:${authToken}`)

      // callSid reçu = leg SDR (parent). Cibler le child (leg prospect).
      const childsRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json?ParentCallSid=${callSid}&Status=in-progress`,
        { headers: { Authorization: twilioAuth } }
      )
      const childsData = await childsRes.json()
      const targetSid = (childsData?.calls?.[0]?.sid as string | undefined) || callSid

      const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${audioUrl}</Play><Hangup/></Response>`
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${targetSid}.json`,
        {
          method: 'POST',
          headers: { Authorization: twilioAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ Twiml: twiml }).toString(),
        }
      )
      const data = await res.json()
      if (!res.ok) console.error('[voicemail-drop] Fallback Twilio error:', data)
      else console.log('[voicemail-drop] Fallback immediate drop on child:', targetSid)

      // Clear le pending (on vient de poser)
      await admin.from('calls').update({ pending_voicemail_url: null }).eq('call_sid', callSid)
    } else {
      console.log('[voicemail-drop] Armed (AMD pending) for', callSid)
    }

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
