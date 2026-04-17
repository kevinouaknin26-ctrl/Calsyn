# Migration 20260417 — Restore merge

**Contexte** : récupérer les données perdues lors de la cascade DELETE du 15 avril 2026 (suppression manuelle d'une organisation → CASCADE sur toutes les tables dépendantes). Un projet Supabase de restore `wjqnrlhfwjeobnoxkpdi` ("calsyn-restore-20260414") contient un snapshot du 14 avril à intégrer dans la prod `enrpuayypjnpfmdgpfhs` ("callio-v2").

## Sources

- **Prod** : `enrpuayypjnpfmdgpfhs` — organisation_id Murmuse = `8228401f-816b-4faf-8d55-0b62ae9fa2a7`
- **Restore** : `wjqnrlhfwjeobnoxkpdi` — organisation_id source = `43d695b7-b981-4cde-af4f-57eac2842287`

## Mappings

- `organisation_id` : `43d695b7…` → `8228401f…`
- `prospect_fields.id` : mapping via match sur `(organisation_id, key)` — les fields déjà en prod sont réutilisés, pas écrasés
- Autres IDs (listes, prospects, calls, socials, logs) : identiques (vérifiés : 0 overlap)

## Plan — 6 phases / 38 étapes

### Phase 1 — Backup prod (11 étapes, read-only)
Export JSON de chaque table de la prod dans `./prod/` avant toute écriture.

### Phase 2 — Export restore (9 étapes, read-only)
Export JSON des tables du restore dans `./restore/`.

### Phase 3 — Génération script (5 étapes, local)
Transformation JSON → `merge.sql` avec tous les remaps + `DO $$ BEGIN … EXCEPTION … END $$`.

### Phase 4 — Exécution merge (7 étapes, écriture prod)
Run `merge.sql` via `execute_sql` en un seul DO block transactionnel.

### Phase 5 — Recompute agrégats (3 étapes, écriture prod)
UPDATE `prospects.call_count` / `last_call_at` / `last_call_outcome` depuis les calls.

### Phase 6 — Audios Storage (3 étapes, séparé)
Copie des fichiers audio du bucket restore vers le bucket prod + update `recording_url`.

## Règle de commit

**1 commit atomique par étape**. Chaque commit met à jour `log.md` avec le résultat de l'étape (rows, timing, erreurs).

## Sécurité

- Triggers `prevent_hard_delete_*` déjà en place en prod → protection contre nouvelle cascade accidentelle.
- `ON CONFLICT (id) DO NOTHING` sur tous les INSERTs → jamais d'écrasement.
- Transaction avec EXCEPTION → rollback auto en cas d'erreur.
