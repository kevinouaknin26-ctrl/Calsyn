-- Migration 005 — purge des OAuth tokens en clair (C7 immédiat)
--
-- Contexte : audit sécu C7. Les colonnes user_integrations.access_token
-- et refresh_token stockent les tokens Google Calendar en clair (text).
-- Si la DB leak (SQL injection, backup exposé, etc.), ces tokens permettent
-- à un attaquant d'accéder au Google Calendar/Gmail de l'user.
--
-- Action immédiate : vider tous les tokens existants (le seul actif
-- était un token Google Calendar de Kevin, déjà expiré le 17/04 17:09).
-- Kevin peut re-link Google quand il en aura besoin.
--
-- ⚠️ REMEDIATION FUTURE (C7 complet) — à planifier :
--   1. Activer Supabase Vault / pgsodium pour le chiffrement column-level
--   2. Migrer access_token et refresh_token vers des types chiffrés
--   3. Wrapper insert/select côté edge functions (google-auth) avec
--      encrypt()/decrypt() via Vault
--   4. Rotate les clés de chiffrement régulièrement

-- Révocation côté app : le user doit aussi aller sur
-- https://myaccount.google.com/permissions pour révoquer Calsyn
-- → garantit que le refresh_token ne marche plus même si leak.

DELETE FROM user_integrations WHERE provider = 'google_calendar';

-- ──────────────────────────────────────────────────────────────────
-- ROLLBACK : impossible — les tokens sont irrécupérables une fois supprimés.
-- Seule voie : Kevin re-link Google Calendar via l'UI Calsyn.
-- C'est le comportement voulu (forcer un refresh avec tokens à chiffrer plus tard).
