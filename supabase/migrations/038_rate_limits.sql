-- ════════════════════════════════════════════════════════════════
-- Rate limiting : protection contre la consommation excessive d'APIs
-- payantes (Twilio, Anthropic, Deepgram, OpenAI, Resend) et anti-spam.
--
-- Modèle : compteur par (user_id, action, fenêtre temporelle).
-- Implémenté via une table append-only `rate_limit_events` + une fonction
-- `check_rate_limit()` qui retourne true/false selon les limites.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  organisation_id UUID,
  action TEXT NOT NULL,  -- 'sms_send', 'email_send', 'ai_analysis', 'ai_suggest', 'invite_user', etc.
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les lookups (user, action) sur fenêtre temporelle récente
CREATE INDEX IF NOT EXISTS rl_user_action_time_idx
  ON rate_limit_events (user_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS rl_org_action_time_idx
  ON rate_limit_events (organisation_id, action, created_at DESC)
  WHERE organisation_id IS NOT NULL;

-- Auto-cleanup : drop les events de plus de 30 jours (cron)
-- Pour éviter la croissance infinie de la table.

-- ─────────────────────────────────────────────────────────────────
-- Fonction check_rate_limit : vérifie + enregistre l'event en 1 appel.
--
-- Retourne JSONB :
--   { allowed: bool, count: int, limit: int, reset_at: timestamptz }
--
-- Si allowed=false, l'event N'est PAS enregistré (rejet upstream).
-- Si allowed=true, l'event est inséré et compté pour la prochaine vérif.
--
-- Limites par défaut (paramétrables via app_settings plus tard) :
--   sms_send         → 100 / jour / user
--   email_send       → 200 / jour / user
--   ai_analysis      → 50 / jour / user (cher : Claude Sonnet)
--   ai_suggest       → 30 / heure / user
--   invite_user      → 20 / jour / org
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_organisation_id UUID,
  p_action TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_window INTERVAL;
  v_scope TEXT;  -- 'user' ou 'org'
  v_count INT;
  v_window_start TIMESTAMPTZ;
  v_reset_at TIMESTAMPTZ;
BEGIN
  -- Configuration des limites par action
  CASE p_action
    WHEN 'sms_send'    THEN v_limit := 100; v_window := INTERVAL '1 day';  v_scope := 'user';
    WHEN 'email_send'  THEN v_limit := 200; v_window := INTERVAL '1 day';  v_scope := 'user';
    WHEN 'ai_analysis' THEN v_limit := 50;  v_window := INTERVAL '1 day';  v_scope := 'user';
    WHEN 'ai_suggest'  THEN v_limit := 30;  v_window := INTERVAL '1 hour'; v_scope := 'user';
    WHEN 'invite_user' THEN v_limit := 20;  v_window := INTERVAL '1 day';  v_scope := 'org';
    ELSE
      -- Action inconnue : limite généreuse par défaut
      v_limit := 1000; v_window := INTERVAL '1 hour'; v_scope := 'user';
  END CASE;

  v_window_start := NOW() - v_window;
  v_reset_at := v_window_start + v_window;  -- début prochaine fenêtre relative

  -- Compte les events dans la fenêtre selon le scope
  IF v_scope = 'org' AND p_organisation_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM rate_limit_events
    WHERE organisation_id = p_organisation_id
      AND action = p_action
      AND created_at >= v_window_start;
  ELSE
    SELECT COUNT(*) INTO v_count
    FROM rate_limit_events
    WHERE user_id = p_user_id
      AND action = p_action
      AND created_at >= v_window_start;
  END IF;

  -- Si limite atteinte → reject (n'enregistre pas)
  IF v_count >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'count', v_count,
      'limit', v_limit,
      'window', v_window::text,
      'reset_at', v_reset_at,
      'scope', v_scope
    );
  END IF;

  -- Sinon : enregistre l'event et autorise
  INSERT INTO rate_limit_events (user_id, organisation_id, action, metadata)
  VALUES (p_user_id, p_organisation_id, p_action, p_metadata);

  RETURN jsonb_build_object(
    'allowed', true,
    'count', v_count + 1,
    'limit', v_limit,
    'window', v_window::text,
    'reset_at', v_reset_at,
    'scope', v_scope
  );
END;
$$;

-- RLS : la table est interrogée via SECURITY DEFINER fn, pas en direct
-- mais on protège quand même (un user ne doit pas pouvoir tricher en DELETE)
ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;

-- Lecture : un user voit ses propres events (pour debug + UI quota côté front)
CREATE POLICY rate_limit_events_select_own ON rate_limit_events
  FOR SELECT
  USING (user_id = auth.uid());

-- Pas d'INSERT/UPDATE/DELETE direct possible — uniquement via la fonction SECURITY DEFINER.
-- (Pas de policy = deny par défaut)

-- ─────────────────────────────────────────────────────────────────
-- Cleanup auto : pg_cron quotidien qui drop les events > 30j
-- ─────────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'rate-limit-cleanup',
  '0 3 * * *',  -- 3h du mat tous les jours
  $$DELETE FROM rate_limit_events WHERE created_at < NOW() - INTERVAL '30 days'$$
);
