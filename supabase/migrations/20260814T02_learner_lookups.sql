-- When the learner had to stop and ask what a word meant. Friction, and the answer they were given.
--
-- 🔴🔴 FRICTION IS NOT EVIDENCE, AND THIS IS A SEPARATE TABLE RATHER THAN A SIXTH `ObjectiveEvidence`
-- VALUE FOR THAT REASON. `projectLearnerState` reads `learner_evidence` and turns rows into
-- attempts; a friction row landing there would enter `attempts` and start moving a learner's status.
-- Looking up a term is not an attempt at anything and contradicts nothing — it is the learner
-- telling us the LANGUAGE is in the way, which is a different fact that calls for a different
-- response. Owner: *"simplifies language under terminology friction"*, and separately
-- *"distinguishes missing fact from wrong mental model"*. Three distinct things, three shapes.
--
-- 🔴 APPEND-ONLY, LIKE `learner_evidence`, AND FOR THE SAME REASON — the count IS the signal. One
-- row per lookup rather than a row per term with a counter: looking the same word up three times
-- across two sittings is real terminology friction, and looking it up once is curiosity. A counter
-- column would need UPDATE, and an UPDATE policy on a record of what a person did is exactly what
-- `learner_evidence` refuses. The strength is `count(*)`, which cannot drift from the events.
--
-- 🔴 AND IT IS THE GLOSSARY, NOT JUST A LOG. The owner asked for both halves in one sentence:
-- *"I want users to be able to highlight a word to define or explain and have nemesis keep track of
-- that to provide the definition in the future."* The definition rides on the row, so the reuse
-- store and the friction signal are THE SAME ROWS and cannot disagree — a glossary that said one
-- thing while the friction count said another would be two sources of truth about one event.
--
-- 🔴 `definition` IS NULLABLE, AND NULL IS "WE DID NOT ANSWER", NEVER "NO DEFINITION EXISTS". The
-- learner asked either way, so the friction is real either way; recording only the successful
-- lookups would make the signal quietly measure our own availability instead of their difficulty.
--
-- APPLIED TO PRODUCTION AHEAD OF THE CODE. Nothing in this repo applies migrations automatically,
-- so shipping the two together means every write 500s until someone notices.

create table if not exists public.learner_lookups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,

  -- 🔴 THE NORMALISED JOIN KEY — `glossaryKey` in vocabulary-lookup.ts, case- and punctuation-folded
  -- and script-agnostic. Reuse asks "have they looked THIS up before", and "Reading Frame" and
  -- "reading frame," are the same question. Stored rather than computed on read so the answer does
  -- not change under a row when the normaliser is improved.
  term text not null check (char_length(term) between 1 and 200),

  -- What they actually selected, verbatim. Kept because the definition was given for THIS phrasing,
  -- and because showing a learner their own words back is not the same as showing them a key.
  display_term text not null check (char_length(display_term) <= 400),

  -- What Nemesis gave back. NULL means the lookup happened and no answer did — see above.
  definition text check (definition is null or char_length(definition) <= 4000),

  -- Which canvas they were reading. PROVENANCE ONLY, never a filter for reading the glossary back:
  -- a term learned on Tuesday must be reusable on Friday, which is the entire point.
  canvas_id uuid references public.learning_canvases(id) on delete set null,

  -- When the learner asked, NOT when the row was written. A retried write must not move the event.
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- The two reads this table exists for, in one index: "what is this term, for this learner" and
-- "how often have they needed it". 🔴 Ends in a unique column so a paged read cannot skip a row.
create index if not exists learner_lookups_term_idx
  on public.learner_lookups(user_id, term, occurred_at desc, id);

alter table public.learner_lookups enable row level security;

create policy learner_lookups_owner_select on public.learner_lookups
  for select using ((select auth.uid()) = user_id);
create policy learner_lookups_owner_insert on public.learner_lookups
  for insert with check ((select auth.uid()) = user_id);

-- 🔴 NO UPDATE POLICY AND NO DELETE POLICY, and their absence IS the append-only guarantee. Under
-- RLS an operation with no policy is refused — silently, affecting zero rows rather than raising,
-- which is the trap `learner_evidence` records: anything that decides "append-only holds" by
-- catching an exception decides the opposite of the truth. Assert on rows affected.
