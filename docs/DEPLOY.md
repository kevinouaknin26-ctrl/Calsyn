# Workflow de déploiement Calsyn

## Environnements

| Env | URL | Branche git | Supabase |
|---|---|---|---|
| **Production** | calsyn.app | `main` | projet `callio-v2` (enrpuayypjnpfmdgpfhs) |
| **Preview** | `<branch>-calsyn.vercel.app` (auto par Vercel) | toute branche feature | **même DB que prod** ⚠️ |

> **⚠️ Limite actuelle** : pas de DB staging dédiée. Les previews Vercel partagent la DB prod.
> Donc tester les changements de schéma ou de données → toujours sur le projet de backup
> `calsyn-restore-20260414` ou via transaction `BEGIN..ROLLBACK`.

## Filets de sécurité actifs

1. **Sentry** front : capture toutes les erreurs JS, identifiées par user/org/role.
   - Activable via `VITE_SENTRY_DSN` dans Vercel env vars.
2. **CI Github Actions** (`.github/workflows/ci.yml`) :
   - Type check (`tsc --noEmit`)
   - Build production (`vite build`)
   - Bundle size warning > 2.5MB
   - Migration safety check (header obligatoire, warnings sur DROP/TRUNCATE/DELETE)
3. **PR template** (`.github/pull_request_template.md`) :
   - Checklist obligatoire avant merge
   - Section dédiée pour migrations DB et changements RLS
4. **PITR Supabase** : à activer dans Studio → Settings → Database → Point-in-time Recovery
   (permet rollback à n'importe quel moment des 7 derniers jours).

## Workflow recommandé pour une feature

```bash
# 1. Branche feature
git checkout -b feat/ma-feature

# 2. Code, tests locaux
npx tsc --noEmit
npx vite build

# 3. Si migration DB sensible :
./scripts/migration-preflight.sh supabase/migrations/038_xxx.sql

# 4. Push → Vercel preview auto
git push origin feat/ma-feature

# 5. Ouvrir une PR → CI tourne, checklist à compléter
# 6. Pour les migrations : "OK prod" explicite de Kevin avant merge
# 7. Merge sur main → déploiement auto via Vercel
```

## Workflow pour une migration DB sensible

1. Écrire la migration dans `supabase/migrations/NNN_xxx.sql`
2. Lancer le pre-flight : `./scripts/migration-preflight.sh supabase/migrations/NNN_xxx.sql`
3. **Tester sur le projet de backup** `calsyn-restore-20260414` :
   - Apply la migration
   - Effectuer les counts/queries de validation
   - Documenter les résultats dans la PR
4. **Backup point-in-time** disponible côté prod (PITR) avant d'appliquer
5. **OK prod explicite** de Kevin via commentaire de PR
6. Apply via MCP supabase ou SQL Editor du Studio prod

## Variables d'environnement Vercel

| Nom | Description | Visibilité |
|---|---|---|
| `VITE_SUPABASE_URL` | https://enrpuayypjnpfmdgpfhs.supabase.co | public (anon) |
| `VITE_SUPABASE_ANON_KEY` | Clé anon (legacy JWT) | public |
| `VITE_APP_ENV` | `production` / `staging` / `development` | public |
| `VITE_SENTRY_DSN` | DSN Sentry pour error tracking | public (DSN est public par design) |

## Variables Supabase (edge functions)

| Nom | Source |
|---|---|
| `SUPABASE_URL` | auto-injecté |
| `SUPABASE_SERVICE_ROLE_KEY` | auto-injecté |
| `SUPABASE_SECRET_KEY` | sb_secret_* (modern) — auto-injecté |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | manuel (Studio → Edge Functions → Secrets) |
| `ANTHROPIC_API_KEY` | manuel |
| `DEEPGRAM_API_KEY` | manuel |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | manuel |
| `RESEND_API_KEY` | manuel (transac email password reset) |

## Vault secrets (DB)

```sql
-- Lister
SELECT name FROM vault.secrets;

-- Update
SELECT vault.update_secret(
  (SELECT id FROM vault.secrets WHERE name = 'service_role_key'),
  '<new_value>',
  'service_role_key'
);
```

Secrets actuels :
- `service_role_key` : utilisé par le cron `process-analysis` pour s'auto-authentifier

## En cas de problème

| Symptôme | Action |
|---|---|
| Front cassé, page blanche | Sentry → identifier l'erreur, rollback Vercel sur le déploiement précédent |
| Migration foireuse | PITR → restore point-in-time avant la migration |
| Cron qui plante | Logs Supabase → Edge Functions → vérifier l'auth (service_role/secret_key) |
| Twilio/Gmail 401 | Vérifier les secrets edge functions, refresh OAuth si besoin |
