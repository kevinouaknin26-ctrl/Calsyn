-- Ajoute email2/email3 sur prospects (déjà appliqué en prod via MCP)
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS email2 TEXT,
  ADD COLUMN IF NOT EXISTS email3 TEXT;
