# Backup Drill

Procédure trimestrielle pour valider que les backups Supabase sont restaurables. Sans drill, les backups n'existent pas.

## Objectifs

- **RPO** (Recovery Point Objective) : 24h max — Supabase fait un backup quotidien
- **RTO** (Recovery Time Objective) : 1h — du moment où on identifie le besoin au moment où le service tourne sur les données restaurées

## Backup actuel

- Provider : Supabase managed (PITR — Point In Time Recovery sur plan Pro)
- Fréquence : continu (WAL archiving), snapshots quotidiens
- Rétention : 7 jours par défaut, à upgrader sur plan Team pour 30j
- DR snapshot : projet `calsyn-restore-20260414` (backup du crash cascade DELETE du 15 avril) — **NE PAS TOUCHER**

## Drill (à faire trimestriellement)

### 1. Snapshot prod
```bash
# Dump complet
supabase db dump --project-ref enrpuayypjnpfmdgpfhs > backup-$(date +%Y%m%d).sql

# Vérifier la taille (sanity check)
ls -lh backup-*.sql
# Doit être >= 50 MB pour un projet en activité
```

### 2. Créer un projet test
```bash
# Via Dashboard ou MCP
# Créer un Supabase project temporaire "calsyn-drill-YYYYMMDD"
# Region : eu-west-3 (même que prod pour latence comparable)
```

### 3. Restore
```bash
# Connexion DB
PGPASSWORD=<test_pwd> psql \
  -h db.<test_project>.supabase.co -U postgres -d postgres \
  -f backup-YYYYMMDD.sql

# Vérifier que les tables critiques sont restaurées
psql ... -c "SELECT count(*) FROM organisations, profiles, calls, prospects;"
```

### 4. Smoke test
- [ ] `SELECT count(*) FROM auth.users;` → cohérent avec prod
- [ ] `SELECT count(*) FROM public.calls WHERE created_at > now() - interval '24h';` → cohérent
- [ ] Vérifier 1 prospect et son historique d'appels
- [ ] Login via interface (mocker SUPABASE_URL vers le test project) → OK

### 5. Document
Dans `docs/drills/YYYYMMDD-backup-drill.md` :
- Date et durée
- Taille du dump
- Temps de restore
- Tests passés / failed
- Actions correctives si problème

### 6. Cleanup
```bash
# Supprimer le projet test (économise des credits Supabase)
# Via Dashboard → Settings → Pause/Delete project
```

## En cas de besoin de vraie restauration prod

⚠️ **N'écrase JAMAIS la prod**. Restaure dans un nouveau projet d'abord, valide, puis redirige le DNS.

```bash
# 1. Créer projet "calsyn-restored-YYYYMMDD"
# 2. Restaurer le backup
# 3. Smoke test
# 4. Update Vercel env VITE_SUPABASE_URL → nouveau projet
# 5. Re-deploy frontend
# 6. Vérifier
# 7. Si OK : pause l'ancien projet (mais le garder 30j minimum)
```

## Calendrier 2026

- [ ] Q1 : 2026-04-30 (premier drill)
- [ ] Q2 : 2026-07-31
- [ ] Q3 : 2026-10-31
- [ ] Q4 : 2027-01-31
