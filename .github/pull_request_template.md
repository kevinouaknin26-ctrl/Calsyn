## Quoi
<!-- Description courte du changement, en 1-2 phrases. Pourquoi ce changement existe. -->

## Type
- [ ] feat (nouvelle feature)
- [ ] fix (correction de bug)
- [ ] ux (changement UI/UX uniquement)
- [ ] refactor (no-op fonctionnel)
- [ ] perf (optimisation)
- [ ] chore (config, deps, CI)

## Checklist avant merge

- [ ] `npx tsc --noEmit` passe
- [ ] `npx vite build` passe
- [ ] Testé manuellement en local (parcours golden : login → action principale)
- [ ] Pas de `console.log` debug oublié
- [ ] Pas de TODO non documenté

## Si la PR touche la base de données

- [ ] Migration SQL ajoutée dans `supabase/migrations/NNN_*.sql` avec header commentaire (`-- description`)
- [ ] Pas de DROP / TRUNCATE / DELETE sans WHERE non justifiés
- [ ] **Validation manuelle effectuée** : count avant/après ou query de vérification → ajouter le résultat ci-dessous
- [ ] **OK prod explicite** ajouté en commentaire de la PR avant merge (loi absolue : pas de prod sans staging + OK explicite)

```sql
-- Validation manuelle (à compléter avant merge) :
-- SELECT COUNT(*) FROM table WHERE ... -- avant : X, après : Y
```

## Si la PR touche les permissions/RLS

- [ ] Test simulé pour chaque rôle (super_admin, admin, sdr) sur le projet de backup
- [ ] Aucun élargissement non-voulu (vérifier que les contraintes existantes restent)
- [ ] Le filet `organisation_id` est toujours présent

## Captures d'écran (si UI)
<!-- Glisser-déposer les images ici -->
