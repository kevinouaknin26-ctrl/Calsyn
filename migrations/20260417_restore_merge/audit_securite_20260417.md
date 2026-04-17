# Audit de sécurité Calsyn — 17 avril 2026

**Scope** : app Vite + React déployée sur `calsyn.app` (Vercel), DB Supabase `enrpuayypjnpfmdgpfhs`, Twilio pour voix. 1 user (Kevin, super_admin).

**Méthode** : scan code (agent Explore), audit RLS policies, inventaire edge functions.

---

## 🔴 CRITIQUE — À fixer avant d'ouvrir à d'autres users

### C1. Webhooks Twilio sans validation de signature
**Fichiers** : `supabase/functions/{recording-callback,amd-callback,status-callback,call-webhook}/index.ts`

**Risque** : un attaquant qui connaît les URLs des edge functions (elles sont dans le bundle JS public) peut POSTer des faux webhooks pour :
- Injecter des faux `RecordingUrl` dans des calls → data corrompue
- Modifier le `CallStatus` d'un call en cours
- Déclencher de fausses détections AMD (machine detection)

**Exploit** : `POST https://<supabase-url>/functions/v1/recording-callback` avec body Twilio forgé.

**Fix** : implémenter `twilio.validateRequest(authToken, signature, url, params)` dans chaque webhook. Le `X-Twilio-Signature` header prouve l'origine.

### C2. `end-call` sans JWT check
**Fichier** : `supabase/functions/end-call/index.ts`

**Risque** : endpoint accepte n'importe quel `callSid` en JSON sans auth. Un attaquant peut terminer n'importe quel appel.

**Fix** : vérifier JWT (`auth.getUser()`) + vérifier que l'user est le `sdr_id` du call ou admin de son org avant d'appeler Twilio.

### C3. `recording-proxy` sans check ownership
**Fichier** : `supabase/functions/recording-proxy/index.ts`

**Risque** : le proxy télécharge n'importe quelle URL Twilio et la renvoie. Si un user A connaît l'URL d'un recording du user B (même org différente), il peut l'écouter via le proxy. Multi-tenant = leak grave.

**Fix** : avant de proxy, lookup dans `calls` par `recording_url` ou `call_sid`, puis vérifier que `auth.uid()` matche `sdr_id` ou est admin de la même organisation que le call.

### C4. CORS wildcard sur edge functions
**Fichiers** : toutes les edge functions

**Risque** : `Access-Control-Allow-Origin: *` + `Allow-Headers: *` permet à n'importe quelle page web d'appeler ces endpoints. Combiné à un JWT leaké (XSS, phishing), ça facilite l'exfiltration.

**Fix** : restreindre à `https://calsyn.app` + domaines preview Vercel explicites.

---

## 🟠 ÉLEVÉ

### E1. `recording-callback` TODO signature documenté
Le commentaire dans `recording-callback/index.ts:12` dit explicitement "TODO: validation signature". La faille est connue mais pas corrigée. Merger C1.

### E2. Logique fallback `call-webhook` inbound fragile
**Fichier** : `call-webhook/index.ts:81-94`

Si aucun user n'a `assigned_phones` incluant le numéro appelé, fallback sur "le premier admin/super_admin de l'org" — prend le PREMIER créé par `created_at`. En single-tenant c'est toi. Mais en multi-tenant, un nouvel admin pourrait hijack les appels entrants historiques en modifiant son `created_at`.

**Fix** : refuser l'appel + logger si aucun routing clair, au lieu de fallback.

### E3. Pas de rate-limiting sur edge functions
**Risque** : un attaquant peut flood les endpoints Twilio/Claude/Deepgram. Chaque call consomme des $ (API Deepgram, Claude). Coûts explosifs possibles.

**Fix** : Vercel Rate Limiting (feature Vercel) OU middleware Supabase Edge Runtime avec compteur Redis.

### E4. Validation de numéros côté client uniquement
**Fichiers** : `useProspects.ts`, `CSVImport.tsx`

Pas de Zod schema ni de contrainte CHECK en DB. Un prospect avec `phone="<script>"` ou `phone=""` passerait. XSS potentiel si affiché non-échappé (React escape par défaut, mais pas dans tous les cas).

**Fix** : Zod schema sur phone (E.164) + email (RFC 5322) avant `.insert()` ; CHECK constraint en DB.

---

## 🟡 MOYEN

### M1. Pas de CSP ni headers sécu HTTP
**Fichier** : `vercel.json`

Aucun `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`. Une page tierce peut iframer calsyn.app (clickjacking).

