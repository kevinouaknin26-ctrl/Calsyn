-- ════════════════════════════════════════════════════════════════
-- Règle : un prospect doit avoir au moins un email OU un téléphone
-- (au moins l'un des deux pour pouvoir le contacter).
-- ════════════════════════════════════════════════════════════════
ALTER TABLE prospects
  ADD CONSTRAINT prospects_phone_or_email_check
  CHECK (
    (phone IS NOT NULL AND length(trim(phone)) > 0)
    OR
    (email IS NOT NULL AND length(trim(email)) > 0)
  );
