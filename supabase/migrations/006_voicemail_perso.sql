-- Migration 006 — Messagerie vocale perso par SDR
-- Contexte : remplacer la voix Twilio Say robotique par un vrai message
-- enregistré par chaque SDR (audio) ou fallback texte custom.
--
-- Flow inbound :
--   1. call-webhook cherche profiles.voicemail_url du SDR routé
--   2. Si présent → <Play> signed URL (durée 5 min suffit pour l'appel)
--   3. Sinon si voicemail_text présent → <Say voice="Polly.Lea-Neural"> custom
--   4. Sinon → <Say voice="Polly.Lea-Neural"> message générique

-- 1. Colonnes sur profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS voicemail_url  text,
  ADD COLUMN IF NOT EXISTS voicemail_text text;

-- 2. Bucket Storage privé pour les messages de messagerie
INSERT INTO storage.buckets (id, name, public)
VALUES ('voicemails', 'voicemails', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 3. RLS policies — un SDR peut gérer UNIQUEMENT ses propres fichiers
--    Convention path : voicemails/{user_id}/greeting.{ext}

-- SELECT : un user voit ses fichiers, service_role voit tout (bypass RLS)
DROP POLICY IF EXISTS voicemails_owner_select ON storage.objects;
CREATE POLICY voicemails_owner_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'voicemails'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- INSERT : un user ne peut uploader que dans son propre dossier
DROP POLICY IF EXISTS voicemails_owner_insert ON storage.objects;
CREATE POLICY voicemails_owner_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'voicemails'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- UPDATE : même règle (remplacer son propre fichier)
DROP POLICY IF EXISTS voicemails_owner_update ON storage.objects;
CREATE POLICY voicemails_owner_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'voicemails'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- DELETE : un user supprime uniquement ses fichiers
DROP POLICY IF EXISTS voicemails_owner_delete ON storage.objects;
CREATE POLICY voicemails_owner_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'voicemails'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ROLLBACK (à exécuter manuellement si besoin) :
--   DROP POLICY IF EXISTS voicemails_owner_delete ON storage.objects;
--   DROP POLICY IF EXISTS voicemails_owner_update ON storage.objects;
--   DROP POLICY IF EXISTS voicemails_owner_insert ON storage.objects;
--   DROP POLICY IF EXISTS voicemails_owner_select ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'voicemails';
--   ALTER TABLE profiles DROP COLUMN IF EXISTS voicemail_text;
--   ALTER TABLE profiles DROP COLUMN IF EXISTS voicemail_url;
