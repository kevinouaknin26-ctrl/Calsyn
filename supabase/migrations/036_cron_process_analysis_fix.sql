-- ════════════════════════════════════════════════════════════════
-- Fix cron process-analysis : envoie l'apikey header.
--
-- Bug initial : le cron appelait process-analysis SANS auth header.
-- L'edge function (verify_jwt: false) laissait passer mais le code
-- interne exigeait Authorization Bearer service_role → 401 systématique.
-- Tous les retry des jobs analysis échouaient donc silencieusement.
--
-- Fix : ajouter `apikey` header avec le service_role / secret_key
-- stocké dans vault.secrets (name='service_role_key').
--
-- Note : depuis la bascule de Supabase vers les "Modern Secret API Keys"
-- (sb_secret_*), le gateway rejette tout Authorization Bearer non-JWT
-- en "Invalid JWT". On utilise donc UNIQUEMENT le header `apikey`,
-- côté process-analysis on accepte aussi cet header (cf. version 28).
--
-- PRÉREQUIS : avoir créé le secret avant via :
--   SELECT vault.create_secret('<sb_secret_xxx>', 'service_role_key', '...');
-- ════════════════════════════════════════════════════════════════

SELECT cron.unschedule('process-analysis');

SELECT cron.schedule(
  'process-analysis',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://enrpuayypjnpfmdgpfhs.supabase.co/functions/v1/process-analysis',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
