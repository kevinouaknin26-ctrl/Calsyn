-- 040_sensitive_access_audit.sql
--
-- Trace les accès aux données IA sensibles (transcriptions, résumés, notes prospects).
-- Pas d'encryption pgcrypto en V1 (cf docs/V1_SECURITY_GAPS.md) mais on log qui lit quoi.
--
-- Stratégie :
--   - Vue masquante `calls_redacted` qui hash les transcriptions par défaut
--   - RPC `get_call_transcript(call_id)` qui logge dans `audit_events`
--   - Le front utilise la RPC pour révéler une transcription → audit trail

CREATE OR REPLACE FUNCTION public.get_call_transcript(p_call_id uuid)
RETURNS TABLE (
  id uuid,
  ai_transcript text,
  ai_summary text,
  ai_score_global numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_org_id uuid;
  v_caller_org_id uuid;
BEGIN
  -- Vérifier que le caller appartient à l'org du call (RLS-aware)
  SELECT private.get_my_org() INTO v_caller_org_id;
  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no org context';
  END IF;

  SELECT c.organisation_id INTO v_org_id FROM public.calls c WHERE c.id = p_call_id;
  IF v_org_id IS NULL OR v_org_id != v_caller_org_id THEN
    RAISE EXCEPTION 'Unauthorized: call not in your org';
  END IF;

  -- Audit log : qui a lu quelle transcription
  PERFORM public.log_audit_event(
    p_organisation_id := v_caller_org_id,
    p_actor_user_id := auth.uid(),
    p_event_type := 'call.transcript_accessed',
    p_event_category := 'data',
    p_description := 'Accès transcription IA',
    p_target_user_id := NULL,
    p_metadata := jsonb_build_object('call_id', p_call_id),
    p_ip := NULL,
    p_ua := NULL
  );

  -- Retourner la transcription
  RETURN QUERY
  SELECT c.id, c.ai_transcript, c.ai_summary, c.ai_score_global
  FROM public.calls c
  WHERE c.id = p_call_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_call_transcript FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_call_transcript TO authenticated;

COMMENT ON FUNCTION public.get_call_transcript IS
  'Lit une transcription IA avec audit trail. À utiliser depuis le front à la place de SELECT direct sur calls.ai_transcript.';
