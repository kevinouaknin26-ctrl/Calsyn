-- ════════════════════════════════════════════════════════════════
-- Phase 1 — Messagerie unifiée
-- Step 1/N : table messages générique pour TOUS les canaux
-- (sms, email, whatsapp, linkedin, instagram, telegram, messenger…)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  channel TEXT NOT NULL CHECK (channel IN ('sms','email','whatsapp','linkedin','instagram','telegram','messenger')),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),

  external_id TEXT,
  external_thread_id TEXT,

  from_address TEXT,
  to_address TEXT,

  subject TEXT,
  body TEXT,
  body_html TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,

  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT DEFAULT 'sent',

  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT messages_external_id_unique UNIQUE (channel, external_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_prospect_sent ON messages(prospect_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_org_sent ON messages(organisation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(channel, external_thread_id) WHERE external_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(prospect_id, direction, sent_at) WHERE direction = 'in';

-- ────────────────────────────────────────────────────────────────
-- message_reads : 1 row par (user, prospect_conversation), tracke
-- la dernière fois que l'user a vu le thread → calcul unread_count.
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reads (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, prospect_id)
);
CREATE INDEX IF NOT EXISTS idx_message_reads_org ON message_reads(organisation_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_read" ON messages;
CREATE POLICY "messages_read" ON messages FOR SELECT USING (
  organisation_id IN (SELECT organisation_id FROM profiles WHERE id = auth.uid())
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin')
);

DROP POLICY IF EXISTS "messages_write" ON messages;
CREATE POLICY "messages_write" ON messages FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND (role = 'super_admin' OR organisation_id = messages.organisation_id))
) WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
    AND (role = 'super_admin' OR organisation_id = messages.organisation_id))
);

DROP POLICY IF EXISTS "message_reads_self" ON message_reads;
CREATE POLICY "message_reads_self" ON message_reads FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Trigger : auto-fill organisation_id depuis prospect si manquant
CREATE OR REPLACE FUNCTION fill_message_org() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organisation_id IS NULL AND NEW.prospect_id IS NOT NULL THEN
    SELECT organisation_id INTO NEW.organisation_id FROM prospects WHERE id = NEW.prospect_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fill_message_org ON messages;
CREATE TRIGGER trg_fill_message_org BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION fill_message_org();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
