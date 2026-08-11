-- What the learner has actually demonstrated. The ground truth the whole teaching policy reads.
--
-- APPLIED 2026-08-11 to production, and exercised before this line was written.
--
-- 🔴 A MISSING POLICY IS SILENT, NOT LOUD — the single most surprising thing here. With no UPDATE
-- policy, RLS does NOT raise: zero rows qualify, so the statement SUCCEEDS having changed nothing.
-- The protection is real; the signal is not. The first version of the acceptance test caught the
-- exception it expected to see, saw none, and concluded the log was writable — when in fact the
-- update had done nothing at all. Assert on ROWS AFFECTED and on the value actually stored, never
-- on an error being thrown. Anything that decides "append-only holds" by catching an exception will
-- decide the opposite of the truth.
--
-- Proved under `role authenticated` (never the service role, which bypasses RLS), calibrated first
-- by confirming a wrong-owner insert is refused and that a reveal cannot carry a verdict:
--
--   UPDATE the stored verdict     0 rows affected, value still `understood`
--   DELETE the row                0 rows affected, row still present
--   generic -> brand              1 demonstration, verdict `understood`  -> status `correct`
--   brand   -> generic            NO evidence at all                     -> status `unknown`
--   another authenticated user    0 evidence rows, 0 on a targeted lookup
--
-- That last pair is the point of the whole step: one fact, two directions, and the learner is
-- demonstrably able to do one and UNKNOWN on the other — not weak, not incorrect. A single
-- "knows about losartan" verdict could never have said that.
--
-- 🔴 APPEND-ONLY, AND THAT IS ENFORCED HERE RATHER THAN INTENDED IN A COMMENT. There are SELECT and
-- INSERT policies below and deliberately NO UPDATE and NO DELETE. Under RLS, an operation with no
-- policy is refused — so "append-only" is a property of the database, not a convention that holds
-- until someone writes an UPDATE. A record of what a person did is not something a later process
-- should be able to quietly revise; if a claim turns out to be wrong, the correction is another row
-- saying so, which is also how the learner's own change of understanding is already recorded.
--
-- 🔴 TWO INDEPENDENT FACTS, KEPT IN TWO COLUMNS. `demonstration_obtained` says whether any usable
-- demonstration came back; `verdict` says what it showed, and is NULL whenever none was obtained.
-- Collapsing them into one `outcome` would force "revealed the answer" into "answered wrongly" —
-- absence of evidence stored as negative evidence, which is the exact defect this whole step
-- exists to prevent. The existing code already separates them: `Verdict` has no value for a
-- reveal, `revealed` sits beside `evaluation`, and canvas-scheduling.ts reads it first.
--
-- 🔴 THERE IS NO learner_objective_state TABLE, ON PURPOSE. Learner state is a PROJECTION of this
-- log (apps/web/lib/learn/learner-evidence.ts), computed on read and proved order-independent and
-- idempotent by its tests. A stored projection is a second copy of the truth that can disagree with
-- it, and nothing in the system would compare the two. `canvas-retention.ts` already works this way
-- inside a canvas — "there is no `stability` column". Add a cache when a measured read cost calls
-- for one; adding it later is easy, and removing it after evidence points at it is not.
--
-- WRITE PATH, STATED SO IT IS NOT DISCOVERED AS A FAILED INSERT: the objective row must exist
-- before its evidence can. Upsert the knowledge object, upsert its objectives, then insert
-- evidence. The foreign key is real rather than a copied identity string for the same reason
-- learning_objectives references knowledge_objects by id — two representations of one relationship
-- are two things that can disagree, invisibly.

create table if not exists public.learner_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  objective_id uuid not null references public.learning_objectives(id) on delete cascade,

  -- When the learner did the thing, NOT when the row was written. A retried write must not move
  -- an event in time, because the projection orders by this.
  occurred_at timestamptz not null,

  -- Was any usable demonstration obtained at all? False covers revealing the answer, giving up,
  -- and a response the evaluator could not read: three routes to the same fact, which is that an
  -- opportunity was given and we still do not know.
  demonstration_obtained boolean not null,

  -- What it showed. 🔴 NULL WHENEVER NOTHING WAS DEMONSTRATED — never a stand-in verdict. The
  -- CHECK enforces the pairing so the two columns cannot drift into contradicting each other.
  verdict text check (verdict in ('strong', 'understood', 'partial', 'incorrect', 'misconception')),
  constraint learner_evidence_verdict_matches_demonstration check (
    (demonstration_obtained and verdict is not null) or (not demonstration_obtained and verdict is null)
  ),

  -- 0-1: how much the response actually settled. A correct one-liner to a broad task is a real
  -- demonstration and weak evidence, and the difference matters to what gets asked next.
  confidence real check (confidence is null or (confidence >= 0 and confidence <= 1)),

  -- Named competing models, when the verdict is `misconception`. Kept so they can be taught
  -- against rather than merely retried.
  misconceptions jsonb not null default '[]'::jsonb,

  -- Which canvas produced it. PROVENANCE ONLY. 🔴 Never a filter for reading state back: the whole
  -- point of this table is that a second canvas sees what the first one established. Nullable and
  -- ON DELETE SET NULL, because deleting a canvas must not delete what the learner demonstrated —
  -- that would make the learner's history a property of a session again.
  canvas_id uuid references public.learning_canvases(id) on delete set null,

  -- Which evaluator made the claim. Evidence from a different evaluator is a different claim, and
  -- after the fact there is no other way to tell them apart. Not part of any key.
  evaluator_version text check (char_length(evaluator_version) <= 40),

  created_at timestamptz not null default now()
);

-- The read the teaching policy makes: everything this learner has shown for this objective,
-- most recent first. Ends in a unique column so a paged read cannot silently skip or repeat a row.
create index if not exists learner_evidence_objective_idx
  on public.learner_evidence(user_id, objective_id, occurred_at desc, id);

alter table public.learner_evidence enable row level security;

create policy learner_evidence_owner_select on public.learner_evidence
  for select using ((select auth.uid()) = user_id);
create policy learner_evidence_owner_insert on public.learner_evidence
  for insert with check ((select auth.uid()) = user_id);

-- 🔴 NO UPDATE POLICY AND NO DELETE POLICY. Their absence is the append-only guarantee. Do not add
-- them to fix a bug in how something was recorded — record another row.
