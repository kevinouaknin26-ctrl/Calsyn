# R25 — Monitoring : Sentry React + Edge Functions

## Setup Frontend (React + Vite)
- Package : `@sentry/react`
- Init dans main.tsx avec `VITE_SENTRY_DSN`
- Integrations : BrowserTracing (performance), Replay (session replay)
- `tracesSampleRate: 0.2` en prod (20% des transactions)

## Setup Edge Functions (Deno)
- Import : `import * as Sentry from "npm:@sentry/deno"`
- Init au debut de chaque Edge Function
- Attention : Sentry Deno dans Supabase Edge Functions a des limitations connues

## Tags obligatoires sur chaque erreur
```typescript
Sentry.setTag('organisation_id', orgId)
Sentry.setTag('call_sid', callSid)
Sentry.setTag('provider', 'twilio' | 'telnyx')
Sentry.setTag('edge_function', functionName)
```
Sans ces tags, debugger un appel parmi 1000 est impossible.

## Decision
- Sentry en Phase 5 (pas en Phase 0 — pas critique pour construire)
- Tags org_id + call_sid sur chaque erreur
- Frontend + Edge Functions monitorés séparément
