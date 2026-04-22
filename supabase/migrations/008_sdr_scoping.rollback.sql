-- ROLLBACK 008_sdr_scoping.sql — restore org-wide RLS on prospect_lists,
-- prospects and phone_inventory. NE PAS appliquer sauf si la migration 008
-- casse quelque chose.

-- ── prospect_lists ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "lists_select" ON prospect_lists;
DROP POLICY IF EXISTS "lists_insert" ON prospect_lists;
DROP POLICY IF EXISTS "lists_update" ON prospect_lists;

CREATE POLICY "lists_select" ON prospect_lists FOR SELECT
  USING (organisation_id = private.get_my_org());
CREATE POLICY "lists_insert" ON prospect_lists FOR INSERT
  WITH CHECK (organisation_id = private.get_my_org());
CREATE POLICY "lists_update" ON prospect_lists FOR UPDATE
  USING (organisation_id = private.get_my_org());

-- ── prospects ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "prospects_select" ON prospects;
DROP POLICY IF EXISTS "prospects_insert" ON prospects;
DROP POLICY IF EXISTS "prospects_update" ON prospects;

CREATE POLICY "prospects_select" ON prospects FOR SELECT
  USING (organisation_id = private.get_my_org());
CREATE POLICY "prospects_insert" ON prospects FOR INSERT
  WITH CHECK (organisation_id = private.get_my_org());
CREATE POLICY "prospects_update" ON prospects FOR UPDATE
  USING (organisation_id = private.get_my_org());

-- ── phone_inventory ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "phone_inventory_org_read" ON phone_inventory;

CREATE POLICY "phone_inventory_org_read" ON phone_inventory FOR SELECT
  USING (organisation_id = private.get_my_org() AND deleted_at IS NULL);
