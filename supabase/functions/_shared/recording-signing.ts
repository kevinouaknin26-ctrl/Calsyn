/**
 * Helpers HMAC partagés entre `recording-sign` (émission) et `recording-proxy`
 * (validation) des URL signées courtes pour les recordings Twilio.
 *
 * La clé de signature est dérivée de SUPABASE_SERVICE_ROLE_KEY via HMAC-SHA256
 * avec un domain separator constant. Ça évite d'avoir à setter un nouveau secret
 * (le service_role key est déjà dispo côté edge functions) tout en gardant la
 * clé dérivée distincte du token principal.
 */

const SIGN_DOMAIN = 'callio-recording-sign-v1'

export async function deriveSigningKey(): Promise<CryptoKey> {
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!serviceRole) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing')

  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(serviceRole),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const derivedRaw = await crypto.subtle.sign(
    'HMAC',
    baseKey,
    new TextEncoder().encode(SIGN_DOMAIN),
  )
  return crypto.subtle.importKey(
    'raw',
    derivedRaw,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signHex(key: CryptoKey, payload: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const RECORDING_SID_RE = /^RE[a-f0-9]+$/i
