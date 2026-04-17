/**
 * call-webhook — TwiML pour appels sortants + entrants.
 *
 * Outbound : SDR appelle via SDK → <Dial><Number> direct ou <Conference>.
 * Inbound  : PSTN → détection auto → lookup SDR → <Dial><Client> vers browser SDK.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { validateTwilioSignature } from '../_shared/twilio-signature.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }})
  }

  try {
    const contentType = req.headers.get('content-type') || ''
    let params: Record<string, string> = {}

    if (contentType.includes('form-urlencoded')) {
      const text = await req.text()
      params = Object.fromEntries(new URLSearchParams(text).entries())
    } else if (contentType.includes('json')) {
      params = await req.json()
    }

    // ── Validation signature Twilio (C1) ──
    // Les vrais webhooks Twilio sont form-urlencoded + X-Twilio-Signature.
    // JSON interne (SDK SDR outbound) passe via service_role.
    const sig = req.headers.get('X-Twilio-Signature')
    if (sig && contentType.includes('form-urlencoded')) {
      const ok = await validateTwilioSignature({
        url: req.url, params, signature: sig,
        authToken: Deno.env.get('TWILIO_AUTH_TOKEN') || '',
      })
      if (!ok) {
        console.warn('[call-webhook] Invalid Twilio signature — rejected')
        return new Response('Invalid signature', { status: 403 })
      }
    } else if (!sig) {
      const authToken = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
      if (authToken !== SUPABASE_SERVICE_ROLE_KEY && authToken !== Deno.env.get('SUPABASE_ANON_KEY')) {
        return new Response('Unauthorized', { status: 401 })
      }
    }

    const to = params.To || ''
    const from = params.From || params.Caller || ''
    const direction = params.Direction || ''

    // ── Appel entrant : route vers le client browser du SDR ──
    // Détection : pas de ProspectId (= pas un appel sortant SDK), pas de conference, et les deux numéros sont des E.164
    // NB: Direction=inbound est vrai pour TOUS les appels TwiML App (y compris SDK sortants), on ne l'utilise PAS
    const isInbound = !params.ConferenceId && !params.conference && !params.ProspectId && to.startsWith('+') && from.startsWith('+')
    console.log(`[call-webhook] to=${to} from=${from} direction=${direction} isInbound=${isInbound} ProspectId=${params.ProspectId || 'none'} ConferenceId=${params.ConferenceId || 'none'}`)
    if (isInbound) {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      let clientIdentity = ''

      // 1. Chercher un SDR assigné à ce numéro spécifique
      const { data: assigned } = await admin
        .from('profiles')
        .select('id')
        .contains('assigned_phones', [to])
        .is('deactivated_at', null)
        .limit(1)

      if (assigned && assigned.length > 0) {
        clientIdentity = `calsyn_${assigned[0].id.substring(0, 8)}`
      }

      // 2. Fallback : chercher l'org propriétaire du numéro (from_number)
      if (!clientIdentity) {
        const { data: orgs } = await admin
          .from('organisations')
          .select('id')
          .eq('from_number', to)
          .is('deleted_at', null)
          .limit(1)
        if (orgs && orgs.length > 0) {
          const { data: admins } = await admin
            .from('profiles')
            .select('id')
            .eq('organisation_id', orgs[0].id)
            .in('role', ['admin', 'manager'])
            .is('deactivated_at', null)
            .limit(1)
          if (admins && admins.length > 0) {
            clientIdentity = `calsyn_${admins[0].id.substring(0, 8)}`
          }
        }
      }

      // 3. Dernier fallback : premier admin/super_admin actif (single-tenant phase)
      if (!clientIdentity) {
        const { data: anyAdmin } = await admin
          .from('profiles')
          .select('id')
          .in('role', ['super_admin', 'admin'])
          .is('deactivated_at', null)
          .order('created_at', { ascending: true })
          .limit(1)
        if (anyAdmin && anyAdmin.length > 0) {
          clientIdentity = `calsyn_${anyAdmin[0].id.substring(0, 8)}`
        }
        console.log(`[call-webhook] Inbound fallback: to=${to}, from=${from}, identity=${clientIdentity || 'NONE'}`)
      }

      console.log(`[call-webhook] INBOUND → clientIdentity=${clientIdentity || 'NONE'}`)
      if (clientIdentity) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30">
    <Client>
      <Identity>${clientIdentity}</Identity>
    </Client>
  </Dial>
  <Say language="fr-FR">Aucun agent disponible. Identité cherchée : ${clientIdentity}.</Say>
</Response>`
        return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } })
      } else {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR">Ce numéro ne peut pas recevoir d'appels pour le moment.</Say>
</Response>`
        return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } })
      }
    }

    // Mode conférence : si un paramètre 'conference' ou 'ConferenceId' est passé
    // - Depuis initiate-call (prospect) : ?conference=name dans l'URL
    // - Depuis device.connect (SDR) : ConferenceId dans le body params
    const url = new URL(req.url)
    const conferenceName = url.searchParams.get('conference') || params.conference || params.ConferenceId || ''

    if (conferenceName) {
      // Mode AMD : le prospect rejoint la conférence (l'appel a été créé par initiate-call)
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="false"
      startConferenceOnEnter="true"
      endConferenceOnExit="true"
      record="record-from-start"
      recordingStatusCallback="${SUPABASE_URL}/functions/v1/recording-callback"
      recordingStatusCallbackMethod="POST"
      statusCallback="${SUPABASE_URL}/functions/v1/status-callback"
      statusCallbackEvent="start end join leave">
      ${conferenceName}
    </Conference>
  </Dial>
</Response>`
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } })
    }

    // Mode legacy : Dial direct (SDR appelle via device.connect sans AMD)
    if (!to) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>No destination number</Say></Response>`, {
        headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Passer le prospectId/Name dans l'URL du statusCallback
    // pour que status-callback associe l'appel au bon prospect (même numéro dans plusieurs listes)
    const prospectId = params.ProspectId || ''
    const prospectName = params.ProspectName || ''
    // IMPORTANT: & → &amp; pour XML valide dans les attributs TwiML
    const statusCbUrl = `${SUPABASE_URL}/functions/v1/status-callback?prospectId=${encodeURIComponent(prospectId)}&amp;prospectName=${encodeURIComponent(prospectName)}`

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${from}"
    answerOnBridge="true"
    record="record-from-answer-dual"
    recordingStatusCallback="${SUPABASE_URL}/functions/v1/recording-callback"
    recordingStatusCallbackMethod="POST"
    timeout="30">
    <Number
      statusCallbackEvent="initiated ringing answered completed"
      statusCallback="${statusCbUrl}"
      statusCallbackMethod="POST">
      ${to}
    </Number>
  </Dial>
</Response>`

    return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } })

  } catch (err) {
    console.error('[call-webhook] Error:', err)
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred</Say></Response>`, {
      headers: { 'Content-Type': 'text/xml' },
    })
  }
})
