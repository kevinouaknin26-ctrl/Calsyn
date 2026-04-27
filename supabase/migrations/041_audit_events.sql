-- 039_audit_events.sql
--
-- Audit log enrichi pour actions sensibles (admin, sécurité, RGPD).
--
-- Table dédiée séparée de `activity_logs` (qui est prospect-centric).
-- Utilisée par les edge functions pour tracer :
--   - Suspensions / archivages d'utilisateurs
--   - Changements de rôle (admin, super_admin)
--   - Impersonations
--   - Invitations
--   - Suppressions de données (RGPD)
--
-- RLS : seuls les admins/super_admins de l'org peuvent lire.
-- INSERT : uniquement via service_role (edge functions) — pas de policy INSERT
-- pour authenticated → impossible d'écrire depuis le front.

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,

  -- Acteur (qui a fait l'action) — snapshot email/role pour préserver la lisibilité
  -- même après suppression du compte.
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  actor_role text,

  -- Cible (sur qui l'action porte) — optionnel pour les actions org-level.
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email text,

  -- Description de l'événement
  event_type text NOT NULL,           -- ex: 'user.suspended', 'user.role_changed'
  event_category text NOT NULL DEFAULT 'admin',  -- 'admin' | 'security' | 'data' | 'gdpr'
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Contexte HTTP
  ip_address text,
  user_agent text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_org_created
  ON public.audit_events(organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_type
  ON public.audit_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor
  ON public.audit_events(actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_events_target
  ON public.audit_events(target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_events_category
  ON public.audit_events(event_category, created_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_select ON public.audit_events;
CREATE POLICY audit_events_select ON public.audit_events
  FOR SELECT
  USING (
    organisation_id = private.get_my_org()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin', 'admin')
    )
  );

-- Pas de policy INSERT/UPDATE/DELETE pour authenticated → bloque l'écriture front.
-- service_role bypass RLS et peut écrire via la RPC ci-dessous.

-- Helper RPC : log un événement avec snapshot actor/target
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_organisation_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_description text,
  p_target_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_event_category text DEFAULT 'admin',
  p_ip text DEFAULT NULL,
  p_ua text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid;
  v_actor_email text;
  v_actor_role text;
  v_target_email text;
BEGIN
  -- Snapshot acteur
  IF p_actor_user_id IS NOT NULL THEN
    SELECT email, role INTO v_actor_email, v_actor_role
    FROM public.profiles WHERE id = p_actor_user_id;
  END IF;

  -- Snapshot cible
  IF p_target_user_id IS NOT NULL THEN
    SELECT email INTO v_target_email
    FROM public.profiles WHERE id = p_target_user_id;
  END IF;

  INSERT INTO public.audit_events (
    organisation_id, actor_user_id, actor_email, actor_role,
    target_user_id, target_email,
    event_type, event_category, description, metadata,
    ip_address, user_agent
  ) VALUES (
    p_organisation_id, p_actor_user_id, v_actor_email, v_actor_role,
    p_target_user_id, v_target_email,
    p_event_type, p_event_category, p_description, p_metadata,
    p_ip, p_ua
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Permissions : la RPC est appelable uniquement par service_role
REVOKE ALL ON FUNCTION public.log_audit_event FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_audit_event FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event TO service_role;

COMMENT ON TABLE public.audit_events IS
  'Audit log des actions sensibles (admin, security, data, gdpr). Écrit uniquement via edge functions service_role. Lisible par admin/super_admin.';

-- ─────────────────────────────────────────────────────────────────────────
-- RGPD : marqueur de demande de suppression sur profiles
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

COMMENT ON COLUMN public.profiles.deletion_requested_at IS
  'RGPD Article 17 : timestamp de la demande de suppression par l''utilisateur. Traité ensuite par un super_admin.';

CREATE INDEX IF NOT EXISTS idx_profiles_deletion_requested
  ON public.profiles(deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;
