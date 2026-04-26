# V1 Security Hardening — récap

Document de synthèse pour review dev lead. Décrit ce qui a été ajouté côté sécu pour la V1.0, comment vérifier chaque contrôle, et ce qui reste pour V1.1.

## Threat model couvert

| OWASP Top 10 (2021) | Contrôles |
|---|---|
| A01 Broken Access Control | RLS multi-tenant auditée toutes tables, super_admin protection (last super_admin can't be removed), audit_events RLS admin-only |
| A02 Cryptographic Failures | HSTS preload, TLS 1.2+ (Vercel), Supabase chiffre disque + Storage |
| A03 Injection | Supabase client paramétrés, pas de raw SQL côté front, edge functions valident input |
| A04 Insecure Design | Defense in depth : RLS → rate limit → audit log → CSP |
| A05 Security Misconfiguration | Security headers Vercel (HSTS/CSP/X-Frame/X-Content-Type/Referrer/Permissions/COOP), CORS audité |
| A07 Identification and Authentication Failures | Password policy 12 chars + complexité, Supabase Auth refresh token rotation, session invalidation au password change |
| A08 Software and Data Integrity Failures | Twilio webhook signature verification (HMAC-SHA1) sur 5 endpoints, CI quality-gates sur PR |
| A09 Security Logging and Monitoring Failures | Sentry frontend + 31 edge functions backend, audit_events pour actions sensibles, /health endpoint |

| RGPD | Contrôles |
|---|---|
| Article 5 — minimisation | Sentry PII scrubbing (emails/téléphones/JWT/SIDs), replay maskAllText/Inputs |
| Article 17 — droit à l'oubli | `gdpr` edge function : `request_deletion` + `delete_user` (super_admin) avec anonymisation des FK orphelines |
| Article 20 — portabilité | `gdpr` edge function : `export` retourne JSON de toutes les données du user |
| Article 30 — registre | `audit_events` enregistre acteur, cible, type, IP, UA pour toutes actions sensibles |
| Article 32 — sécurité du traitement | Defense in depth ci-dessus, audit trail, /health monitoring |

## Defense in depth matrix

```
[Browser] ─→ [Vercel Edge]      [Supabase Edge Functions]   [Postgres]
            ┌─────────────┐    ┌────────────────────────┐  ┌─────────┐
            │ HSTS preload│    │ Twilio sig HMAC-SHA1   │  │ RLS par │
            │ CSP         │ →  │ Rate limiting          │ →│ membership│
            │ X-Frame DENY│    │ Sentry capture + scrub │  │ Audit   │
            │ COOP        │    │ JWT verify             │  │ events  │
            └─────────────┘    └────────────────────────┘  └─────────┘
```

## Inventaire des changements

### Infrastructure (Vercel)
- `vercel.json` : 9 headers de sécurité (HSTS preload, CSP avec whitelist explicite, X-Frame DENY, X-Content-Type nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy mic-only, COOP same-origin-allow-popups, Cache-Control immutable assets)

### Edge Functions (Supabase)
- `_shared/sentry.ts` : capture errors avec PII scrubbing (emails, phones, JWT, Twilio SIDs)
- `_shared/twilio-signature.ts` : vérification HMAC-SHA1 X-Twilio-Signature avec timing-safe equality
- 31 edge functions instrumentées Sentry (toutes sauf `logo` qui sert un PNG statique)
- 5 webhooks Twilio vérifient la signature : `status-callback`, `recording-callback`, `amd-callback`, `call-webhook` (form-urlencoded only), `sms-webhook`, `wa-webhook`
- `health` : endpoint `/functions/v1/health` no-auth qui check DB + env (200/503)
- `gdpr` : 3 actions `export`, `request_deletion`, `delete_user`
- `team-manage`, `impersonate-user`, `invite-member` loggent dans `audit_events` via RPC `log_audit_event`

### Base de données
- Migration `038_rate_limits.sql` (déjà déployée) : `check_rate_limit()` SECURITY DEFINER, limites par action
- Migration `039_audit_events.sql` (à déployer) : table `audit_events` (RLS admin-only), RPC `log_audit_event` (service_role only), colonne `profiles.deletion_requested_at`
- Migration `040_sensitive_access_audit.sql` (à déployer) : RPC `get_call_transcript()` qui audit-logge les accès aux transcriptions IA

### Frontend
- `src/lib/sentry.ts` : Sentry init avec PII scrubbing, replay maskAllText/Inputs/blockAllMedia, beforeBreadcrumb scrubbing
- `src/lib/password.ts` : `validatePassword` (12 chars, upper/lower/digit/special, anti-common, anti-similarity)
- `src/pages/AcceptInvite.tsx`, `ResetPassword.tsx`, `Settings.tsx` : utilisent `validatePassword`

### CI
- `.github/workflows/zap-baseline.yml` : OWASP ZAP scan hebdo (lundi 4h UTC) + manuel via workflow_dispatch
- `.zap/rules.tsv` : règles ignorées documentées

## Comment vérifier (checklist dev lead)

### Headers
```bash
curl -I https://calsyn.app/ | grep -E 'Strict-Transport|Content-Security|X-Frame|Permissions-Policy'
# Doit retourner les 4 headers
```

### Health endpoint
```bash
curl https://<project>.supabase.co/functions/v1/health
# 200 + { status: 'ok', checks: { db: { ok: true }, env: { ok: true } } }
```

### Twilio signature rejection
```bash
# POST sans signature → 403
curl -X POST https://<project>.supabase.co/functions/v1/sms-webhook \
  -d "From=%2B33000000000&To=%2B33000000000&Body=test"
# Doit retourner 403 Forbidden
```

### Audit log accessible aux admins
```sql
-- En tant qu'admin/super_admin
SELECT event_type, actor_email, target_email, description, created_at
FROM audit_events
ORDER BY created_at DESC
LIMIT 20;
-- Doit retourner les events. En tant que sdr → 0 rows (RLS).
```

### RPC log_audit_event protégée
```sql
-- En tant qu'authenticated
SELECT public.log_audit_event(...);
-- Doit retourner: ERROR: permission denied for function log_audit_event
```

### Password policy
1. Aller sur `/accept-invite` ou `/reset-password`
2. Taper `password123` → erreur "12 caractères minimum, ne doit pas contenir mot trop commun"
3. Taper `MonMotDePasse2026!` → OK

### Sentry PII scrubbing
1. Trigger une erreur frontend (ex: throw dans un handler)
2. Inspecter l'event Sentry
3. Vérifier que les emails/phones/JWT sont remplacés par `[email]`, `[phone]`, `[jwt]`

## Limitations connues V1

Voir [`V1_SECURITY_GAPS.md`](./V1_SECURITY_GAPS.md) pour le plan de comblement.

## Migrations à appliquer (LOI ABSOLUE — staging avant prod)

1. `039_audit_events.sql` — table audit + RPC + colonne deletion_requested_at
2. `040_sensitive_access_audit.sql` — RPC get_call_transcript

Workflow :
1. Apply en staging (Supabase project séparé)
2. Run smoke test : insert manuel via RPC, lecture via vue, vérif RLS
3. Validation : "OK prod" explicite horodaté
4. Apply prod via `supabase db push` (Supabase CLI) ou MCP `apply_migration`

## Edge functions à déployer

```bash
# 33 fonctions au total. Les 2 nouvelles :
supabase functions deploy health --no-verify-jwt
supabase functions deploy gdpr

# Les 31 modifiées :
for fn in $(ls supabase/functions/ | grep -v _shared); do
  supabase functions deploy $fn
done
```

## Variables d'env Supabase Edge Functions à vérifier

| Var | Utilisée par | Notes |
|---|---|---|
| `SENTRY_DSN_BACKEND` | `_shared/sentry.ts` | DSN du projet Sentry backend (peut être différent du frontend) |
| `TWILIO_AUTH_TOKEN` | `_shared/twilio-signature.ts` | Token Twilio (déjà set pour outbound) |
| `TWILIO_SKIP_SIGNATURE_CHECK` | `_shared/twilio-signature.ts` | À NE PAS set en prod (bypass dev only) |
| `SUPABASE_ENV` | `_shared/sentry.ts` | `production` / `staging` — taggue les events Sentry |
