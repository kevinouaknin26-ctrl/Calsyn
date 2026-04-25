-- ════════════════════════════════════════════════════════════════
-- Phase 2 — Sync bidirectionnelle
-- Step 4/4 : cron quotidien gmail-watch-renew (Gmail watch expire 7j max)
-- ════════════════════════════════════════════════════════════════
SELECT cron.schedule('gmail-watch-renew', '0 4 * * *', $$
  SELECT net.http_post(
    url := 'https://enrpuayypjnpfmdgpfhs.supabase.co/functions/v1/gmail-watch-renew',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
