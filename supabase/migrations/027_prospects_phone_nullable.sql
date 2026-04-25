-- ════════════════════════════════════════════════════════════════
-- Auto-création de prospects depuis emails inconnus → phone optionnel
-- (un contact qui a juste un email n'a pas forcément de téléphone)
-- ════════════════════════════════════════════════════════════════
ALTER TABLE prospects ALTER COLUMN phone DROP NOT NULL;
