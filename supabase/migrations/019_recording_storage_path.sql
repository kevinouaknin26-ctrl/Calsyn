-- Cache des recordings dans Supabase Storage pour seek bar + démarrage rapide
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_storage_path TEXT;
CREATE INDEX IF NOT EXISTS idx_calls_recording_storage_path ON calls(recording_storage_path) WHERE recording_storage_path IS NOT NULL;
