-- ════════════════════════════════════════════════════════════════
-- Phase 2 — Sync bidirectionnelle
-- Step 1/4 : is_read par message pour sync avec labels Gmail UNREAD
-- ════════════════════════════════════════════════════════════════
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_messages_unread_per_prospect ON messages(prospect_id)
  WHERE direction='in' AND is_read=false;
