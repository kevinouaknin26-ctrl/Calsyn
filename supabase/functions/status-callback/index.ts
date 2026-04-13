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
    const direction = params.Direction || ''
    const parentCallSid = params.ParentCallSid || ''

    // ProspectId/Name passés via l'URL du statusCallback par call-webhook
    const reqUrl = new URL(req.url)
    const urlProspectId = reqUrl.searchParams.get('prospectId') || ''
    const urlProspectName = reqUrl.searchParams.get('prospectName') || ''

    console.log(`[status-callback] ${callSid}: ${callStatus} (${duration}s) from=${from} to=${to} dir=${direction} prospect=${urlProspectId}`)

    // On ne traite que les etats finaux pour la DB
    if (!['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(callStatus)) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Filtrer les doublons ──
    // Le SDK browser crée un appel "inbound" (browser → Twilio).
    // Le TwiML <Dial><Number> crée un child "outbound-dial" (Twilio → prospect).
    // On ne garde QUE le child (le vrai appel vers le prospect).
    if (direction === 'inbound') {
      console.log(`[status-callback] Skipping inbound/SDR leg ${callSid}`)
      return new Response(JSON.stringify({ ok: true, skipped: 'sdr-leg' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    // Mapping Twilio → nos statuts (Minari exact)
    const answeredBy = params.AnsweredBy || ''
    let outcome = 'no_answer'

    if (answeredBy.startsWith('machine')) {
      outcome = 'voicemail'
    } else if (callStatus === 'completed' && duration >= 8) {
      outcome = 'connected' // Vrai appel (> 8s = humain confirmé)
    } else if (callStatus === 'completed' && duration > 0 && duration < 8) {
      outcome = 'voicemail' // Minari rule : < 8s = messagerie/rejet auto
    } else if (callStatus === 'completed' && duration === 0) {
      outcome = 'no_answer'
    } else if (callStatus === 'busy') {
      outcome = 'busy'
    } else if (callStatus === 'canceled') {
      outcome = 'cancelled'
    } else if (callStatus === 'failed') {
      outcome = 'failed'
    }

    // ── 1. Chercher le prospect ──
    // Priorité : prospectId passé par call-webhook > recherche par numéro
    let prospectName: string | null = urlProspectName || null
    let prospectId: string | null = urlProspectId || null
    let organisationId: string | null = null
    let sdrId: string | null = null

    if (to) {
      let prospects: any[] | null = null

      if (urlProspectId) {
        // On connaît le prospect exact (passé par le frontend via call-webhook)
        const { data } = await supabase
          .from('prospects')
          .select('id, name, organisation_id, list_id, call_count, last_call_outcome, crm_status')
          .eq('id', urlProspectId)
        prospects = data
      } else {
        // Fallback : chercher par numéro (ancien comportement)
        const { data } = await supabase
          .from('prospects')
          .select('id, name, organisation_id, list_id, call_count, last_call_outcome, crm_status')
          .eq('phone', to)
        prospects = data
      }

      // Priorite des statuts d'appel (du plus avance au moins avance)
      // Le statut ne redescend JAMAIS automatiquement — seul le commercial peut le changer
      const outcomePriority: Record<string, number> = {
        'connected': 100,
        'callback': 60,
        'not_interested': 50,
        'voicemail': 40,
        'busy': 35,
        'no_answer': 30,
        'cancelled': 20,
        'failed': 10,
        'wrong_number': 5,
      }

      if (prospects && prospects.length > 0) {
        // Utiliser le premier pour enrichir le call
        const prospect = prospects[0]
        prospectName = prospect.name
        prospectId = prospect.id
        organisationId = prospect.organisation_id

        if (prospect.list_id) {
          const { data: list } = await supabase
            .from('prospect_lists')
            .select('created_by')
            .eq('id', prospect.list_id)
            .single()
          if (list?.created_by) sdrId = list.created_by
        }

        // ── 2. Mettre a jour TOUS les prospects avec ce numero ──
        for (const p of prospects) {
          const currentPriority = outcomePriority[p.last_call_outcome || ''] || 0
          const newPriority = outcomePriority[outcome] || 0
          // Garder le statut le plus avance (ne jamais redescendre)
          const bestOutcome = newPriority >= currentPriority ? outcome : p.last_call_outcome

          // Auto-avancer le CRM status en fonction du résultat d'appel
          // Priorité CRM : signe > en_attente_signature > rdv > connected > callback > in_progress > attempted_to_contact > new
          const crmPriority: Record<string, number> = {
            'new': 0, 'open': 5, 'attempted_to_contact': 10, 'in_progress': 20,
            'connected': 30, 'callback': 40, 'not_interested': 35, 'mail_sent': 45,
            'rdv_pris': 50, 'rdv_fait': 55, 'en_attente_signature': 60, 'signe': 90, 'en_attente_paiement': 95, 'paye': 100,
          }
          // Quel CRM status le résultat d'appel implique
          const outcomeTocrm: Record<string, string> = {
            'connected': 'connected',
            'voicemail': 'attempted_to_contact',
            'no_answer': 'attempted_to_contact',
            'busy': 'attempted_to_contact',
            'cancelled': 'attempted_to_contact',
            'failed': 'attempted_to_contact',
          }
          let crmUpdate: Record<string, string> = {}
          const impliedCrm = outcomeTocrm[outcome]
          if (impliedCrm) {
            const currentCrmPriority = crmPriority[p.crm_status || 'new'] || 0
            const impliedCrmPriority = crmPriority[impliedCrm] || 0
            if (impliedCrmPriority > currentCrmPriority) {
              crmUpdate = { crm_status: impliedCrm }
            }
          }

          const { error: prospectErr } = await supabase
            .from('prospects')
            .update({
              last_call_at: new Date().toISOString(),
              last_call_outcome: bestOutcome,
              call_count: (p.call_count || 0) + 1,
              ...crmUpdate,
            })
            .eq('id', p.id)

          if (prospectErr) {
            console.error(`[status-callback] Prospect ${p.name} update error:`, prospectErr)
          }
        }
        console.log(`[status-callback] ${prospects.length} prospect(s) updated for ${to}: outcome=${outcome}`)
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
