/**
 * save-call — Sauvegarde la disposition et les notes du SDR apres un appel.
 *
 * WORKFLOW COMPLET :
 * 1. Auth JWT Supabase
 * 2. Cherche le call existant (par callSid ou conferenceSid)
 * 3. Update ou insert le call avec disposition/notes/meeting
 * 4. Met a jour le prospect : last_call_outcome (si disposition change), meeting_booked
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

    // ── 1. Chercher le call existant ──
    let callId: string | null = null

    if (callSid) {
      const { data } = await supabase.from('calls').select('id').eq('call_sid', callSid).single()
      if (data) callId = data.id
    }
    if (!callId && conferenceSid) {
      const { data } = await supabase.from('calls').select('id').eq('conference_sid', conferenceSid).single()
      if (data) callId = data.id
    }

    // ── 2. Mapper la disposition vers le call outcome ──
    // "rdv" dans le frontend = "meeting_booked" en DB si meetingBooked est true
    const callOutcome = meetingBooked ? 'meeting_booked' : (disposition || 'connected')

    const callData = {
      call_outcome: callOutcome,
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
      const { error } = await supabase.from('calls').update(callData).eq('id', callId)
      if (error) throw error
    } else {
      const { data: newCall, error } = await supabase.from('calls').insert({
        ...callData,
        call_sid: callSid,
        conference_sid: conferenceSid,
        provider: 'twilio',
      }).select('id').single()
      if (error) throw error
      callId = newCall.id
    }

    // ── 3. Mettre a jour le prospect avec la disposition du SDR ──
    if (prospectId) {
      const prospectUpdate: Record<string, unknown> = {
        last_call_outcome: callOutcome,
      }

      // Si le SDR marque "wrong_number", on desactive le prospect
      if (disposition === 'wrong_number') {
        prospectUpdate.do_not_call = true
      }

      // Si le SDR marque "dnc" (Do Not Call)
      if (disposition === 'dnc') {
        prospectUpdate.do_not_call = true
      }

      const { error: prospectErr } = await supabase
        .from('prospects')
        .update(prospectUpdate)
        .eq('id', prospectId)

      if (prospectErr) {
        console.error('[save-call] Prospect update error:', prospectErr)
      } else {
        console.log(`[save-call] Prospect ${prospectId} updated: outcome=${callOutcome}`)
      }
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
