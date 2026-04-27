-- 043_announcements_title.sql
--
-- Ajoute un champ titre optionnel sur les annonces pour les distinguer
-- visuellement dans le fil (avant : juste un body brut).

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS title text;

COMMENT ON COLUMN public.announcements.title IS
  'Titre court de l''annonce (optionnel). Si présent, affiché en gras au-dessus du body.';
