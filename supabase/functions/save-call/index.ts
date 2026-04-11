/**
 * save-call — Sauvegarde la disposition et les notes du SDR apres un appel.
 *
 * Appele par le frontend quand le SDR clique "Sauvegarder".
 * Met a jour le call existant (cree par status-callback) avec la disposition.
 *
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

    // Body
    const body = await req.json()
    const { callSid, conferenceSid, prospectId, prospectName, prospectPhone, duration, disposition, notes, meetingBooked } = body

    // Service role pour ecriture
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

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Chercher le call existant (cree par status-callback) ou en creer un nouveau
    let callId: string | null = null

    if (callSid) {
      const { data } = await supabase.from('calls').select('id').eq('call_sid', callSid).single()
      if (data) callId = data.id
    }
    if (!callId && conferenceSid) {
      const { data } = await supabase.from('calls').select('id').eq('conference_sid', conferenceSid).single()
      if (data) callId = data.id
    }

    const callData = {
      call_outcome: disposition,
      note: notes || '',
      meeting_booked: meetingBooked || false,
      call_duration: duration || 0,
      sdr_id: user.id,
      organisation_id: profile.organisation_id,
      prospect_id: prospectId,
      prospect_name: prospectName || null,
      prospect_phone: prospectPhone || null,
    }

    if (callId) {
      // Update le call existant
      const { error } = await supabase.from('calls').update(callData).eq('id', callId)
      if (error) throw error
    } else {
      // Creer un nouveau call (cas ou le webhook n'a pas encore fire)
      const { data: newCall, error } = await supabase.from('calls').insert({
        ...callData,
        call_sid: callSid,
        conference_sid: conferenceSid,
        provider: 'twilio',
      }).select('id').single()
      if (error) throw error
      callId = newCall.id
    }

    return new Response(JSON.stringify({ ok: true, id: callId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[save-call] Error:', err)
    return new Response(JSON.stringify({ error: (err as Error).message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
