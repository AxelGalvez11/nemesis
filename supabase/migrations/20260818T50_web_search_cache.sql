-- 20260818T50 — the same question is not asked of a paid provider twice.
--
-- 🔴🔴 THE OWNER'S RULE: *"Do not repeatedly search for the same fact or repeatedly
-- reacquire the same source when durable grounding already exists."* A chat turn
-- that searched, an immediate follow-up that searched the same thing, and a page
-- reload that searched it a third time were three billed searches for one
-- question, and nothing looked.
--
-- 🔴 THE WINDOW IS A SESSION, NOT A DAY, AND THAT IS THE WHOLE DESIGN CONSTRAINT.
-- This lane also serves questions about NOW — `classifyChatRequest` routes "what
-- happened today" through it — so a cache measured in hours would answer today's
-- news with yesterday's. Twenty minutes covers a conversation, a reload and a
-- second look, and nothing further.
--
-- 🔴 PER LEARNER, for the reason every other cache in this system is: a search
-- result is a record that a particular person asked a particular question, and
-- serving one person's results to another is a change to what user data is.
--
-- 🔴 AND A CACHE HIT IS NOT METERED. The learner's daily and monthly unit counters
-- are untouched by a hit: a search nobody paid for must not spend somebody's
-- allowance, or the cache would give with one hand and take with the other. The
-- EVENT is still written (`nemesis_search_cache_hit`), because a saving that
-- leaves no trace is indistinguishable from a lane that stopped being used.

create table if not exists public.web_search_cache (
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The question, normalised: trimmed, lowercased, whitespace collapsed, clipped.
  -- Trivial differences are the same question; a genuinely different one is a
  -- different row.
  query_key text not null check (char_length(query_key) between 1 and 500),

  -- The provider's answer, exactly as it was returned, so a hit is byte-identical
  -- to a miss from the caller's side.
  response jsonb not null,

  expires_at timestamptz not null,
  created_at timestamptz not null default now(),

  primary key (user_id, query_key)
);

comment on table public.web_search_cache is
  'One learner''s recent web-search answers, for a session-length window. Read before a paid provider is called; a hit is not metered.';

-- Expiry is enforced by the READ (`expires_at > now()`), never by a sweep, so a
-- stale row can never be served even if nothing has collected it. The index makes
-- collection cheap when somebody does.
create index if not exists web_search_cache_expiry_idx
  on public.web_search_cache (expires_at);

alter table public.web_search_cache enable row level security;

-- 🔴 SERVICE ROLE ONLY. A client that could write here could put chosen results in
-- front of a model that is about to cite them.
revoke all on public.web_search_cache from anon, authenticated;
