-- ════════════════════════════════════════════════════════════════
-- Table sms_messages : stockage des SMS envoyés/reçus via Twilio.
--
-- Direction :
--  - 'outbound' : envoyé depuis Calsyn (sms-send)
--  - 'inbound'  : reçu via webhook Twilio (sms-webhook)
--
-- RLS : un user voit les SMS de son organisation uniquement.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  twilio_sid TEXT UNIQUE,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_prospect ON sms_messages(prospect_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_org ON sms_messages(organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_phones ON sms_messages(from_number, to_number);

ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

-- Lecture : org match OR super_admin
DROP POLICY IF EXISTS sms_messages_select ON sms_messages;
CREATE POLICY sms_messages_select ON sms_messages FOR SELECT
  USING (
    organisation_id = private.get_my_org()
    OR private.get_my_role() = 'super_admin'
  );

-- Insert : auto-trigger remplit organisation_id depuis le prospect, user_id depuis auth.uid()
CREATE OR REPLACE FUNCTION public.set_sms_messages_defaults()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.organisation_id IS NULL AND NEW.prospect_id IS NOT NULL THEN
    SELECT organisation_id INTO NEW.organisation_id
    FROM prospects WHERE id = NEW.prospect_id;
  END IF;
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sms_messages_set_defaults ON sms_messages;
CREATE TRIGGER sms_messages_set_defaults
  BEFORE INSERT ON sms_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_sms_messages_defaults();

DROP POLICY IF EXISTS sms_messages_insert ON sms_messages;
CREATE POLICY sms_messages_insert ON sms_messages FOR INSERT
  WITH CHECK (
    -- Le user peut INSERT pour un prospect visible
    (prospect_id IS NOT NULL AND EXISTS (SELECT 1 FROM prospects WHERE id = prospect_id))
    -- Ou pour son org sans prospect_id
    OR (prospect_id IS NULL AND organisation_id = private.get_my_org())
    -- Ou super_admin
    OR private.get_my_role() = 'super_admin'
  );
