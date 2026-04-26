-- ════════════════════════════════════════════════════════════════
-- RLS prospects : un SDR voit/édite aussi les prospects accessibles
-- via prospect_list_memberships (et plus seulement via list_id legacy).
--
-- BUG initial : la policy se basait sur prospects.list_id (1 seul liste
-- par prospect) alors que la source de vérité est prospect_list_memberships
-- (un prospect peut être sur N listes). Conséquence : un SDR à qui une
-- liste est assignée ne voyait pas les prospects dont le list_id legacy
-- pointait vers une AUTRE liste, même s'ils étaient bien dans sa liste
-- via membership.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS prospects_select ON prospects;
CREATE POLICY prospects_select ON prospects
  FOR SELECT
  USING (
    organisation_id = private.get_my_org() AND (
      private.get_my_role() = ANY(ARRAY['super_admin', 'admin', 'manager'])
      OR list_id IN (
        SELECT id FROM prospect_lists
        WHERE organisation_id = private.get_my_org()
          AND (auth.uid())::text = ANY(assigned_to)
      )
      OR EXISTS (
        SELECT 1
        FROM prospect_list_memberships m
        JOIN prospect_lists l ON l.id = m.list_id
        WHERE m.prospect_id = prospects.id
          AND l.organisation_id = private.get_my_org()
          AND (auth.uid())::text = ANY(l.assigned_to)
      )
    )
  );

DROP POLICY IF EXISTS prospects_update ON prospects;
CREATE POLICY prospects_update ON prospects
  FOR UPDATE
  USING (
    organisation_id = private.get_my_org() AND (
      private.get_my_role() = ANY(ARRAY['super_admin', 'admin', 'manager'])
      OR list_id IN (
        SELECT id FROM prospect_lists
        WHERE organisation_id = private.get_my_org()
          AND (auth.uid())::text = ANY(assigned_to)
      )
      OR EXISTS (
        SELECT 1
        FROM prospect_list_memberships m
        JOIN prospect_lists l ON l.id = m.list_id
        WHERE m.prospect_id = prospects.id
          AND l.organisation_id = private.get_my_org()
          AND (auth.uid())::text = ANY(l.assigned_to)
      )
    )
  );
