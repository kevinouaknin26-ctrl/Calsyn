-- ════════════════════════════════════════════════════════════════
-- Phase 2 — Sync bidirectionnelle
-- Step 3/4 : tracker l'état Gmail Watch (Pub/Sub) par user
-- ════════════════════════════════════════════════════════════════
ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS gmail_history_id BIGINT,
  ADD COLUMN IF NOT EXISTS gmail_watch_expires_at TIMESTAMPTZ;
