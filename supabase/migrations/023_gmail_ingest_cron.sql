-- ════════════════════════════════════════════════════════════════
-- Phase 1 — Messagerie unifiée
-- Step 6/N : cron gmail-ingest toutes les 5 minutes
-- L'edge function pull les emails Gmail récents (newer_than:5d) et les
-- insère dans messages (channel='email') si match avec un prospect.
-- ════════════════════════════════════════════════════════════════

SELECT cron.schedule(
  'gmail-ingest',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://enrpuayypjnpfmdgpfhs.supabase.co/functions/v1/gmail-ingest',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $$
);
-- Note : la function gmail-ingest accepte les appels sans token (mode cron).
-- Pas de risque : elle ne fait que sync les Gmail des users déjà connectés.
