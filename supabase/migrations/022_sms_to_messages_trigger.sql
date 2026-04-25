-- ════════════════════════════════════════════════════════════════
-- Phase 1 — Messagerie unifiée
-- Step 5/N : trigger dual-write sms_messages → messages
-- Tout INSERT dans sms_messages (legacy) crée automatiquement la row
-- correspondante dans messages (channel='sms'). Évite de modifier les
-- edge functions sms-send / sms-webhook.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sms_to_messages_sync() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO messages (
    organisation_id, prospect_id, user_id, channel, direction,
    external_id, from_address, to_address, body,
    sent_at, status, created_at
  ) VALUES (
    NEW.organisation_id, NEW.prospect_id, NEW.user_id, 'sms',
    CASE NEW.direction
      WHEN 'inbound' THEN 'in'
      WHEN 'outbound' THEN 'out'
      WHEN 'in' THEN 'in'
      WHEN 'out' THEN 'out'
      ELSE 'out'
    END,
    NEW.twilio_sid, NEW.from_number, NEW.to_number, NEW.body,
    NEW.created_at, NEW.status, NEW.created_at
  )
  ON CONFLICT (channel, external_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sms_to_messages ON sms_messages;
CREATE TRIGGER trg_sms_to_messages
  AFTER INSERT ON sms_messages
  FOR EACH ROW EXECUTE FUNCTION sms_to_messages_sync();
