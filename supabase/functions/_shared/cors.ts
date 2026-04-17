/**
 * CORS headers restrictifs — accepte uniquement les origines Calsyn.
 * Remplace `'Access-Control-Allow-Origin': '*'` qui laissait toute page
 * tierce appeler les edge functions.
 *
 * Origines acceptées :
 * - https://calsyn.app (prod)
 * - https://calsyn-*-kevins-projects-010aea77.vercel.app (previews Vercel)
 * - http://localhost:* (dev local Vite)
 *
 * NOTE : pour les webhooks Twilio (amd-callback, call-webhook, status-callback,
 * recording-callback), CORS n'est PAS pertinent car Twilio POST server-to-server,
 * pas depuis un navigateur. Ces functions peuvent garder '*'.
 */

const EXACT_ALLOWED = new Set<string>([
  'https://calsyn.app',
])

const PATTERN_ALLOWED: RegExp[] = [
  /^https:\/\/calsyn-[a-z0-9]+-kevins-projects-010aea77\.vercel\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
]

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const allowed =
    EXACT_ALLOWED.has(origin) ||
    PATTERN_ALLOWED.some(rx => rx.test(origin))
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://calsyn.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  }
}
