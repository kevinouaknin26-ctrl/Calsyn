-- Migration 004 — bucket `recordings` privé + drop policy public
-- Contexte : audit sécu C6 — bucket actuellement public, n'importe qui
-- avec un path devinable peut télécharger les voicemails.
--
-- Impact :
-- - Bucket passe en privé (public = false)
-- - Policy `public_read_recordings` supprimée
-- - Le code client doit utiliser `createSignedUrl` au lieu de `getPublicUrl`
--
-- Pré-requis : table storage.objects bucket='recordings' a 0 fichier
-- (vérifié avant application). Rollback possible via SQL inverse ci-dessous.

-- 1. Bucket privé
UPDATE storage.buckets SET public = false WHERE id = 'recordings';

-- 2. Retrait de la policy publique SELECT
DROP POLICY IF EXISTS public_read_recordings ON storage.objects;

-- ──────────────────────────────────────────────────────────────────
-- ROLLBACK (à exécuter manuellement si besoin de revenir en arrière) :
--
--   UPDATE storage.buckets SET public = true WHERE id = 'recordings';
--   CREATE POLICY public_read_recordings ON storage.objects
--     FOR SELECT USING (bucket_id = 'recordings');
--
-- Mais attention : ça réouvre la faille. À n'utiliser qu'en cas de bug
-- grave sur les voicemails.
