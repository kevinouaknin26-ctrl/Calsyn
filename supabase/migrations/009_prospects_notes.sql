-- 009_prospects_notes.sql
-- Note principale permanente sur chaque prospect (éditable hors appel).
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS notes text;
