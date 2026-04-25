-- ════════════════════════════════════════════════════════════════
-- Fix calls INSERT RLS : meme probleme que activity_logs (migration 010).
--
-- Avant : la policy check `sdr_id = auth.uid() AND organisation_id =
-- private.get_my_org()`. Le front ne fournit souvent ni l'un ni
-- l'autre (note manuelle, incoming call, etc.) → violation RLS. Pour
-- super_admin (profile.organisation_id = NULL), toujours reject.
--
-- Apres :
-- - Trigger BEFORE INSERT auto-populate sdr_id (auth.uid()) et
--   organisation_id (prospect.organisation_id si prospect_id, sinon
--   profile.organisation_id).
-- - Policy INSERT : user peut INSERT si prospect visible (RLS propage)
--   OU si super_admin.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_calls_defaults()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.sdr_id IS NULL THEN
    NEW.sdr_id := auth.uid();
  END IF;

  IF NEW.organisation_id IS NULL THEN
    IF NEW.prospect_id IS NOT NULL THEN
      SELECT organisation_id INTO NEW.organisation_id
      FROM prospects WHERE id = NEW.prospect_id;
    END IF;
    IF NEW.organisation_id IS NULL THEN
      SELECT organisation_id INTO NEW.organisation_id
      FROM profiles WHERE id = auth.uid();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calls_set_defaults ON calls;

CREATE TRIGGER calls_set_defaults
  BEFORE INSERT ON calls
  FOR EACH ROW EXECUTE FUNCTION public.set_calls_defaults();

-- Policy INSERT avec super_admin bypass
DROP POLICY IF EXISTS calls_insert ON calls;

CREATE POLICY calls_insert ON calls FOR INSERT
  WITH CHECK (
    -- Cas normal : l'user peut voir le prospect (RLS scope deja par org)
    (prospect_id IS NOT NULL AND EXISTS (SELECT 1 FROM prospects WHERE id = prospect_id))
    -- Ou INSERT sans prospect_id (rare, ex: note sans ref) : check sdr
    OR (prospect_id IS NULL AND sdr_id = auth.uid())
    -- Ou super_admin : bypass total
    OR private.get_my_role() = 'super_admin'
  );
