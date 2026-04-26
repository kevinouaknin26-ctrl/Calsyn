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
    // Le callSid du frontend est celui du leg SDR (inbound).
    // Le callSid en DB est celui du leg prospect (outbound-dial, créé par status-callback).
    // Ils sont DIFFÉRENTS. On cherche par : callSid → conferenceSid → prospect récent.
    let callId: string | null = null

    if (callSid) {
      const { data } = await supabase.from('calls').select('id').eq('call_sid', callSid).maybeSingle()
      if (data) callId = data.id
    }
    if (!callId && conferenceSid) {
      const { data } = await supabase.from('calls').select('id').eq('conference_sid', conferenceSid).maybeSingle()
      if (data) callId = data.id
    }
    // Fallback : chercher le call le plus récent par prospect_id OU prospect_phone
    // (status-callback peut avoir lié l'appel à un AUTRE prospect avec le même numéro)
    if (!callId) {
      const twoMinAgo = new Date(Date.now() - 120000).toISOString()

      // D'abord par prospect_id exact
      if (prospectId) {
        const { data } = await supabase.from('calls')
          .select('id')
          .eq('prospect_id', prospectId)
          .gte('created_at', twoMinAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (data) {
          callId = data.id
          console.log(`[save-call] Found by prospect_id fallback: ${callId}`)
        }
      }

      // Sinon par numéro de téléphone (cas où status-callback a lié au mauvais prospect)
      if (!callId && prospectPhone) {
        const { data } = await supabase.from('calls')
          .select('id')
          .eq('prospect_phone', prospectPhone)
          .gte('created_at', twoMinAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (data) {
          callId = data.id
          console.log(`[save-call] Found by phone fallback: ${callId}`)
        }
      }
    }

    // ── 2. Mapper la disposition vers le call outcome ──
    // meeting_booked est un boolean séparé, pas un outcome
    const callOutcome = disposition || 'connected'

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
      console.log(`[save-call] Updated call ${callId}: outcome=${callOutcome}`)
    } else {
      // Le call devrait déjà exister (créé par status-callback).
      // Ne PAS créer de nouveau call pour éviter les doublons.
      console.warn(`[save-call] Call not found for sid=${callSid}, prospect=${prospectId}. Skipping insert.`)
    }

    // ── 3. Mettre a jour le prospect — recomputer le meilleur outcome ──
    if (prospectId) {
      const outcomePriority: Record<string, number> = {
        'connected': 100, 'callback': 60, 'not_interested': 50,
        'voicemail': 40, 'busy': 35, 'no_answer': 30,
        'cancelled': 20, 'failed': 10, 'wrong_number': 5,
      }

      // Chercher tous les appels de ce prospect pour trouver le meilleur
      const { data: allCalls } = await supabase
        .from('calls')
        .select('call_outcome, meeting_booked')
        .eq('prospect_id', prospectId)

      let bestOutcome = callOutcome
      let bestPriority = outcomePriority[callOutcome] || 0
      let anyMeeting = meetingBooked || false

      if (allCalls) {
        for (const c of allCalls) {
          const p = outcomePriority[c.call_outcome || ''] || 0
          if (p > bestPriority) {
            bestPriority = p
            bestOutcome = c.call_outcome || callOutcome
          }
          if (c.meeting_booked) anyMeeting = true
        }
      }

      const prospectUpdate: Record<string, unknown> = {
        last_call_outcome: bestOutcome,
        meeting_booked: anyMeeting,
      }

      // Sync CRM status (même logique que status-callback)
      const { data: currentProspect } = await supabase
        .from('prospects')
        .select('crm_status')
        .eq('id', prospectId)
        .single()

      if (currentProspect) {
        const crmPriority: Record<string, number> = {
          'new': 0, 'open': 5, 'attempted_to_contact': 10, 'in_progress': 20,
          'connected': 30, 'callback': 40, 'not_interested': 35, 'mail_sent': 45,
          'rdv_pris': 50, 'rdv_fait': 55, 'en_attente_signature': 60, 'signe': 90, 'en_attente_paiement': 95, 'paye': 100,
        }
        const outcomeTocrm: Record<string, string> = {
          'connected': 'connected',
          'voicemail': 'attempted_to_contact',
          'no_answer': 'attempted_to_contact',
          'busy': 'attempted_to_contact',
        }
        const impliedCrm = outcomeTocrm[bestOutcome]
        if (impliedCrm) {
          const currentP = crmPriority[currentProspect.crm_status || 'new'] || 0
          const impliedP = crmPriority[impliedCrm] || 0
          if (impliedP > currentP) {
            prospectUpdate.crm_status = impliedCrm
          }
        }
      }

      if (disposition === 'wrong_number' || disposition === 'dnc') {
        prospectUpdate.do_not_call = true
      }

      const { error: prospectErr } = await supabase
        .from('prospects')
        .update(prospectUpdate)
        .eq('id', prospectId)

      if (prospectErr) {
        console.error('[save-call] Prospect update error:', prospectErr)
      } else {
        console.log(`[save-call] Prospect ${prospectId} updated: bestOutcome=${bestOutcome}, meeting=${anyMeeting}`)
      }
    }

    return new Response(JSON.stringify({ ok: true, id: callId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[save-call] Error:', err)
    captureError(err, { tags: { fn: 'save-call' } }).catch(() => {})
    return new Response(JSON.stringify({ error: (err as Error).message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
