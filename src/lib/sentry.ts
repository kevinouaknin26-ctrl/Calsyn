/**
 * Sentry — observabilité front + tracing.
 *
 * Activation : déclarer VITE_SENTRY_DSN dans Vercel env (par environnement).
 * Si la DSN est absente, Sentry est noop — aucune erreur, aucun impact perf.
 *
 * Sentry capture automatiquement :
 *  - exceptions JS non catchées (window.onerror)
 *  - rejets de Promise non catchés
 *  - erreurs React via <ErrorBoundary>
 *  - logs console.error (configurable)
 *  - performance metrics (cliques, navigation, fetch)
 *
 * On enrichit avec : commit SHA, user.id (auth), organisation.id, role.
 */

import * as Sentry from '@sentry/react'

declare const __BUILD_SHA__: string

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const ENV = (import.meta.env.VITE_APP_ENV as string) || (import.meta.env.MODE === 'production' ? 'production' : 'development')

export function initSentry() {
  if (!DSN) {
    // Pas de DSN → noop. On log juste pour debug.
    if (import.meta.env.DEV) console.log('[sentry] DSN absente — désactivé')
    return
  }

  Sentry.init({
    dsn: DSN,
    environment: ENV,
    release: typeof __BUILD_SHA__ !== 'undefined' ? `calsyn@${__BUILD_SHA__}` : undefined,

    // Pas de PII automatique. On taggue manuellement avec setUser().
    sendDefaultPii: false,

    // Sample rate : 100% des erreurs en prod, 0.1 (10%) des transactions perf
    tracesSampleRate: ENV === 'production' ? 0.1 : 1.0,

    // Replay session : 0% par défaut (lourd), 100% sur erreur
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.browserTracingIntegration(),
      // RGPD : on masque tout texte/inputs dans les replays. Le replay sert à
      // visualiser la séquence UI, pas à exfiltrer des données prospects.
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
      // Capture console.error / console.warn comme breadcrumbs
      Sentry.captureConsoleIntegration({ levels: ['error', 'warn'] }),
    ],

    // Filtre les erreurs non-actionnables (ex: extensions browser)
    ignoreErrors: [
      /Non-Error promise rejection captured/,
      /ResizeObserver loop limit exceeded/,
      /ResizeObserver loop completed with undelivered notifications/,
      // Ignorer les erreurs Twilio Voice fréquentes en dev
      /AcquisitionFailedError/,
    ],

    beforeSend(event, _hint) {
      // Drop les events qui viennent uniquement d'extensions chrome
      if (event.exception?.values?.some(v => v.stacktrace?.frames?.some(f => f.filename?.includes('chrome-extension://')))) {
        return null
      }
      // Scrub PII des messages, request bodies, breadcrumbs
      return scrubPII(event)
    },

    beforeBreadcrumb(breadcrumb) {
      // Scrub PII des breadcrumbs (URL, message, data)
      if (breadcrumb.message) breadcrumb.message = scrubString(breadcrumb.message)
      if (breadcrumb.data) {
        for (const k of Object.keys(breadcrumb.data)) {
          const v = breadcrumb.data[k]
          if (typeof v === 'string') breadcrumb.data[k] = scrubString(v)
        }
      }
      return breadcrumb
    },
  })
}

// Patterns PII : emails, téléphones E.164, JWT, Bearer tokens, recording SIDs
const PII_PATTERNS: Array<[RegExp, string]> = [
  [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]'],
  [/(\+?\d{1,3}[ -]?)?\(?\d{2,4}\)?[ -]?\d{2,4}[ -]?\d{2,4}[ -]?\d{2,4}/g, '[phone]'],
  [/Bearer\s+[A-Za-z0-9._\-]+/g, 'Bearer [redacted]'],
  [/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, '[jwt]'],
  [/RE[a-f0-9]{32}/g, '[recordingSid]'],
  [/CA[a-f0-9]{32}/g, '[callSid]'],
  [/SM[a-f0-9]{32}/g, '[messageSid]'],
]

function scrubString(s: string): string {
  if (!s || typeof s !== 'string') return s
  let out = s
  for (const [re, repl] of PII_PATTERNS) out = out.replace(re, repl)
  return out
}

function scrubPII(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  // Message principal
  if (event.message) event.message = scrubString(event.message)
  // Exceptions
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = scrubString(ex.value)
    }
  }
  // Request URL/data
  if (event.request) {
    if (event.request.url) event.request.url = scrubString(event.request.url)
    if (typeof event.request.data === 'string') event.request.data = scrubString(event.request.data)
  }
  // Extra/contexts arbitraires
  if (event.extra) {
    for (const k of Object.keys(event.extra)) {
      const v = event.extra[k]
      if (typeof v === 'string') event.extra[k] = scrubString(v)
    }
  }
  return event
}

/** Identifie l'user pour les erreurs (à appeler après login). */
export function identifySentryUser(user: { id: string; email?: string; role?: string; orgId?: string } | null) {
  if (!DSN) return
  if (!user) {
    Sentry.setUser(null)
    return
  }
  Sentry.setUser({
    id: user.id,
    email: user.email,
    segment: user.role,  // sdr / admin / super_admin
  })
  if (user.orgId) Sentry.setTag('organisation_id', user.orgId)
  if (user.role) Sentry.setTag('role', user.role)
}

/** Wrapper React ErrorBoundary configuré (utilisé dans App.tsx) */
export const ErrorBoundary = Sentry.ErrorBoundary

/** Helper pour capturer une erreur manuelle avec contexte. */
export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (!DSN) {
    console.error('[error]', error, context)
    return
  }
  Sentry.captureException(error, { extra: context })
}
