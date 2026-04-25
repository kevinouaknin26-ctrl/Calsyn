-- ════════════════════════════════════════════════════════════════
-- État du backfill complet Gmail (toute la boîte mail, par pages).
-- gmail_backfill_token : pageToken Gmail pour reprendre la pagination
--                       au prochain appel (ou NULL = pas de backfill en
--                       cours, ou done si gmail_backfill_done_at non null).
-- ════════════════════════════════════════════════════════════════
ALTER TABLE user_integrations
  ADD COLUMN IF NOT EXISTS gmail_backfill_token TEXT,
  ADD COLUMN IF NOT EXISTS gmail_backfill_done_at TIMESTAMPTZ;
