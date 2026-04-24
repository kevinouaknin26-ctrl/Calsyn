-- Rollback de 010_activity_logs_trigger_and_rls_fix.sql
-- Restore l'état d'avant : policies initiales insert_org_logs + view_org_logs,
-- pas de trigger. L'INSERT sera de nouveau 403 Forbidden depuis le front.

DROP TRIGGER IF EXISTS activity_logs_set_defaults ON activity_logs;
DROP FUNCTION IF EXISTS public.set_activity_logs_defaults();

DROP POLICY IF EXISTS activity_logs_insert ON activity_logs;
DROP POLICY IF EXISTS activity_logs_select ON activity_logs;

CREATE POLICY insert_org_logs ON activity_logs FOR INSERT
  WITH CHECK (organisation_id = (
    SELECT profiles.organisation_id FROM profiles
    WHERE profiles.id = auth.uid() LIMIT 1
  ));

CREATE POLICY view_org_logs ON activity_logs FOR SELECT
  USING (organisation_id = (
    SELECT profiles.organisation_id FROM profiles
    WHERE profiles.id = auth.uid() LIMIT 1
  ));
