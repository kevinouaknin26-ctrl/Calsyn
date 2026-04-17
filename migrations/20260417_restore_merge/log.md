# Log d'exécution — Migration 20260417

## Phase 1 — Backup prod (read-only)

| # | Table | Status | Rows | Taille | Timing | Commit |
|---|-------|--------|------|--------|--------|--------|
| 1 | organisations | ⏳ | - | - | - | - |
| 2 | profiles | ⏳ | - | - | - | - |
| 3 | prospect_fields | ⏳ | - | - | - | - |
| 4 | prospect_lists | ⏳ | - | - | - | - |
| 5 | prospects | ⏳ | - | - | - | - |
| 6 | calls | ⏳ | - | - | - | - |
| 7 | activity_logs | ⏳ | - | - | - | - |
| 8 | prospect_socials | ⏳ | - | - | - | - |
| 9 | prospect_field_values | ⏳ | - | - | - | - |
| 10 | dialing_sessions + dialing_session_calls | ⏳ | - | - | - | - |
| 11 | analysis_jobs + crm_statuses | ⏳ | - | - | - | - |

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
