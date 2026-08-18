-- 20260818T30 — a diagram that has already been looked at is not looked at again.
--
-- 🔴🔴 GEMINI VISION IS BILLED PER IMAGE AND NOTHING HAS EVER REUSED AN ANSWER.
-- Every parse sent every qualifying figure again: a reparse after a parser
-- upgrade, the same diagram on a lecture's summary and recap slides, the same
-- figure in the handout and in the deck, the same course crest on eighty files.
-- `library_sources.vision_units_spent` counts what that cost and nothing has ever
-- been able to avoid it.
--
-- 🔴 KEYED ON THE PIXELS. `figureContentKey` is a hash of the NORMALIZED bytes —
-- the same identity the figure asset store already uses to decide that two decks'
-- copies of one diagram are one object, so a TIFF and a PNG of the same figure
-- converge on one row. This is not "this document's figures"; it is "pictures
-- this learner has already paid to have described".
--
-- 🔴 PER LEARNER, for the reason `reuse_document_parse` is. A description shared
-- across users would mean one person's private diagram — and whatever a model
-- said about it — becoming the answer served to somebody else. That is a change
-- to what user data is, not an optimisation, and it is on the owner's escalate
-- list rather than the decide list.
--
-- Additive. Nothing reads this table unless the worker installs the store.

create table if not exists public.figure_descriptions (
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Identity of the normalized pixels. 32 hex characters — the first half of a
  -- sha256, exactly as `figureContentKey` produces it.
  content_key text not null check (char_length(content_key) = 32),

  -- What the model said. Shown to learners and written into the document model,
  -- so it is prose and never a machine-readable line.
  description text not null check (char_length(description) between 1 and 4000),

  -- §46.6 occlusion labels, which arrive on the SAME request and cost nothing
  -- extra. Stored beside the prose because re-deriving them would mean a second
  -- call for a figure this table exists to stop calling about.
  labels jsonb not null default '[]'::jsonb,

  -- Which model said it. A ladder change becomes visible instead of being
  -- inherited silently — the failure `VISION_MODEL_LADDER` records at length.
  model text,

  created_at timestamptz not null default now(),
  -- Bumped on every hit, so a person can tell a cache that is earning its table
  -- from one that is only holding rows.
  last_used_at timestamptz not null default now(),
  uses int not null default 0,

  primary key (user_id, content_key)
);

comment on table public.figure_descriptions is
  'What a vision model already said about one picture, keyed on the normalized pixels, per learner. Read before any figure is sent; written after one is paid for.';

create index if not exists figure_descriptions_used_idx
  on public.figure_descriptions (last_used_at desc);

alter table public.figure_descriptions enable row level security;

-- 🔴 SERVICE ROLE ONLY. A client that could write here could put words in a
-- figure's mouth — the description is shown to a learner as what their own
-- material contains.
revoke all on public.figure_descriptions from anon, authenticated;

-- ── Recording a hit without a round trip per figure ────────────────────────
create or replace function public.touch_figure_descriptions(
  p_user_id uuid,
  p_content_keys text[]
)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.figure_descriptions
     set last_used_at = now(), uses = uses + 1
   where user_id = p_user_id
     and content_key = any(p_content_keys);
$$;

revoke execute on function public.touch_figure_descriptions(uuid, text[]) from public, anon, authenticated;
grant execute on function public.touch_figure_descriptions(uuid, text[]) to service_role;
