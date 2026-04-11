-- ══════════════════════════════════════════════════════════════════
-- CALLIO V2 — Schema initial
-- Projet Supabase : enrpuayypjnpfmdgpfhs (eu-west-3 Paris)
-- Date : 2026-04-10
-- ══════════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema prive pour les helpers RLS (non expose a l'API PostgREST)
CREATE SCHEMA IF NOT EXISTS private;

-- ══════════════════════════════════════════════════════════════════
-- ORGANISATIONS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE organisations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  slug                 text UNIQUE NOT NULL,
  plan                 text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'scale')),
  max_sdrs             int NOT NULL DEFAULT 5,
  is_active            boolean NOT NULL DEFAULT true,
  voice_provider       text NOT NULL DEFAULT 'twilio' CHECK (voice_provider IN ('twilio', 'telnyx')),
  credit_balance       numeric NOT NULL DEFAULT 0,
  credit_reserved      numeric NOT NULL DEFAULT 0,
  recording_compliance boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════
-- PROFILES
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE profiles (
  id                uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organisation_id   uuid REFERENCES organisations(id) ON DELETE CASCADE,
  email             text NOT NULL,
  full_name         text,
  role              text NOT NULL DEFAULT 'sdr' CHECK (role IN ('super_admin', 'admin', 'manager', 'sdr')),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════
-- PROSPECT LISTS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE prospect_lists (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name              text NOT NULL,
  assigned_to       text[] NOT NULL DEFAULT '{}',
  created_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════
-- PROSPECTS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE prospects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id           uuid NOT NULL REFERENCES prospect_lists(id) ON DELETE CASCADE,
  organisation_id   uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name              text NOT NULL DEFAULT '',
  phone             text NOT NULL,
  email             text,
  company           text,
  sector            text,
  status            text NOT NULL DEFAULT 'idle',
  call_count        int NOT NULL DEFAULT 0,
  last_call_at      timestamptz,
  snoozed_until     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════
-- CALLS
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE calls (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  sdr_id                uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  prospect_id           uuid REFERENCES prospects(id) ON DELETE SET NULL,
  prospect_name         text,
  prospect_phone        text,
  call_sid              text UNIQUE,
  conference_sid        text,
  call_outcome          text,
  call_duration         int NOT NULL DEFAULT 0,
  note                  text,
  meeting_booked        boolean NOT NULL DEFAULT false,
  recording_url         text,
  recording_consent     boolean NOT NULL DEFAULT true,
  provider              text NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio', 'telnyx', 'manual')),
  audio_quality_mos     numeric,
  from_number           text,
  list_id               uuid REFERENCES prospect_lists(id) ON DELETE SET NULL,
  ai_analysis_status    text NOT NULL DEFAULT 'pending' CHECK (ai_analysis_status IN ('pending', 'processing', 'completed', 'error')),
  ai_transcript         text,
  ai_summary            jsonb,
  ai_score_global       numeric,
  ai_score_accroche     numeric,
  ai_score_objection    numeric,
  ai_score_closing      numeric,
  ai_points_forts       jsonb,
  ai_points_amelioration jsonb,
  ai_intention_prospect text,
  ai_prochaine_etape    text,
  ai_analyzed_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════
-- DIALING SESSIONS (parallel dial batches)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE dialing_sessions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  sdr_id                 uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  prospects              uuid[] NOT NULL DEFAULT '{}',
  connected_prospect_id  uuid REFERENCES prospects(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE dialing_session_calls (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES dialing_sessions(id) ON DELETE CASCADE,
  prospect_id     uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  call_sid        text UNIQUE,
  status          text NOT NULL DEFAULT 'ringing',
  answered_by     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════
-- ANALYSIS JOBS (queue async IA)
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE analysis_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id         uuid NOT NULL UNIQUE REFERENCES calls(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error')),
  attempts        int NOT NULL DEFAULT 0,
  raw_output      jsonb,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

-- ══════════════════════════════════════════════════════════════════
-- INDEXES
-- ══════════════════════════════════════════════════════════════════
CREATE INDEX idx_profiles_org ON profiles(organisation_id);
CREATE INDEX idx_prospects_list ON prospects(list_id);
CREATE INDEX idx_prospects_org ON prospects(organisation_id);
CREATE INDEX idx_prospects_phone ON prospects(phone);
CREATE INDEX idx_calls_org ON calls(organisation_id);
CREATE INDEX idx_calls_sdr ON calls(sdr_id);
CREATE INDEX idx_calls_sid ON calls(call_sid);
CREATE INDEX idx_calls_conf_sid ON calls(conference_sid);
CREATE INDEX idx_calls_created ON calls(created_at DESC);
CREATE INDEX idx_calls_prospect_phone ON calls(prospect_phone);
CREATE INDEX idx_analysis_jobs_status ON analysis_jobs(status);

-- ══════════════════════════════════════════════════════════════════
-- RLS HELPERS (schema prive, non expose API)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION private.get_my_org()
RETURNS uuid AS $$
  SELECT organisation_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION private.get_my_role()
RETURNS text AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ══════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialing_session_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY;

-- ORGANISATIONS
CREATE POLICY "org_select" ON organisations FOR SELECT
  USING (id = private.get_my_org());
CREATE POLICY "org_update" ON organisations FOR UPDATE
  USING (id = private.get_my_org() AND private.get_my_role() IN ('super_admin', 'admin'));

-- PROFILES
CREATE POLICY "profile_select_own" ON profiles FOR SELECT
  USING (id = auth.uid());
CREATE POLICY "profile_select_org" ON profiles FOR SELECT
  USING (organisation_id = private.get_my_org() AND private.get_my_role() IN ('super_admin', 'admin', 'manager'));
CREATE POLICY "profile_update_own" ON profiles FOR UPDATE
  USING (id = auth.uid());

-- PROSPECT LISTS
CREATE POLICY "lists_select" ON prospect_lists FOR SELECT
  USING (organisation_id = private.get_my_org());
CREATE POLICY "lists_insert" ON prospect_lists FOR INSERT
  WITH CHECK (organisation_id = private.get_my_org());
CREATE POLICY "lists_update" ON prospect_lists FOR UPDATE
  USING (organisation_id = private.get_my_org());
CREATE POLICY "lists_delete" ON prospect_lists FOR DELETE
  USING (organisation_id = private.get_my_org() AND private.get_my_role() IN ('super_admin', 'admin'));

-- PROSPECTS
CREATE POLICY "prospects_select" ON prospects FOR SELECT
  USING (organisation_id = private.get_my_org());
CREATE POLICY "prospects_insert" ON prospects FOR INSERT
  WITH CHECK (organisation_id = private.get_my_org());
CREATE POLICY "prospects_update" ON prospects FOR UPDATE
  USING (organisation_id = private.get_my_org());
CREATE POLICY "prospects_delete" ON prospects FOR DELETE
  USING (organisation_id = private.get_my_org());

-- CALLS
CREATE POLICY "calls_select_own" ON calls FOR SELECT
  USING (sdr_id = auth.uid());
CREATE POLICY "calls_select_org" ON calls FOR SELECT
  USING (organisation_id = private.get_my_org() AND private.get_my_role() IN ('super_admin', 'admin', 'manager'));
CREATE POLICY "calls_insert" ON calls FOR INSERT
  WITH CHECK (sdr_id = auth.uid() AND organisation_id = private.get_my_org());
CREATE POLICY "calls_update_own" ON calls FOR UPDATE
  USING (sdr_id = auth.uid());

-- DIALING SESSIONS
CREATE POLICY "sessions_select" ON dialing_sessions FOR SELECT
  USING (organisation_id = private.get_my_org());
CREATE POLICY "sessions_insert" ON dialing_sessions FOR INSERT
  WITH CHECK (sdr_id = auth.uid() AND organisation_id = private.get_my_org());

-- SESSION CALLS
CREATE POLICY "session_calls_select" ON dialing_session_calls FOR SELECT
  USING (session_id IN (SELECT id FROM dialing_sessions WHERE organisation_id = private.get_my_org()));

-- ANALYSIS JOBS
CREATE POLICY "jobs_select" ON analysis_jobs FOR SELECT
  USING (call_id IN (SELECT id FROM calls WHERE organisation_id = private.get_my_org()));

-- ══════════════════════════════════════════════════════════════════
-- RPC FUNCTIONS
-- ══════════════════════════════════════════════════════════════════

-- Credit lock pessimiste avant chaque dial
CREATE OR REPLACE FUNCTION public.check_and_lock_credit(
  p_org_id uuid,
  p_num_calls int,
  p_max_cost_per_call numeric DEFAULT 1.00
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance numeric;
  v_required numeric;
BEGIN
  SELECT credit_balance INTO v_balance
  FROM organisations WHERE id = p_org_id FOR UPDATE;

  v_required := p_num_calls * p_max_cost_per_call;
  IF v_balance < v_required THEN RETURN false; END IF;

  UPDATE organisations
  SET credit_balance = credit_balance - v_required,
      credit_reserved = credit_reserved + v_required
  WHERE id = p_org_id;

  RETURN true;
END;
$$;

-- Release credit apres l'appel (ajuster le cout reel)
CREATE OR REPLACE FUNCTION public.release_credit(
  p_org_id uuid,
  p_reserved numeric,
  p_actual_cost numeric
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE organisations
  SET credit_reserved = credit_reserved - p_reserved,
      credit_balance = credit_balance + (p_reserved - p_actual_cost)
  WHERE id = p_org_id;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ══════════════════════════════════════════════════════════════════

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'sdr');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER update_organisations_ts BEFORE UPDATE ON organisations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_profiles_ts BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_calls_ts BEFORE UPDATE ON calls FOR EACH ROW EXECUTE FUNCTION update_updated_at();
