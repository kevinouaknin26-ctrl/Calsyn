-- 039_shared_resources.sql
--
-- Espace partagé interne : docs (brochures, playbooks, supports) + audios
-- (uploads libres OU recordings d'appels qu'un SDR partage avec l'équipe).
-- Évite de passer par un Drive externe ou un ZIP download.
--
-- Convention :
--  - kind='document' → fichier dans bucket 'shared-resources' (PDF/PPT/DOCX/MP3/etc.)
--  - kind='audio' → upload audio libre (MP3/M4A) dans bucket 'shared-resources'
--  - kind='call_recording' → audio COPIÉ depuis bucket 'recordings' au moment du
--    partage. Garantit que la resource reste accessible même si le call est
--    supprimé/archivé. La copie va aussi dans 'shared-resources'.
--  - kind='link' → URL externe (YouTube, doc Notion, etc.)

CREATE TABLE IF NOT EXISTS public.shared_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,

  kind text NOT NULL CHECK (kind IN ('document', 'audio', 'call_recording', 'link')),
  title text NOT NULL,
  description text,
  tags text[] NOT NULL DEFAULT '{}'::text[],

  -- Source du contenu (un seul rempli selon kind)
  storage_path text,                           -- chemin dans bucket 'shared-resources'
  external_url text,                           -- pour kind='link'
  source_call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,  -- ref informative

  -- Metadata du fichier (utile pour l'UI)
  file_size_bytes bigint,
  mime_type text,
  duration_seconds numeric,                    -- pour les audios

  -- Acteur (snapshot pour persister même si user supprimé)
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  created_by_email text,

  visibility text NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'admins_only')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Au moins une source de contenu
  CONSTRAINT shared_resources_has_content CHECK (
    storage_path IS NOT NULL OR external_url IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_shared_resources_org_created
  ON public.shared_resources(organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_resources_kind
  ON public.shared_resources(organisation_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_resources_tags
  ON public.shared_resources USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_shared_resources_creator
  ON public.shared_resources(created_by, created_at DESC) WHERE created_by IS NOT NULL;

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.shared_resources ENABLE ROW LEVEL SECURITY;

-- SELECT : membre de l'org, et si visibility='admins_only', doit être admin/super_admin/manager
DROP POLICY IF EXISTS shared_resources_select ON public.shared_resources;
CREATE POLICY shared_resources_select ON public.shared_resources
  FOR SELECT
  USING (
    organisation_id = private.get_my_org()
    AND (
      visibility = 'all'
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('super_admin', 'admin', 'manager')
      )
    )
  );

-- INSERT : tout membre de l'org peut partager
DROP POLICY IF EXISTS shared_resources_insert ON public.shared_resources;
CREATE POLICY shared_resources_insert ON public.shared_resources
  FOR INSERT
  WITH CHECK (
    organisation_id = private.get_my_org()
    AND created_by = auth.uid()
  );

-- UPDATE : créateur OU admin
DROP POLICY IF EXISTS shared_resources_update ON public.shared_resources;
CREATE POLICY shared_resources_update ON public.shared_resources
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

-- DELETE : créateur OU admin
DROP POLICY IF EXISTS shared_resources_delete ON public.shared_resources;
CREATE POLICY shared_resources_delete ON public.shared_resources
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
CREATE OR REPLACE FUNCTION public.shared_resources_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS shared_resources_updated_at ON public.shared_resources;
CREATE TRIGGER shared_resources_updated_at
  BEFORE UPDATE ON public.shared_resources
  FOR EACH ROW EXECUTE FUNCTION public.shared_resources_set_updated_at();

-- ─── Storage bucket ───────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('shared-resources', 'shared-resources', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS : utilisateur peut lire/écrire dans le sous-dossier de son org
-- Path convention : {organisation_id}/{resource_id}/{filename}

DROP POLICY IF EXISTS shared_resources_storage_select ON storage.objects;
CREATE POLICY shared_resources_storage_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'shared-resources'
    AND (storage.foldername(name))[1]::uuid = private.get_my_org()
  );

DROP POLICY IF EXISTS shared_resources_storage_insert ON storage.objects;
CREATE POLICY shared_resources_storage_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'shared-resources'
    AND (storage.foldername(name))[1]::uuid = private.get_my_org()
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS shared_resources_storage_delete ON storage.objects;
CREATE POLICY shared_resources_storage_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'shared-resources'
    AND (storage.foldername(name))[1]::uuid = private.get_my_org()
  );

-- ─── Notifications : tracker last_seen pour le badge "nouveaux docs" ──────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_resources_at timestamptz DEFAULT now();

COMMENT ON COLUMN public.profiles.last_seen_resources_at IS
  'Timestamp dernière visite onglet Ressources. Permet d''afficher un badge "X nouveaux docs depuis ta dernière visite".';

-- RPC pour marquer comme vu (appelée quand l'user ouvre l'onglet Ressources)
CREATE OR REPLACE FUNCTION public.touch_resources_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE public.profiles
  SET last_seen_resources_at = now()
  WHERE id = auth.uid();
END $$;

REVOKE ALL ON FUNCTION public.touch_resources_seen FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_resources_seen TO authenticated;

COMMENT ON TABLE public.shared_resources IS
  'Hub interne de partage : docs (brochures, playbooks) + audios (uploads libres ou recordings de calls). Stockage Supabase bucket shared-resources. Pour kind=call_recording, l''audio est COPIÉ depuis bucket recordings → garantit persistance même si call supprimé.';
