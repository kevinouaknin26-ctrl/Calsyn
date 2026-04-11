# R16 — Queue Pattern Async (analyse IA)

## Probleme
L'analyse IA (transcription + Claude) prend 30s-5min.
Edge Functions timeout a 60s.
On ne peut pas faire ca de maniere synchrone.

## Solution : pgmq + pg_cron + Edge Function worker

### Architecture
```
recording-callback (webhook Twilio)
  → INSERT INTO analysis_jobs (call_id, status: 'pending')
  → Return 200 immediatement

pg_cron (toutes les 10s)
  → SELECT FROM pgmq.read('analysis_queue', ...)
  → Si message : appeler Edge Function "process-analysis" via pg_net
  → Edge Function traite 1 job : transcription + analyse + UPDATE calls
  → Si succes : pgmq.delete(message)
  → Si echec : message redevient visible apres visibility_timeout (retry auto)
```

### Setup pgmq
```sql
-- Activer l'extension
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Creer la queue
SELECT pgmq.create('analysis_queue');
```

### Trigger pour enqueue automatiquement
```sql
CREATE OR REPLACE FUNCTION enqueue_analysis()
RETURNS trigger AS $$
BEGIN
  IF NEW.recording_url IS NOT NULL AND NEW.ai_analysis_status = 'pending' THEN
    PERFORM pgmq.send('analysis_queue', jsonb_build_object(
      'call_id', NEW.id,
      'recording_url', NEW.recording_url
    ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_recording_url_set
  AFTER UPDATE OF recording_url ON calls
  FOR EACH ROW
  WHEN (OLD.recording_url IS NULL AND NEW.recording_url IS NOT NULL)
  EXECUTE FUNCTION enqueue_analysis();
```

### Worker Edge Function (process-analysis)
- Recoit 1 message de la queue
- Appelle AssemblyAI (submit + poll en boucle — OK car c'est une invocation dediee)
- Appelle Claude API
- UPDATE calls avec les resultats
- Stocke raw_output dans analysis_jobs
- Si erreur : laisse le message dans la queue (retry auto)

### pg_cron pour declencher le worker
```sql
-- Activer pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Poll toutes les 10 secondes
SELECT cron.schedule(
  'process-analysis-queue',
  '10 seconds',
  $$SELECT net.http_post(
    url := 'https://enrpuayypjnpfmdgpfhs.supabase.co/functions/v1/process-analysis',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
  )$$
);
```

### Alternative simple (sans pgmq)
Si pgmq n'est pas dispo sur le plan free :
```sql
-- Table analysis_jobs comme queue manuelle
-- pg_cron poll les jobs pending
-- Edge Function prend le plus ancien pending, le marque processing, traite, marque completed
-- Si crash : un autre cron remet les "processing" depuis > 5min en "pending" (retry)
```

## Decision
- Utiliser pgmq si disponible, sinon table analysis_jobs comme queue manuelle
- pg_cron toutes les 10s pour poll
- Edge Function worker traite 1 job par invocation
- Retry automatique via visibility_timeout ou cron de nettoyage
- raw_output stocke dans analysis_jobs pour re-traitement
