/**
 * Sentry — capture d'erreurs pour les edge functions Deno.
 *
 * Le SDK officiel @sentry/deno existe mais a des soucis avec Supabase Edge
 * Functions (taille bundle + perf). On utilise une intégration minimaliste
 * qui POST directement au Sentry envelope endpoint via fetch — léger,
 * fiable, zéro dépendance.
 *
 * Activation : déclarer SENTRY_DSN_BACKEND dans les env Supabase Edge Functions.
 * Sans DSN, captureError() est noop.
 *
 * Usage :
 *   import { captureError, withSentry } from '../_shared/sentry.ts'
 *
 *   serve(withSentry('gmail', async (req) => {
 *     // ... ton code, throws sont capturés auto
 *   }))
 *
 *   // ou manuel :
 *   try { ... } catch (e) {
 *     await captureError(e, { tags: { fn: 'gmail', action: 'send' }, user: { id: userId } })
 *     throw e
 *   }
 */

const DSN = Deno.env.get('SENTRY_DSN_BACKEND') || ''
const ENV = Deno.env.get('SUPABASE_ENV') || 'production'

// Parse DSN : https://<key>@<host>/<projectId>
function parseDsn(dsn: string): { host: string; key: string; projectId: string } | null {
  const m = dsn.match(/^https?:\/\/([^@]+)@([^/]+)\/(\d+)$/)
  if (!m) return null
  return { key: m[1], host: m[2], projectId: m[3] }
}

const DSN_PARTS = DSN ? parseDsn(DSN) : null

interface CaptureContext {
  tags?: Record<string, string>
  extra?: Record<string, unknown>
  user?: { id?: string; email?: string }
  level?: 'fatal' | 'error' | 'warning' | 'info'
}

// PII scrubbing — emails, téléphones, JWT, SIDs Twilio
const PII_PATTERNS: Array<[RegExp, string]> = [
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]'],
  [/(\+?\d{1,3}[ -]?)?\(?\d{2,4}\)?[ -]?\d{2,4}[ -]?\d{2,4}[ -]?\d{2,4}/g, '[phone]'],
  [/Bearer\s+[A-Za-z0-9._\-]+/g, 'Bearer [redacted]'],
  [/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, '[jwt]'],
  [/RE[a-f0-9]{32}/g, '[recordingSid]'],
  [/CA[a-f0-9]{32}/g, '[callSid]'],
  [/SM[a-f0-9]{32}/g, '[messageSid]'],
]

function scrub(s: unknown): unknown {
  if (typeof s !== 'string') return s
  let out = s
  for (const [re, repl] of PII_PATTERNS) out = out.replace(re, repl)
  return out
}

function scrubObject<T>(obj: T): T {
  if (obj == null || typeof obj !== 'object') return obj
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = scrub(v)
    else if (typeof v === 'object' && v !== null) out[k] = scrubObject(v)
    else out[k] = v
  }
  return out as T
}

/** Capture une erreur dans Sentry. Async fire-and-forget — n'attend pas la réponse. */
export async function captureError(error: unknown, context: CaptureContext = {}): Promise<void> {
  if (!DSN_PARTS) {
    console.error('[sentry-noop]', error, context)
    return
  }

  const err = error instanceof Error ? error : new Error(String(error))
  const scrubbedMessage = scrub(err.message) as string
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Date.now() / 1000,
    platform: 'javascript',
    level: context.level || 'error',
    environment: ENV,
    server_name: 'supabase-edge',
    tags: { runtime: 'deno', ...context.tags },
    // user.id reste, mais on scrub email
    user: context.user ? { ...context.user, email: context.user.email ? '[email]' : undefined } : undefined,
    extra: context.extra ? scrubObject(context.extra) : undefined,
    exception: {
      values: [{
        type: err.name || 'Error',
        value: scrubbedMessage,
        stacktrace: err.stack ? {
          frames: parseStack(err.stack),
        } : undefined,
      }],
    },
  }

  const url = `https://${DSN_PARTS.host}/api/${DSN_PARTS.projectId}/store/`
  const headers = {
    'Content-Type': 'application/json',
    'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${DSN_PARTS.key}, sentry_client=calsyn-edge/1.0`,
  }

  try {
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
    })
  } catch (e) {
    // Le envoi vers Sentry a foiré — on log en console seulement, on ne throw pas
    console.error('[sentry-send-failed]', e, 'original:', error)
  }
}

function parseStack(stack: string): Array<{ filename?: string; function?: string; lineno?: number; colno?: number; in_app?: boolean }> {
  return stack.split('\n').slice(1, 30).map(line => {
    // Format Deno typique : "    at functionName (file:///path/to/file.ts:42:13)"
    const m = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/)
    if (!m) return { function: line.trim() }
    return {
      function: m[1] || '<anonymous>',
      filename: m[2],
      lineno: parseInt(m[3]),
      colno: parseInt(m[4]),
      in_app: !m[2].includes('node_modules') && !m[2].includes('deno.land'),
    }
  })
}

/** Wrapper qui capture toutes les erreurs non catchées d'un handler edge function. */
export function withSentry<T extends Request>(
  fnName: string,
  handler: (req: T) => Promise<Response>,
): (req: T) => Promise<Response> {
  return async (req: T) => {
    try {
      return await handler(req)
    } catch (e) {
      const url = new URL(req.url)
      await captureError(e, {
        tags: { fn: fnName, method: req.method, action: url.searchParams.get('action') || '' },
        extra: { url: req.url },
      }).catch(() => {})  // fire-and-forget, n'empêche pas la réponse
      // Re-throw pour que le code appelant puisse aussi gérer (ou logger)
      throw e
    }
  }
}
