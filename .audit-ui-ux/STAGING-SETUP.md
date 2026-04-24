# Setup Staging — Playbook d'exécution

Projet cible : `calsyn-restore-20260414` (ID `wjqnrlhfwjeobnoxkpdi`), région `eu-west-3`.

**État confirmé** :
- `auth.users` : 1 entrée (a préserver, pas de DELETE)
- `storage.buckets` : 0
- `storage.objects` : 0
- 14 tables publiques, toutes a 0 rows
- 0 edge functions déployées
- 12 migrations déjà appliquées côté dashboard (naming Supabase auto, pas celui du repo)

**Conclusion** : zéro donnée métier à perdre. Seul risque = perdre le user auth unique, qu'on protège en ne touchant jamais à `auth.*`.

---

## Étape 1 — Aligner le schéma (IDEMPOTENT, aucun DROP)

Je rejoue les 9 migrations du repo en mode "IF NOT EXISTS" via `apply_migration` MCP :

```
supabase/migrations/001_init.sql
supabase/migrations/002_add_prospect_fields_minari.sql
supabase/migrations/003_user_integrations.sql
supabase/migrations/004_private_recordings_bucket.sql
supabase/migrations/005_purge_oauth_tokens_c7.sql
supabase/migrations/006_voicemail_perso.sql
supabase/migrations/007_pending_voicemail_url.sql
supabase/migrations/008_sdr_scoping.sql
supabase/migrations/009_prospects_notes.sql
```

Chaque migration est rendue idempotente au besoin :
- `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ADD COLUMN` → `ADD COLUMN IF NOT EXISTS`
- `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS`
- `CREATE POLICY` → envelopper dans `DROP POLICY IF EXISTS ... ; CREATE POLICY ...`
- Fonctions RPC → `CREATE OR REPLACE FUNCTION`

Si un `ALTER` créé un conflit de type, on l'isole manuellement.

## Étape 2 — Déployer les 22 edge functions

```
amd-callback, analyze-call, call-webhook, check-active-call, end-call,
google-auth, google-calendar, initiate-call, invite-member, logo,
parallel-dial, process-analysis, recording-callback, recording-proxy,
recording-sign, save-call, status-callback, team-manage, telnyx-token,
token-gen, twilio-numbers, voicemail-drop
```

Déployées via `mcp__plugin_supabase_supabase__deploy_edge_function` une par une.

**Secrets à setter dans le dashboard Supabase avant deploy** (Project Settings → Edge Functions → Secrets) :

- `TWILIO_ACCOUNT_SID` — compte Twilio de test (ou sandbox)
- `TWILIO_AUTH_TOKEN` — idem
- `TWILIO_API_KEY` + `TWILIO_API_SECRET` — si utilisés
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — pour google-auth
- `GEMINI_API_KEY` — pour analyze-call
- `RECORDING_SIGNING_SECRET` — clé arbitraire (32 bytes hex)

**Recommandation forte** : utiliser des credentials Twilio **séparés** du compte prod (subaccount ou compte test) pour éviter que les "appels staging" utilisent les numéros prod.

## Étape 3 — Créer le bucket storage `recordings`

```sql
-- Déjà dans 004_private_recordings_bucket.sql, idempotent
INSERT INTO storage.buckets (id, name, public) VALUES ('recordings', 'recordings', false)
ON CONFLICT (id) DO NOTHING;
```

## Étape 4 — Config Vercel (à faire par Kevin dans Vercel dashboard)

Vercel → Project → Settings → Environment Variables :

| Variable | Production | Preview | Development |
|---|---|---|---|
| `VITE_SUPABASE_URL` | https://enrpuayypjnpfmdgpfhs.supabase.co | **https://wjqnrlhfwjeobnoxkpdi.supabase.co** | au choix |
| `VITE_SUPABASE_ANON_KEY` | prod anon key | **staging anon key** | au choix |
| `VITE_APP_ENV` | `production` (ou vide) | **`staging`** | `development` |

Point clé : scoper chaque variable à **Preview uniquement** (ne pas partager avec Production). Dans Vercel → Edit variable → décocher "Production", cocher "Preview" et "Development".

Résultat :
- Push sur `main` → Production deployment → pointe sur prod Supabase
- Push sur n'importe quelle autre branche → Preview deployment → pointe sur staging + affiche la bande rouge

## Étape 5 — Créer un compte test sur le staging

Via dashboard Supabase du projet staging → Authentication → Users → Invite, ou via SQL manuel :

```sql
-- Crée une org test + un SDR
INSERT INTO organisations (id, name, slug) VALUES (gen_random_uuid(), 'Staging Org', 'staging') RETURNING id;
-- Puis depuis le dashboard, invite un user audit@staging.test et assign l'organisation_id ci-dessus via profile.
```

## Étape 6 — Validation finale

- Ouvrir l'URL preview Vercel de `audit/ui-ux-sweep`
- Vérifier : **bande rouge visible en haut**
- Vérifier : login avec le compte test fonctionne
- Vérifier : Dialer charge, la prod Supabase n'est pas touchée

Si OK → on passe au sweep Playwright.

---

## Rollback

- **Aucune migration appliquée** (avant Étape 1) : rien à faire
- **Migrations appliquées, mais rien en prod touché** : le staging reste tel quel, on peut juste arrêter d'y pointer Vercel (delete env vars Preview)
- **Staging corrompu** : delete le projet Supabase + créer un nouveau à 10 $/mois (fallback)
- **Bande rouge bug** : commit `d8fcde0` → `git revert d8fcde0` → redeploy preview

En aucun cas la prod `callio-v2` (ID `enrpuayypjnpfmdgpfhs`) n'est touchée dans ce flow. Aucun script de ce plan ne référence `enrpuayypjnpfmdgpfhs`.
