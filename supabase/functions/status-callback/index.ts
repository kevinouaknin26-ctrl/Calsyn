/**
 * status-callback — Events de progression d'appel Twilio.
 * Source de verite pour la DB.
 *
 * WORKFLOW COMPLET :
 * 1. Recoit l'event Twilio (initiated, ringing, answered, completed, busy, no-answer, canceled, failed)
 * 2. Cherche le prospect par numero
 * 3. Upsert le call enrichi dans la table calls
 * 4. Met a jour le prospect : last_call_at, last_call_outcome, call_count++
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const text = await req.text()
    const params = Object.fromEntries(new URLSearchParams(text).entries())

    const callSid = params.CallSid || ''
    const callStatus = params.CallStatus || ''
    const duration = parseInt(params.CallDuration || '0', 10)
    const conferenceSid = params.ConferenceSid || null
    const from = params.From || ''
    const to = params.To || ''

    console.log(`[status-callback] ${callSid}: ${callStatus} (${duration}s) from=${from} to=${to}`)

    // On ne traite que les etats finaux pour la DB
    if (!['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(callStatus)) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    // Mapping Twilio → nos statuts (Minari exact)
    const outcomeMap: Record<string, string> = {
      'completed': duration > 0 ? 'connected' : 'no_answer', // completed sans duree = pas vraiment decroche
      'busy': 'no_answer',
      'no-answer': 'no_answer',
      'canceled': 'cancelled',
      'failed': 'failed',
    }

    // Detection voicemail : completed + duree < 8 secondes = probablement repondeur (Minari rule)
    let outcome = outcomeMap[callStatus] || 'no_answer'
    if (callStatus === 'completed' && duration > 0 && duration <= 8) {
      outcome = 'voicemail' // Recategorise auto < 8s (comme Minari)
    }

    // ── 1. Chercher le prospect par numero ──
    let prospectName: string | null = null
    let prospectId: string | null = null
    let organisationId: string | null = null
    let sdrId: string | null = null

    if (to) {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('id, name, organisation_id, list_id, call_count')
        .eq('phone', to)
        .limit(1)
        .single()

      if (prospect) {
        prospectName = prospect.name
        prospectId = prospect.id
        organisationId = prospect.organisation_id

        // Trouver le SDR via la liste
        if (prospect.list_id) {
          const { data: list } = await supabase
            .from('prospect_lists')
            .select('created_by')
            .eq('id', prospect.list_id)
            .single()
          if (list?.created_by) sdrId = list.created_by
        }

        // ── 2. Mettre a jour le prospect (COMPLET) ──
        const { error: prospectErr } = await supabase
          .from('prospects')
          .update({
            last_call_at: new Date().toISOString(),
            last_call_outcome: outcome,
            call_count: (prospect.call_count || 0) + 1,
          })
          .eq('id', prospect.id)

        if (prospectErr) {
          console.error('[status-callback] Prospect update error:', prospectErr)
        } else {
          console.log(`[status-callback] Prospect ${prospect.name} updated: outcome=${outcome}, count=${(prospect.call_count || 0) + 1}`)
        }
      }
    }

    // ── 3. Upsert le call enrichi ──
    const { error } = await supabase
      .from('calls')
      .upsert({
        call_sid: callSid,
        conference_sid: conferenceSid,
        call_duration: duration,
        call_outcome: outcome,
        prospect_phone: to,
        prospect_name: prospectName,
        prospect_id: prospectId,
        organisation_id: organisationId,
        sdr_id: sdrId,
        from_number: from,
        provider: 'twilio',
      }, {
        onConflict: 'call_sid',
        ignoreDuplicates: false,
      })

    if (error) {
      console.error('[status-callback] Call upsert error:', error)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[status-callback] Error:', err)
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
