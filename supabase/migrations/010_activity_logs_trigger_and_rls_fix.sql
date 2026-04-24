-- ════════════════════════════════════════════════════════════════
-- Fix activity_logs : INSERT 403 Forbidden depuis le front
--
-- Avant : la table exige `organisation_id NOT NULL` et la policy
-- INSERT check `organisation_id = profile.organisation_id`. Le front
-- envoie juste { prospect_id, action, details } sans `organisation_id`
-- → 403 Forbidden (la policy rejette car NULL != <org>). En plus,
-- pour un super_admin (profile.organisation_id = NULL depuis le
-- soft-delete protocol du 15 avril), la policy échoue toujours.
--
-- Après :
-- - Trigger BEFORE INSERT qui auto-populate organisation_id (depuis
--   le prospect associé) et user_id (depuis auth.uid()).
-- - Policy INSERT qui permet à tout user qui peut SELECT le prospect
--   (déjà scopé par org via RLS sur prospects) + super_admin bypass.
-- - Policy SELECT avec super_admin bypass.
-- ════════════════════════════════════════════════════════════════

-- ── Trigger BEFORE INSERT : auto-populate organisation_id + user_id ──

CREATE OR REPLACE FUNCTION public.set_activity_logs_defaults()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.organisation_id IS NULL THEN
    SELECT organisation_id INTO NEW.organisation_id
    FROM prospects WHERE id = NEW.prospect_id;
  END IF;

  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activity_logs_set_defaults ON activity_logs;

CREATE TRIGGER activity_logs_set_defaults
  BEFORE INSERT ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_activity_logs_defaults();

-- ── Policies RLS avec super_admin bypass ──

DROP POLICY IF EXISTS insert_org_logs ON activity_logs;
DROP POLICY IF EXISTS activity_logs_insert ON activity_logs;

CREATE POLICY activity_logs_insert ON activity_logs FOR INSERT
  WITH CHECK (
    -- Le user peut INSERT un log pour un prospect qu'il peut SELECT
    -- (le RLS sur prospects propage déjà le scoping par org).
    EXISTS (SELECT 1 FROM prospects WHERE id = prospect_id)
    -- Ou super_admin : accès global.
    OR private.get_my_role() = 'super_admin'
  );

DROP POLICY IF EXISTS view_org_logs ON activity_logs;
DROP POLICY IF EXISTS activity_logs_select ON activity_logs;

CREATE POLICY activity_logs_select ON activity_logs FOR SELECT
  USING (
    organisation_id = private.get_my_org()
    OR private.get_my_role() = 'super_admin'
  );
