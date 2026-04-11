-- Nouveaux champs prospects pour match Minari
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS phone2 text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS phone3 text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS phone4 text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS phone5 text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS website_url text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS crm_status text NOT NULL DEFAULT 'new';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS do_not_call boolean NOT NULL DEFAULT false;

-- Index sur crm_status pour filtres rapides
CREATE INDEX IF NOT EXISTS idx_prospects_crm_status ON prospects (crm_status);
