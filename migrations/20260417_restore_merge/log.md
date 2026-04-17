# Log d'exécution — Migration 20260417

## Phase 1 — Backup prod (read-only) ✅ COMPLÈTE

Script utilisé : `dump_tables.py prod` (direct connection Postgres port 5432).
Exporté en une passe, fichiers dans `./prod/`.

| # | Table | Rows | Taille |
|---|-------|------|--------|
| 1 | organisations | 2 | 1.8 KB |
| 2 | profiles | 2 | 1.4 KB |
| 3 | prospect_fields | 13 | 4.0 KB |
| 4 | prospect_lists | 6 | 1.9 KB |
| 5 | prospects | 222 | 205.6 KB |
| 6 | calls | 54 | 595.5 KB |
| 7 | activity_logs | 573 | 226.1 KB |
| 8 | prospect_socials | 179 | 52.1 KB |
| 9 | prospect_field_values | 1277 | 444.7 KB |
| 10 | dialing_sessions | 0 | - |
| 10b | dialing_session_calls | 0 | - |
| 11 | analysis_jobs | 29 | 44.6 KB |
| 11b | crm_statuses | 0 | - |
| **TOTAL** | **13 tables** | **2357 rows** | **~1.6 MB** |

Commits antérieurs de cette phase (contenu re-exporté après pour uniformité) :
- a37d323 (step 1 organisations)
- 883eb40 (step 2 profiles)
- ae192cf (step 3 prospect_fields)

Commit final Phase 1 : voir git log.

## Phase 2 — Export restore (read-only) ✅ COMPLÈTE

Script : `dump_tables.py restore` via pooler session mode (`aws-1-eu-west-3.pooler.supabase.com:5432`, user `postgres.wjqnrlhfwjeobnoxkpdi`). Le direct port 5432 refuse les connections sur ce projet.

| # | Table | Rows | Taille |
|---|-------|------|--------|
| 1 | organisations | 1 | 0.8 KB |
| 2 | profiles | 1 | 0.4 KB |
| 3 | prospect_fields | 16 | 4.5 KB |
| 4 | prospect_lists | 8 | 2.4 KB |
| 5 | prospects | 280 | 250.8 KB |
| 6 | calls | 125 | 371.2 KB |
| 7 | activity_logs | 269 | 106.3 KB |
| 8 | prospect_socials | 212 | 54.9 KB |
| 9 | prospect_field_values | 1345 | 444.5 KB |
| 10 | dialing_sessions | 16 | 9.3 KB |
| 10b | dialing_session_calls | 0 | - |
| 11 | analysis_jobs | 52 | 41.3 KB |
| 11b | crm_statuses | 13 | 3.8 KB |
| **TOTAL** | **13 tables** | **2338 rows** | **~1.26 MB** |

## Phase 3 — Génération script (local) ✅ COMPLÈTE

Script : `generate_merge.py` (parse les JSON, build mapping field_id, génère merge.sql).

Résultat `merge.sql` (gitignored, local) :
- 1.26 MB, 2353 lignes
- **2316 INSERTs** transactionnels avec `ON CONFLICT (id) DO NOTHING`
- Wrapper `DO $$ BEGIN … EXCEPTION WHEN OTHERS THEN RAISE; END $$`
- Org remappée : `43d695b7…` → `8228401f…`
- Field mapping : 7 fields prod déjà existants réutilisés, 9 nouveaux ajoutés

Répartition des INSERTs :
- prospect_fields (new) : 9
- prospect_lists : 8
- prospects : 280
- calls : 125
- prospect_socials : 212
- prospect_field_values : 1345 (0 skip, tous les field_id mappés)
- activity_logs : 269
- analysis_jobs : 52
- dialing_sessions : 16
- dialing_session_calls : 0

## Phase 4 — Exécution merge (écriture prod) ✅ COMPLÈTE en 0.90s

Transaction atomique `DO $$ … $$` exécutée via direct Postgres. Aucune erreur.

| Table | Avant | Après | +rows |
|---|---|---|---|
| prospect_fields | 13 | 22 | +9 |
| prospect_lists | 6 | 14 | +8 |
| prospects | 222 | **502** | **+280** |
| calls | 54 | **178** | +124 (1 call_sid dédupliqué via ON CONFLICT) |
| prospect_socials | 179 | 391 | +212 |
| prospect_field_values | 1277 | **2622** | **+1345** |
| activity_logs | 573 | 573 | +0 (tous IDs existaient déjà) |
| analysis_jobs | 29 | 81 | +52 |
| dialing_sessions | 0 | 16 | +16 |
| **TOTAL** | **2353** | **4399** | **+2046 rows** |

## Phase 5 — Recompute agrégats ✅ COMPLÈTE en 0.08s

Transaction unique DO $$ … $$ avec 3 UPDATEs (call_count, last_call_at, last_call_outcome) via subqueries.

- `call_count` : 1 prospect mis à jour
- `last_call_at` : 44 prospects mis à jour
- `last_call_outcome` : 6 prospects mis à jour

## Phase 6 — Audios Storage ✅ INUTILE (skipped)

Découverte : les 81 `recording_url` pointent **directement vers `api.twilio.com`**, pas vers Supabase Storage. L'edge function `recording-proxy` fait le relai avec auth Twilio.

Un seul Twilio Account SID pour tous les calls (11-17 avril) — identique pour restore et prod. L'edge function actuelle a les bons credentials → **les audios historiques sont écoutables immédiatement sans migration**.

---

## 🎯 MIGRATION COMPLÈTE

- **Phase 1** ✅ Backup prod (2357 rows local)
- **Phase 2** ✅ Export restore (2338 rows local)
- **Phase 3** ✅ Génération merge.sql (2316 INSERTs)
- **Phase 4** ✅ Merge exécuté (+2046 rows en 0.90s)
- **Phase 5** ✅ Agrégats recomputed (44 updates, 0.08s)
- **Phase 6** ✅ Skipped (audios chez Twilio, pas Supabase)

**État prod final** : 4399 rows (était 2353 avant), data du 10-13 avril restaurée.
