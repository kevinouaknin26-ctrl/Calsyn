# R13 — RLS Multi-Tenant : patterns stricts

## Architecture
- Chaque table a une colonne `organisation_id`
- RLS filtre automatiquement par org
- Helper functions SECURITY DEFINER pour eviter les repetitions

## Helper functions (schema prive, pas expose a l'API)

```sql
-- Schema prive pour les helpers RLS
CREATE SCHEMA IF NOT EXISTS private;

-- Retourne l'org_id de l'utilisateur connecte
CREATE OR REPLACE FUNCTION private.get_my_org()
RETURNS uuid AS $$
  SELECT organisation_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Retourne le role de l'utilisateur connecte
CREATE OR REPLACE FUNCTION private.get_my_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
```

**STABLE** = Postgres cache le resultat dans la meme transaction → performance.
**SECURITY DEFINER** = execute avec les privileges du createur (bypass RLS pour lire profiles).
**Schema private** = pas expose via l'API PostgREST → pas appelable depuis le frontend.

## Pattern RLS par table

### SELECT (lecture)
```sql
-- SDR voit ses propres donnees
CREATE POLICY "sdr_select" ON calls FOR SELECT
  USING (sdr_id = auth.uid());

-- Manager/Admin voit toute l'org
CREATE POLICY "manager_select" ON calls FOR SELECT
  USING (
    organisation_id = private.get_my_org()
    AND private.get_my_role() IN ('super_admin', 'admin', 'manager')
  );
```

### INSERT
```sql
-- SDR insere uniquement pour son org et son user
CREATE POLICY "sdr_insert" ON calls FOR INSERT
  WITH CHECK (
    sdr_id = auth.uid()
    AND organisation_id = private.get_my_org()
  );
```

### UPDATE
```sql
-- SDR met a jour ses propres calls
CREATE POLICY "sdr_update" ON calls FOR UPDATE
  USING (sdr_id = auth.uid());
```

### DELETE
```sql
-- Admin uniquement
CREATE POLICY "admin_delete" ON calls FOR DELETE
  USING (
    organisation_id = private.get_my_org()
    AND private.get_my_role() IN ('super_admin', 'admin')
  );
```

## Edge Functions avec service_role
Les Edge Functions utilisent `SUPABASE_SERVICE_ROLE_KEY` qui BYPASS RLS.
**Danger** : une erreur de code peut fuiter des donnees cross-org.
**Protection** : TOUJOURS filtrer par `organisation_id` dans les requetes, meme avec service_role.
Double protection : RLS + code explicite.

## Decision
- Schema `private` pour les helpers RLS (pas expose API)
- Functions SECURITY DEFINER + STABLE pour performance
- Chaque table : 4 policies (select SDR, select manager, insert, update)
- Edge Functions : filtrent TOUJOURS par org_id meme avec service_role
- Tests : verifier qu'un user d'org A ne peut JAMAIS voir les donnees d'org B
