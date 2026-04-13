-- Table pour stocker les tokens OAuth des integrations tierces (Google Calendar, etc.)
create table if not exists public.user_integrations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,               -- ex: 'google_calendar'
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz not null,
  scopes text,                          -- scopes accordes par l'utilisateur
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Un seul enregistrement par user + provider
  unique(user_id, provider)
);

-- Index pour les lookups rapides
create index if not exists idx_user_integrations_user_provider
  on public.user_integrations(user_id, provider);

-- RLS : chaque user ne voit que ses propres integrations
alter table public.user_integrations enable row level security;

create policy "Users can view own integrations"
  on public.user_integrations for select
  using (auth.uid() = user_id);

create policy "Users can insert own integrations"
  on public.user_integrations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own integrations"
  on public.user_integrations for update
  using (auth.uid() = user_id);

create policy "Users can delete own integrations"
  on public.user_integrations for delete
  using (auth.uid() = user_id);

-- Note : les Edge Functions utilisent SUPABASE_SERVICE_ROLE_KEY pour bypass RLS
-- quand elles doivent ecrire les tokens au callback (pas de JWT user a ce moment).
