-- Learning Canvas pilot (/learn) — one row per thing a student is trying to understand.
--
-- APPLIED 2026-08-08. The table is live. This header used to say "not yet applied", which was
-- true when it was written and badly misleading afterwards — anyone reading it would conclude
-- canvases live only in the browser and plan around a constraint that no longer exists.
--
-- The browser fallback in apps/web/lib/learn/canvas-store.ts is still there and still correct:
-- it is what a signed-out learner gets, not a stand-in for this table.
--
-- WHY A NEW TABLE RATHER THAN REUSING study_artifacts.
-- study_artifacts is the obvious neighbour, but its `kind` is CHECK-constrained to
-- ('test','mindmap'). Widening that constraint would put canvas rows inside a table the Study
-- page reads and lists, and every query there would have to learn to exclude them. A new
-- table cannot affect anything that already works. Nothing existing is modified here.
--
-- WHY THE DOCUMENT IS ONE JSONB COLUMN.
-- The pilot's question is whether the interaction feels right, not what the final schema is.
-- Blocks, concepts, cards and answers change shape every time we learn something, and a
-- normalised schema would have to be migrated on each of those. One column keeps the cost of
-- being wrong at zero. If the canvas earns a place in the product, that is the moment to
-- normalise — with a real shape rather than a guessed one.

create table if not exists public.learning_canvases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 300),
  state text not null default 'empty' check (state in (
    'empty', 'sources_attached', 'orient', 'learn', 'recall',
    'test', 'diagnose', 'targeted_relearn', 'retest', 'complete'
  )),
  level text check (level in ('fundamentals', 'basics_known', 'advanced', 'exam')),
  -- The whole canvas: sources (with extracted excerpts), blocks, concepts, recall cards,
  -- questions, answers, weak/corrected concept ids. Shape lives in canvas-model.ts.
  document jsonb not null default '{}'::jsonb,
  -- Milliseconds of active learning, accumulated across visits. Plain column so the
  -- completion state and any later analysis can read it without parsing the document.
  active_ms integer not null default 0 check (active_ms >= 0),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The list query: my canvases, most recently touched first.
create index if not exists learning_canvases_owner_idx
  on public.learning_canvases(user_id, updated_at desc)
  where deleted = false;

create or replace function public.learning_canvases_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists learning_canvases_touch on public.learning_canvases;
create trigger learning_canvases_touch before update on public.learning_canvases
for each row execute function public.learning_canvases_touch_updated_at();

alter table public.learning_canvases enable row level security;

-- Owner-only, all four verbs. A canvas holds the text of a student's own lecture material,
-- so there is no shared or public read path here at all.
drop policy if exists learning_canvases_select on public.learning_canvases;
create policy learning_canvases_select on public.learning_canvases for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists learning_canvases_insert on public.learning_canvases;
create policy learning_canvases_insert on public.learning_canvases for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists learning_canvases_update on public.learning_canvases;
create policy learning_canvases_update on public.learning_canvases for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists learning_canvases_delete on public.learning_canvases;
create policy learning_canvases_delete on public.learning_canvases for delete to authenticated
using ((select auth.uid()) = user_id);

-- Same grant shape as study_artifacts: nothing to anon, explicit verbs to authenticated.
revoke all on public.learning_canvases from anon, authenticated;
grant select, insert, update, delete on public.learning_canvases to authenticated;
