-- Rollback 011 : restore policy calls_insert initiale + drop trigger.

DROP TRIGGER IF EXISTS calls_set_defaults ON calls;
DROP FUNCTION IF EXISTS public.set_calls_defaults();

DROP POLICY IF EXISTS calls_insert ON calls;

CREATE POLICY calls_insert ON calls FOR INSERT
  WITH CHECK (sdr_id = auth.uid() AND organisation_id = private.get_my_org());