**Fix** : ajouter `headers` dans `vercel.json` :
```json
"headers": [{ "source": "/(.*)", "headers": [
  {"key":"X-Frame-Options","value":"DENY"},
  {"key":"X-Content-Type-Options","value":"nosniff"},
  {"key":"Referrer-Policy","value":"strict-origin-when-cross-origin"},
  {"key":"Content-Security-Policy","value":"default-src 'self'; ..."}
]}]
```

### M2. `.env.example` incomplet
Actuellement 2 vars seulement. Tous les secrets Twilio/Deepgram/Google utilisés en edge functions sont invisibles pour un nouveau dev.

**Fix** : lister toutes les env vars requises (commentées si secrets).

### M3. Dépendances NPM non auditées
**Fichier** : `package.json` — versions flottantes `^`, pas de `npm audit` récent documenté.

**Fix** : lancer `npm audit --production` régulièrement + fix les High/Critical.

### M4. Gestion d'erreurs silencieuse
Beaucoup de `.catch(() => {})` et de retours `{ ok: true }` même quand une erreur Twilio/Deepgram se passe. Les ops sont aveugles.

**Fix** : logger structuré + alertes Slack/mail sur erreurs critiques.

### M5. `prospects.UPDATE/DELETE` sans check de rôle
**RLS** : `organisation_id = private.get_my_org()` seulement. N'importe quel member de l'org peut modifier/supprimer n'importe quel prospect. OK en single-tenant, problématique dès qu'une équipe est ajoutée.

**Fix** : ajouter `AND private.get_my_role() = ANY(ARRAY['admin','manager'])` sur UPDATE/DELETE.

### M6. `activity_logs` INSERT sans check user_id
Le check RLS vérifie juste l'org, pas que `user_id = auth.uid()`. Un user peut logger une action en se faisant passer pour un autre user.

**Fix** : `CHECK ((user_id = auth.uid() OR user_id IS NULL) AND organisation_id = private.get_my_org())`.

---

## 🟢 POINTS POSITIFS VÉRIFIÉS

- ✅ **RLS activé sur 15/15 tables publiques**, policies scoped sur `organisation_id` via fonction SECURITY DEFINER `private.get_my_org()`
- ✅ **`organisations` CRUD strict** : seul `is_super_admin()` peut INSERT/DELETE, update limité aux admins de l'org
- ✅ **`profiles`** : vues hiérarchiques (self, org, super_admin), UPDATE restrictif
- ✅ **`calls.INSERT`** check `sdr_id = auth.uid()` → impossible d'insérer un call au nom d'un autre SDR
- ✅ **Pas de policy DELETE sur `calls`** → impossible de supprimer via API (archivage via `deleted_at` uniquement)
- ✅ **Triggers `prevent_hard_delete_*`** actifs sur organisations/profiles/prospects/lists/crm_statuses/socials/fields → protection contre cascade DELETE accidentelle (leçon du 15 avril)
- ✅ **Aucun secret hardcodé** dans le code client — credentials Twilio/Deepgram/Claude viennent des env vars Vercel
- ✅ **JWT vérifié** sur `token-gen`, `initiate-call`, `invite-member` via `auth.getUser()`
- ✅ **Anon key** correctement utilisée côté client (protégée par RLS), service_role uniquement côté edge functions
- ✅ **TypeScript strict** activé, pas de `any` massif
- ✅ **GitHub Push Protection** activé (démontré aujourd'hui — bloque les secrets Twilio en commit)

---

## PLAN DE REMÉDIATION — ORDRE RECOMMANDÉ

**Semaine 1 (non-bloquant single-user, bloquant avant équipe)** :
1. C1 — validation signature Twilio sur tous les webhooks (~2h)
2. C2 — JWT + ownership sur `end-call` (~30min)
3. C3 — ownership sur `recording-proxy` (~1h)
4. C4 — CORS restrictif (~15min)

**Semaine 2 (hardening général)** :
5. M1 — CSP + headers Vercel (~30min)
6. E3 — rate-limiting edge functions (~2h)
7. E4 — Zod validation (~1h)

**Semaine 3 (propre multi-tenant prêt)** :
8. M5, M6, E2 — RLS raffiné par rôle
9. M3, M4 — dépendances + error logging

---

## SUIVI

Ce rapport est versionné dans `migrations/20260417_restore_merge/audit_securite_20260417.md`. Refaire un audit complet après chaque étape majeure (onboarding d'un user, intégration nouvelle, déploiement d'une edge function).
