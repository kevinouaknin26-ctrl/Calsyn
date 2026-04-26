-- ════════════════════════════════════════════════════════════════
-- Garantit que le créateur d'une liste est toujours dans assigned_to
-- (l'admin garde le contrôle même quand un commercial est assigné).
--
-- Backfill : ajoute created_by aux listes où il n'y est pas déjà.
-- ════════════════════════════════════════════════════════════════
UPDATE prospect_lists
SET assigned_to = ARRAY[created_by::text] || coalesce(assigned_to, ARRAY[]::text[])
WHERE deleted_at IS NULL
  AND created_by IS NOT NULL
  AND NOT (created_by::text = ANY(coalesce(assigned_to, ARRAY[]::text[])));
