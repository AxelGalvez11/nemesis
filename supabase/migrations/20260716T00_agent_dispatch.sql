-- 20260716T00_agent_dispatch.sql
-- Dispatch mailbox: phone queues missions, desktop claims + runs them,
-- events stream status back. All rows owned by one user; RLS everywhere.

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('desktop', 'ios', 'android', 'web')),
  name text not null default '',
  expo_push_token text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, kind, name)
);

create table public.agent_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  prompt text not null check (char_length(prompt) between 1 and 20000),
  target text not null default 'desktop' check (target in ('desktop')),
  status text not null default 'queued'
    check (status in ('queued','claimed','running','needs_review','done','failed','cancelled')),
  result_summary text,
  claimed_by uuid references public.devices(id) on delete set null,
  created_by uuid references public.devices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agent_missions_user_status_idx
  on public.agent_missions (user_id, status, created_at desc);

create table public.mission_events (
  id bigint generated always as identity primary key,
  mission_id uuid not null references public.agent_missions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('status','log','result','error')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index mission_events_mission_idx
  on public.mission_events (mission_id, id);

alter table public.devices enable row level security;
alter table public.agent_missions enable row level security;
alter table public.mission_events enable row level security;

create policy devices_own on public.devices
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy missions_own on public.agent_missions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mission_events_own on public.mission_events
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Phone subscribes live to events + mission status flips.
alter publication supabase_realtime add table public.mission_events;
alter publication supabase_realtime add table public.agent_missions;
