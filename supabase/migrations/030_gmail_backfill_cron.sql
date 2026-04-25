-- ════════════════════════════════════════════════════════════════
-- Cron : reprend gmail-backfill toutes les 6 min tant que des users
-- n'ont pas terminé (gmail_backfill_done_at IS NULL).
-- L'edge function s'auto-skip si done. Time budget interne 4 min.
-- ════════════════════════════════════════════════════════════════
SELECT cron.schedule('gmail-backfill', '*/6 * * * *', $$
  SELECT net.http_post(
    url := 'https://enrpuayypjnpfmdgpfhs.supabase.co/functions/v1/gmail-backfill',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 290000
  );
$$);
