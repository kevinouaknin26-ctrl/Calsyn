-- 008_sdr_scoping.sql
-- SDR ne voit que les listes qui lui sont assignées (prospect_lists.assigned_to[]),
-- les prospects de ces listes, et les numéros phone_inventory correspondant à son
-- profile.assigned_phones[]. Admin / manager / super_admin voient tout.

-- ── Baseline : backfill assigned_to sur listes NULL vers le super_admin
--   (ainsi aucune liste n'est orpheline après passage en RLS stricte)
UPDATE prospect_lists
SET assigned_to = ARRAY['327472be-c0ca-4939-9b22-1004081a95cc']::text[]
WHERE (assigned_to IS NULL OR cardinality(assigned_to) = 0)
  AND deleted_at IS NULL;

-- ── prospect_lists ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "lists_select" ON prospect_lists;
DROP POLICY IF EXISTS "lists_insert" ON prospect_lists;
DROP POLICY IF EXISTS "lists_update" ON prospect_lists;

CREATE POLICY "lists_select" ON prospect_lists FOR SELECT
  USING (
    organisation_id = private.get_my_org()
    AND (
      private.get_my_role() IN ('super_admin', 'admin', 'manager')
      OR auth.uid()::text = ANY (assigned_to)
      OR created_by = auth.uid()
    )
  );

CREATE POLICY "lists_insert" ON prospect_lists FOR INSERT
  WITH CHECK (
    organisation_id = private.get_my_org()
    AND private.get_my_role() IN ('super_admin', 'admin', 'manager')
  );

CREATE POLICY "lists_update" ON prospect_lists FOR UPDATE
  USING (
    organisation_id = private.get_my_org()
    AND (
      private.get_my_role() IN ('super_admin', 'admin', 'manager')
      OR created_by = auth.uid()
    )
  );

-- ── prospects ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "prospects_select" ON prospects;
DROP POLICY IF EXISTS "prospects_insert" ON prospects;
DROP POLICY IF EXISTS "prospects_update" ON prospects;

CREATE POLICY "prospects_select" ON prospects FOR SELECT
  USING (
    organisation_id = private.get_my_org()
    AND (
      private.get_my_role() IN ('super_admin', 'admin', 'manager')
      OR list_id IN (
        SELECT id FROM prospect_lists
        WHERE organisation_id = private.get_my_org()
          AND auth.uid()::text = ANY (assigned_to)
      )
    )
  );

CREATE POLICY "prospects_insert" ON prospects FOR INSERT
  WITH CHECK (
    organisation_id = private.get_my_org()
    AND (
      private.get_my_role() IN ('super_admin', 'admin', 'manager')
      OR list_id IN (
        SELECT id FROM prospect_lists
        WHERE organisation_id = private.get_my_org()
          AND auth.uid()::text = ANY (assigned_to)
      )
    )
  );

CREATE POLICY "prospects_update" ON prospects FOR UPDATE
  USING (
    organisation_id = private.get_my_org()
    AND (
      private.get_my_role() IN ('super_admin', 'admin', 'manager')
      OR list_id IN (
        SELECT id FROM prospect_lists
        WHERE organisation_id = private.get_my_org()
          AND auth.uid()::text = ANY (assigned_to)
      )
    )
  );

-- ── phone_inventory ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "phone_inventory_org_read" ON phone_inventory;

CREATE POLICY "phone_inventory_org_read" ON phone_inventory FOR SELECT
  USING (
    organisation_id = private.get_my_org()
    AND deleted_at IS NULL
    AND (
      private.get_my_role() IN ('super_admin', 'admin', 'manager')
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND phone_number = ANY (assigned_phones)
      )
    )
  );
