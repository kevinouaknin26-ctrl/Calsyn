-- ════════════════════════════════════════════════════════════════
-- Isolation par user dans la messagerie : chacun voit UNIQUEMENT
-- ses propres messages (chacun son mail/num).
--
-- Backfill : pour les SMS inbound existants sans user_id,
-- résout via assigned_phone(s) du profile destinataire.
-- ════════════════════════════════════════════════════════════════
UPDATE messages m
SET user_id = p.id
FROM profiles p
WHERE m.user_id IS NULL
  AND m.channel = 'sms'
  AND m.direction = 'in'
  AND m.to_address IS NOT NULL
  AND (p.assigned_phone = m.to_address OR m.to_address = ANY(coalesce(p.assigned_phones, ARRAY[]::text[])));
