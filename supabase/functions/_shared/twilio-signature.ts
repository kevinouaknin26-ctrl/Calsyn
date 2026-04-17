/**
 * twilio-signature.ts — Validation de la signature Twilio sur les webhooks.
 *
 * Twilio signe chaque requête avec un header X-Twilio-Signature :
 *   signature = base64(HMAC-SHA1(AUTH_TOKEN, URL + sorted_params_concatenated))
 *
 * Pour les POST application/x-www-form-urlencoded, les params sont le
 * form body trié par clé. Pour les GET, ce sont les query params.
 *
 * Référence : https://www.twilio.com/docs/usage/security#validating-requests
 *
 * Usage dans un webhook :
 *
 *   const raw = await req.text()  // lire le body UNE fois
 *   const params = parseFormBody(raw)
 *   const ok = await validateTwilioSignature({
 *     url: req.url,
 *     params,
 *     signature: req.headers.get('X-Twilio-Signature') || '',
 *     authToken: Deno.env.get('TWILIO_AUTH_TOKEN') || '',
 *   })
 *   if (!ok) return new Response('Invalid signature', { status: 403 })
 *
 * En dev local on peut bypasser via env `TWILIO_SKIP_SIGNATURE=true`
 * (à NE PAS mettre en prod).
 */

export interface TwilioValidationInput {
  url: string
  params: Record<string, string>
  signature: string
  authToken: string
}

export function parseFormBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of raw.split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    if (eq < 0) { out[decodeURIComponent(pair)] = ''; continue }
    const k = decodeURIComponent(pair.slice(0, eq).replace(/\+/g, ' '))
    const v = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '))
    out[k] = v
  }
  return out
}

export async function validateTwilioSignature(input: TwilioValidationInput): Promise<boolean> {
  if (Deno.env.get('TWILIO_SKIP_SIGNATURE') === 'true') return true  // dev bypass
  if (!input.signature || !input.authToken) return false

  const keys = Object.keys(input.params).sort()
  const paramString = keys.map(k => `${k}${input.params[k]}`).join('')
  const payload = input.url + paramString

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(input.authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))

  // Timing-safe compare
  if (expected.length !== input.signature.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ input.signature.charCodeAt(i)
  }
  return mismatch === 0
}
