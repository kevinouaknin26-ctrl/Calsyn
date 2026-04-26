# Secrets Rotation Plan

Procédure et calendrier de rotation des secrets utilisés par Calsyn. À suivre annuellement (min) ou immédiatement en cas de fuite suspectée.

## Inventaire

| Secret | Stockage | Utilisation | Calendrier rotation |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard + Edge Functions secrets | Toutes les fonctions admin DB | Annuel + sur breach |
| `TWILIO_AUTH_TOKEN` | Supabase Edge Functions secrets | Webhook signature + outbound API | Annuel + sur breach |
| `TWILIO_ACCOUNT_SID` | Idem | Auth Twilio API | Pas rotation (id permanent) |
| `GOOGLE_CLIENT_SECRET` | Supabase Edge Functions secrets | OAuth flow Gmail/Calendar | Annuel |
| `RESEND_API_KEY` | Supabase Edge Functions secrets | Email invitations | Annuel |
| `SENTRY_DSN_BACKEND` | Idem | Sentry backend | Pas rotation (DSN public-ish) |
| `VITE_SENTRY_DSN` | Vercel env vars | Sentry frontend | Idem |
| `JWT_SECRET` (Supabase) | Supabase Dashboard | Signature JWT auth | NE PAS ROTATE sans plan dual-sign (déconnecte tous les users) |
| `RECORDING_SIGNING_SECRET` | Supabase Edge Functions secrets | HMAC signed URLs recording-proxy | Trimestriel |

## Procédure générale (zero-downtime)

1. **Générer le nouveau secret** dans le dashboard du provider
2. **Ajouter** le nouveau secret en parallèle de l'ancien (si possible)
3. **Re-déployer** les services qui consomment le secret
4. **Vérifier** : logs OK, pas d'erreur 401/403
5. **Révoquer** l'ancien secret après 24h de coexistence

## Rotation Twilio Auth Token

```bash
# 1. Twilio Console → Account → API keys & tokens → Auth Token → "Request new token"
# 2. Copy new token
# 3. Update Supabase secret
supabase secrets set TWILIO_AUTH_TOKEN=<new_token> --project-ref enrpuayypjnpfmdgpfhs
# 4. Re-deploy webhook functions (signature verification doit passer avec le nouveau token)
for fn in status-callback recording-callback amd-callback call-webhook sms-webhook wa-webhook; do
  supabase functions deploy $fn --project-ref enrpuayypjnpfmdgpfhs
done
# 5. Vérifier audit_events : pas de 'twilio_signature_invalid' dans les 30 min suivantes
# 6. Twilio Console → "Promote secondary" pour invalider l'ancien
```

## Rotation Supabase Service Role

⚠️ **Risque** : si une fonction edge tombe pendant la rotation, requêtes DB échouent.

```bash
# 1. Supabase Dashboard → Settings → API → Service role → "Generate new"
# 2. Update secret partout (Edge Functions ont une copie)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<new> --project-ref enrpuayypjnpfmdgpfhs
# 3. Re-deploy TOUTES les edge functions (utilisent toutes la service role)
for fn in $(ls supabase/functions/ | grep -v _shared); do
  supabase functions deploy $fn
done
# 4. Vérifier /functions/v1/health → 200
# 5. Pg cron jobs : check_rate_limit_cleanup, gmail-watch-renew, etc. utilisent l'ancienne via vault.
#    Update vault :
psql -c "UPDATE vault.secrets SET secret = '<new_key>' WHERE name = 'service_role_key';"
```

## Rotation Google OAuth

```bash
# 1. Google Cloud Console → APIs & Services → Credentials → OAuth Client → Reset secret
# 2. Update Supabase secret
supabase secrets set GOOGLE_CLIENT_SECRET=<new>
# 3. Re-deploy: google-auth, gmail-*, google-calendar
# 4. Existing user tokens (refresh_token in user_integrations) restent valides — pas d'impact user
```

## En cas de breach suspect

1. **Rotate immédiatement** les secrets concernés (procédures ci-dessus)
2. **Invalider toutes les sessions** : `TRUNCATE auth.sessions;`
3. **Audit dans audit_events** : qui a accédé à quoi dans les 30 derniers jours
4. **Notifier les users** sous 72h (RGPD Article 34) si données personnelles compromises
5. **Post-mortem** : voir `RUNBOOK_INCIDENT.md`

## Calendrier 2026 (initial)

- [ ] Q1 (avril) : `RECORDING_SIGNING_SECRET`
- [ ] Q2 (juillet) : `RECORDING_SIGNING_SECRET`
- [ ] Q3 (octobre) : `RECORDING_SIGNING_SECRET` + `TWILIO_AUTH_TOKEN`
- [ ] Q4 (janvier 2027) : `RECORDING_SIGNING_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` + `GOOGLE_CLIENT_SECRET` + `RESEND_API_KEY` (rotation annuelle complète)
