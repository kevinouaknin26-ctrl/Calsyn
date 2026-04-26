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
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
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

    beforeSend(event, hint) {
      // Drop les events qui viennent uniquement d'extensions chrome
      if (event.exception?.values?.some(v => v.stacktrace?.frames?.some(f => f.filename?.includes('chrome-extension://')))) {
        return null
      }
      return event
    },
  })
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
