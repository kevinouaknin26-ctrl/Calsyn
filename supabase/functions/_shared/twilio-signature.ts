/**
 * twilio-signature — Vérification HMAC X-Twilio-Signature des webhooks inbound.
 *
 * Twilio signe chaque requête webhook avec HMAC-SHA1(authToken, url + sortedFormParams).
 * Sans cette vérif, n'importe qui peut POST sur /functions/v1/{recording,status,amd,sms}-callback
 * et fake un appel/recording → corruption des données + facturation.
 *
 * Doc officielle :
 *   https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * Usage :
 *   if (!await verifyTwilioSignature(req, formParams)) {
 *     return new Response('Invalid signature', { status: 403 })
 *   }
 *
 * Bypass : si TWILIO_AUTH_TOKEN absent OU TWILIO_SKIP_SIGNATURE_CHECK=1, retourne true.
 * Le bypass sert pour les tests locaux uniquement — en prod, fail-closed.
 */

const AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') || ''
const SKIP_CHECK = Deno.env.get('TWILIO_SKIP_SIGNATURE_CHECK') === '1'

/**
 * Vérifie X-Twilio-Signature contre HMAC-SHA1(authToken, url + sortedFormParams).
 *
 * @param req Request Deno (signature dans header, URL dans req.url)
 * @param formParams params x-www-form-urlencoded déjà parsés (depuis req.formData() ou URLSearchParams)
 * @returns true si signature valide ou bypass activé, false sinon
 */
export async function verifyTwilioSignature(
  req: Request,
  formParams: Record<string, string>,
): Promise<boolean> {
  if (SKIP_CHECK) {
    console.warn('[twilio-sig] SKIP_CHECK activé — signature non vérifiée')
    return true
  }
  if (!AUTH_TOKEN) {
    console.error('[twilio-sig] TWILIO_AUTH_TOKEN absent — fail-closed')
    return false
  }

  const signatureHeader = req.headers.get('x-twilio-signature')
  if (!signatureHeader) return false

  // Twilio signe : URL complète (https://...) + concat des params triés alphabétiquement
  // Format : url + key1value1 + key2value2 + ...
  const url = req.url
  const sortedKeys = Object.keys(formParams).sort()
  let stringToSign = url
  for (const k of sortedKeys) {
    stringToSign += k + formParams[k]
  }

  // HMAC-SHA1 (Twilio utilise SHA1, pas SHA256, pour des raisons historiques)
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(AUTH_TOKEN),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, enc.encode(stringToSign)),
  )
  // Twilio envoie la sig en base64 standard
  const computed = btoa(String.fromCharCode(...sigBytes))

  // Comparaison constant-time
  return timingSafeEqual(computed, signatureHeader)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Helper : extrait les form params d'une Request Twilio webhook (POST x-www-form-urlencoded).
 * Renvoie aussi le body brut au cas où le caller en a besoin.
 */
export async function readTwilioForm(req: Request): Promise<{ params: Record<string, string>; raw: string }> {
  const raw = await req.text()
  const params: Record<string, string> = {}
  const usp = new URLSearchParams(raw)
  for (const [k, v] of usp) params[k] = v
  return { params, raw }
}
