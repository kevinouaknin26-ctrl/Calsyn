/**
 * status-callback — Events de progression d'appel Twilio.
 * Source de verite pour la DB. Cherche le prospect par numero pour enrichir le call.
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

    console.log(`[status-callback] ${callSid}: ${callStatus} (${duration}s)`)

    if (!['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(callStatus)) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    )

    const outcomeMap: Record<string, string> = {
      'completed': 'connected',
      'busy': 'busy',
      'no-answer': 'no_answer',
      'canceled': 'no_answer',
      'failed': 'no_answer',
    }

    // Chercher le prospect par numero pour enrichir le call
    let prospectName: string | null = null
    let prospectId: string | null = null
    let organisationId: string | null = null
    let sdrId: string | null = null

    if (to) {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('id, name, organisation_id, list_id')
        .eq('phone', to)
        .limit(1)
        .single()

      if (prospect) {
        prospectName = prospect.name
        prospectId = prospect.id
        organisationId = prospect.organisation_id

        // Trouver le SDR via la liste du prospect
        if (prospect.list_id) {
          const { data: list } = await supabase
            .from('prospect_lists')
            .select('created_by')
            .eq('id', prospect.list_id)
            .single()
          if (list?.created_by) sdrId = list.created_by
        }

        // Mettre a jour le prospect
        await supabase
          .from('prospects')
          .update({
            last_call_at: new Date().toISOString(),
            call_count: prospect.id ? undefined : 0, // increment via RPC plus tard
          })
          .eq('id', prospect.id)
      }
    }

    // Upsert le call enrichi
    const { error } = await supabase
      .from('calls')
      .upsert({
        call_sid: callSid,
        conference_sid: conferenceSid,
        call_duration: duration,
        call_outcome: outcomeMap[callStatus] || callStatus,
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
      console.error('[status-callback] Upsert error:', error)
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
