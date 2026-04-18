/**
 * voicemail-drop — Dépose un message vocal pré-enregistré sur la messagerie du prospect.
 *
 * Mécanisme : modifie l'appel Twilio en cours pour jouer un audio puis raccrocher.
 * Le SDR est libéré immédiatement (son leg se termine), le message continue de jouer.
 *
 * Body JSON : { callSid, audioUrl }
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

    // Le callSid reçu = leg SDR (parent). Pour jouer l'audio au PROSPECT,
    // il faut cibler le leg enfant (<Dial><Number>) via ParentCallSid.
    const childsRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json?ParentCallSid=${callSid}&Status=in-progress`,
      { headers: { Authorization: twilioAuth } }
    )
    const childsData = await childsRes.json()
    let targetSid = (childsData?.calls?.[0]?.sid as string | undefined) || ''

    // Fallback : si pas encore in-progress, prendre n'importe quel child actif
    if (!targetSid) {
      const anyChildsRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json?ParentCallSid=${callSid}`,
        { headers: { Authorization: twilioAuth } }
      )
      const anyChildsData = await anyChildsRes.json()
      targetSid = (anyChildsData?.calls?.[0]?.sid as string | undefined) || callSid
      console.log('[voicemail-drop] fallback target:', targetSid, 'parent:', callSid)
    }

    console.log('[voicemail-drop] parent:', callSid, 'targeting child:', targetSid)

    // Modifier le leg prospect : jouer l'audio puis raccrocher.
    // <Pause length="2"> absorbe la latence Twilio (1-3s entre API modify et
    // Play effectif). Sans ça, la messagerie du prospect rate le début du WAV.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="2"/><Play>${audioUrl}</Play><Hangup/></Response>`

    const formData = new URLSearchParams({
      Twiml: twiml,
    })

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${targetSid}.json`,
      {
        method: 'POST',
        headers: { Authorization: twilioAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      }
    )

    const data = await res.json()

    if (!res.ok) {
      console.error('[voicemail-drop] Twilio error:', data)
      return new Response(JSON.stringify({ error: data.message || 'Failed' }), {
        status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[voicemail-drop] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
