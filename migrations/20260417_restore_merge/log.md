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

## Phase 2 — Export restore (read-only)

| # | Table | Status | Rows | Taille | Timing | Commit |
|---|-------|--------|------|--------|--------|--------|
| 1 | organisations | ⏳ | - | - | - | - |
| 2 | profiles | ⏳ | - | - | - | - |
| 3 | prospect_fields | ⏳ | - | - | - | - |
| 4 | prospect_lists | ⏳ | - | - | - | - |
| 5 | prospects | ⏳ | - | - | - | - |
| 6 | calls | ⏳ | - | - | - | - |
| 7 | prospect_socials | ⏳ | - | - | - | - |
| 8 | prospect_field_values | ⏳ | - | - | - | - |
| 9 | activity_logs + analysis_jobs + dialing_sessions | ⏳ | - | - | - | - |

## Phase 3 — Génération script (local)

| # | Action | Status | Commit |
|---|--------|--------|--------|
| 1 | Parser les JSON | ⏳ | - |
| 2 | Build mapping restore_field_id → prod_field_id | ⏳ | - |
| 3 | Générer les INSERTs + remap org_id | ⏳ | - |
| 4 | Envelopper dans DO $$ BEGIN … EXCEPTION … END $$ | ⏳ | - |
| 5 | Écrire merge.sql + review | ⏳ | - |

## Phase 4 — Exécution merge (écriture prod)

| # | Étape | Status | Rows insérées | Commit |
|---|-------|--------|---------------|--------|
| 1 | prospect_fields + mapping | ⏳ | - | - |
| 2 | prospect_lists | ⏳ | - | - |
| 3 | prospects (+ remap org) | ⏳ | - | - |
| 4 | calls (+ remap org) | ⏳ | - | - |
| 5 | prospect_socials | ⏳ | - | - |
| 6 | prospect_field_values (+ remap field_id) | ⏳ | - | - |
| 7 | activity_logs (+ remap org) | ⏳ | - | - |

## Phase 5 — Recompute agrégats

| # | Étape | Status | Commit |
|---|-------|--------|--------|
| 1 | prospects.call_count | ⏳ | - |
| 2 | prospects.last_call_at | ⏳ | - |
| 3 | prospects.last_call_outcome | ⏳ | - |

## Phase 6 — Audios Storage (séparé)

| # | Étape | Status | Commit |
|---|-------|--------|--------|
| 1 | Liste fichiers bucket restore | ⏳ | - |
| 2 | Download → Upload bucket prod | ⏳ | - |
| 3 | UPDATE calls.recording_url | ⏳ | - |
