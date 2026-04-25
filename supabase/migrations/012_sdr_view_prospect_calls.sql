-- ════════════════════════════════════════════════════════════════
-- Permettre au SDR de voir TOUS les appels d'un prospect qu'il a en
-- visibilité (peu importe le sdr_id qui a passé l'appel).
--
-- Avant : calls_select_own (sdr_id = auth.uid()) + calls_select_org
-- (admin/manager/super_admin). Un SDR ne voyait pas les appels passés
-- par d'autres SDR ou super_admin sur "ses" prospects → impossible de
-- savoir si le prospect a déjà été contacté.
--
-- Après : nouvelle policy calls_select_prospect_visible qui laisse
-- passer tout call lié à un prospect que l'user peut SELECT (RLS sur
-- prospects propage déjà le scoping par liste assignée).
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "calls_select_prospect_visible" ON calls;

CREATE POLICY "calls_select_prospect_visible" ON calls FOR SELECT
  USING (
    prospect_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM prospects WHERE id = calls.prospect_id)
  );

-- Permettre aussi UPDATE (changer le résultat, cocher RDV, ajouter une
-- note) sur les appels des prospects visibles, pas juste ses propres.
DROP POLICY IF EXISTS "calls_update_prospect_visible" ON calls;

CREATE POLICY "calls_update_prospect_visible" ON calls FOR UPDATE
  USING (
    prospect_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM prospects WHERE id = calls.prospect_id)
  );
