-- 040_announcements.sql
--
-- Annonces internes : fil unidirectionnel admin → équipe.
-- Centralise les mises à jour Calsyn, infos importantes, rappels.
--
-- Pas de réponses, pas de réactions (V1). Juste un fil chronologique
-- visible par tous les membres de l'org. Édition/suppression réservée
-- à l'auteur OU aux admins/managers.
--
-- Realtime via Supabase Postgres CDC (publication ajoutée en fin).

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  body text NOT NULL,                     -- contenu (markdown léger possible côté front)
  pinned boolean NOT NULL DEFAULT false,  -- épingle en haut du fil
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,                   -- snapshot
  created_by_email text,                  -- snapshot
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_org_created
  ON public.announcements(organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned
  ON public.announcements(organisation_id, pinned, created_at DESC) WHERE pinned = true;

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- SELECT : tout membre de l'org
DROP POLICY IF EXISTS announcements_select ON public.announcements;
CREATE POLICY announcements_select ON public.announcements
  FOR SELECT
  USING (organisation_id = private.get_my_org());

-- INSERT : super_admin/admin/manager uniquement
DROP POLICY IF EXISTS announcements_insert ON public.announcements;
CREATE POLICY announcements_insert ON public.announcements
  FOR INSERT
  WITH CHECK (
    organisation_id = private.get_my_org()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin', 'manager')
    )
  );

-- UPDATE : auteur OU admin/manager
DROP POLICY IF EXISTS announcements_update ON public.announcements;
CREATE POLICY announcements_update ON public.announcements
  FOR UPDATE
  USING (
    organisation_id = private.get_my_org()
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('super_admin', 'admin', 'manager')
      )
    )
  );

-- DELETE : auteur OU admin/manager
DROP POLICY IF EXISTS announcements_delete ON public.announcements;
CREATE POLICY announcements_delete ON public.announcements
  FOR DELETE
  USING (
    organisation_id = private.get_my_org()
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('super_admin', 'admin', 'manager')
      )
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.announcements_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS announcements_updated_at ON public.announcements;
CREATE TRIGGER announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.announcements_set_updated_at();

-- Tracker last_seen pour badge "X nouvelles annonces"
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_announcements_at timestamptz DEFAULT now();

COMMENT ON COLUMN public.profiles.last_seen_announcements_at IS
  'Timestamp dernière visite onglet Annonces. Permet le badge "nouveaux".';

CREATE OR REPLACE FUNCTION public.touch_announcements_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.profiles
  SET last_seen_announcements_at = now()
  WHERE id = auth.uid();
END $$;

REVOKE ALL ON FUNCTION public.touch_announcements_seen FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_announcements_seen TO authenticated;

-- Realtime publication (pour que le front reçoive les nouvelles annonces sans refresh)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
  END IF;
END $$;

COMMENT ON TABLE public.announcements IS
  'Fil d''annonces interne admin → équipe. Realtime activé. Pas de threading/réactions en V1.';
