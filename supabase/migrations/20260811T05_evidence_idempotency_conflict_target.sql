-- The idempotency constraint the CLIENT can actually name.
--
-- 🔴 THE PARTIAL INDEX IN T04 MADE EVERY EVIDENCE WRITE FROM THE APP FAIL, AND NOTHING CAUGHT IT
-- FOR HOURS. Postgres will only use an `ON CONFLICT (cols)` target that matches a unique index it
-- can prove applies to the row, and a PARTIAL index (`where response_id is not null`) is not that:
-- the statement would have to repeat the predicate, which PostgREST has no way to emit. So every
-- insert came back with:
--
--     there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- 🔴 AND THE PROOF THAT SAID IDEMPOTENCY WORKED COULD NOT HAVE SEEN THIS. It submitted the same
-- `response_id` three times in raw SQL and watched one row survive — which tested the INDEX and
-- never the WRITE PATH. The index was fine. The client could not name it. A boundary was verified
-- from one side only, which is the failure this codebase keeps re-learning: the first real run
-- through the running app found it in one attempt.
--
-- WHY A PLAIN UNIQUE INDEX HAS THE SAME MEANING.
-- The predicate was there to leave `response_id is null` rows uncovered — evidence from an import
-- or a backfill, which has no response to be idempotent about. It was never needed: Postgres
-- treats NULLs as DISTINCT in a unique index by default, so any number of rows with a NULL
-- `response_id` still coexist. The partial clause bought nothing and cost the whole lane.

drop index if exists public.learner_evidence_response_idx;

create unique index if not exists learner_evidence_response_idx
  on public.learner_evidence(user_id, objective_id, response_id);
