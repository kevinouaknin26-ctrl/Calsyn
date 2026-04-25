-- ════════════════════════════════════════════════════════════════
-- Phase 1 — Messagerie unifiée
-- Step 2/N : backfill sms_messages legacy → messages (channel='sms')
-- Idempotente : ON CONFLICT DO NOTHING sur (channel, external_id)
-- ════════════════════════════════════════════════════════════════

INSERT INTO messages (
  organisation_id, prospect_id, user_id, channel, direction,
  external_id, from_address, to_address, body,
  sent_at, status, created_at
)
SELECT
  organisation_id, prospect_id, user_id, 'sms' AS channel,
  CASE direction
    WHEN 'inbound' THEN 'in'
    WHEN 'outbound' THEN 'out'
    WHEN 'in' THEN 'in'
    WHEN 'out' THEN 'out'
    ELSE 'out'
  END AS direction,
  twilio_sid AS external_id,
  from_number AS from_address,
  to_number AS to_address,
  body,
  created_at AS sent_at,
  status,
  created_at
FROM sms_messages
WHERE twilio_sid IS NOT NULL
ON CONFLICT (channel, external_id) DO NOTHING;
