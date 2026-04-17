/**
 * call-webhook — TwiML pour appels sortants + entrants.
 *
 * Outbound : SDR appelle via SDK → <Dial><Number> direct ou <Conference>.
 * Inbound  : PSTN → détection auto → lookup SDR → <Dial><Client> vers browser SDK.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Escape pour valeurs texte ET URL dans attributs/contenu XML TwiML
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

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
      let sdrProfile: { id: string; voicemail_url: string | null; voicemail_text: string | null } | null = null

      // 1. Chercher un SDR assigné à ce numéro spécifique
      const { data: assigned } = await admin
        .from('profiles')
        .select('id, voicemail_url, voicemail_text')
        .contains('assigned_phones', [to])
        .is('deactivated_at', null)
        .limit(1)

      if (assigned && assigned.length > 0) {
        sdrProfile = assigned[0]
      }

      // 2. Fallback : chercher l'org propriétaire du numéro (from_number)
      if (!sdrProfile) {
        const { data: orgs } = await admin
          .from('organisations')
          .select('id')
          .eq('from_number', to)
          .is('deleted_at', null)
          .limit(1)
        if (orgs && orgs.length > 0) {
          const { data: admins } = await admin
            .from('profiles')
            .select('id, voicemail_url, voicemail_text')
            .eq('organisation_id', orgs[0].id)
            .in('role', ['admin', 'manager'])
            .is('deactivated_at', null)
            .limit(1)
          if (admins && admins.length > 0) {
            sdrProfile = admins[0]
          }
        }
      }

      // 3. Dernier fallback : premier admin/super_admin actif (single-tenant phase)
      if (!sdrProfile) {
        const { data: anyAdmin } = await admin
          .from('profiles')
          .select('id, voicemail_url, voicemail_text')
          .in('role', ['super_admin', 'admin'])
          .is('deactivated_at', null)
          .order('created_at', { ascending: true })
          .limit(1)
        if (anyAdmin && anyAdmin.length > 0) {
          sdrProfile = anyAdmin[0]
        }
        console.log(`[call-webhook] Inbound fallback: to=${to}, from=${from}, sdr=${sdrProfile?.id || 'NONE'}`)
      }

      // Construction TwiML voicemail : <Play> audio OU <Say> Polly Neural
      const buildVoicemailTwiml = async (): Promise<string> => {
        // 1. Audio enregistré → signed URL 5 min (suffit pour Twilio qui fetch immédiatement)
        if (sdrProfile?.voicemail_url) {
          const { data: signed } = await admin.storage
            .from('voicemails')
            .createSignedUrl(sdrProfile.voicemail_url, 300)
          if (signed?.signedUrl) {
            return `<Play>${escapeXml(signed.signedUrl)}</Play>`
          }
        }
        // 2. Texte custom du SDR → Polly Neural
        if (sdrProfile?.voicemail_text) {
          return `<Say voice="Polly.Lea-Neural" language="fr-FR">${escapeXml(sdrProfile.voicemail_text)}</Say>`
        }
        // 3. Fallback générique
        return `<Say voice="Polly.Lea-Neural" language="fr-FR">Bonjour, vous êtes bien sur la ligne de notre équipe. Nous ne pouvons pas vous répondre pour le moment. Laissez-nous un message ou rappelez plus tard. Merci.</Say>`
      }

      const clientIdentity = sdrProfile ? `calsyn_${sdrProfile.id.substring(0, 8)}` : ''
      console.log(`[call-webhook] INBOUND → sdr=${sdrProfile?.id || 'NONE'} clientIdentity=${clientIdentity || 'NONE'}`)

      if (clientIdentity) {
        const vmTwiml = await buildVoicemailTwiml()
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="25">
    <Client>
      <Identity>${clientIdentity}</Identity>
    </Client>
  </Dial>
  ${vmTwiml}
</Response>`
        return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } })
      } else {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Lea-Neural" language="fr-FR">Ce numéro ne peut pas recevoir d'appels pour le moment.</Say>
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
