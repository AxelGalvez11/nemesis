-- Nemesis metered LLM proxy — database prep. ADDITIVE ONLY.
-- Apply with owner approval:  supabase MCP apply_migration, or SQL editor paste.

-- 1) Long-lived device API keys for the desktop app (plaintext shown once at mint;
--    only the SHA-256 hash is stored).
create table if not exists public.device_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked boolean not null default false
);

alter table public.device_keys enable row level security;

create policy device_keys_read_own on public.device_keys
  for select using (auth.uid() = user_id);
-- All writes go through the nemesis-llm edge function (service role).

create index if not exists device_keys_user_idx on public.device_keys (user_id);

-- 2) Per-plan daily token budget for the proxy (same pattern as ask_daily_limit).
--    Starting values — tune in place anytime.
insert into public.plan_entitlements (plan_code, entitlement_key, value_json, updated_at)
values
  ('free',         'nemesis_llm_daily_tokens', to_jsonb(150000),   now()),
  ('plus',         'nemesis_llm_daily_tokens', to_jsonb(1500000),  now()),
  ('pro',          'nemesis_llm_daily_tokens', to_jsonb(4000000),  now()),
  ('professional', 'nemesis_llm_daily_tokens', to_jsonb(10000000), now()),
  ('enterprise',   'nemesis_llm_daily_tokens', to_jsonb(25000000), now())
on conflict (plan_code, entitlement_key) do nothing;
