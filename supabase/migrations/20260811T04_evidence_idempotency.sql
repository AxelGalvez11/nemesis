-- One learner answer is one demonstration, however many times the request arrives.
--
-- NOT YET APPLIED as of writing; update this line when it lands.
--
-- 🔴 APPEND-ONLY DOES NOT MEAN DUPLICATES ARE ACCEPTABLE, and this is the gap between those two
-- things. A single submitted answer can reach the server more than once for reasons that have
-- nothing to do with the learner: a network retry, a React effect replaying, a double click, a tab
-- restored from history, a request the client gave up on and reissued. Every one of those would
-- otherwise land as an independent piece of evidence.
--
-- That is not a cosmetic duplicate. `demonstrationCount` is what the policy reads to decide whether
-- someone has shown a capability repeatedly, so a doubled row is a learner credited with practice
-- they never did — the mirror image of the absence-as-negative-evidence defect this whole design
-- exists to avoid, and just as invisible.
--
-- WHY (objective, response) AND NOT A ROW HASH.
-- A hash of the row's contents would let the same answer submitted twice at two timestamps produce
-- two rows, which is exactly the case that actually happens. The identity that matters is "this
-- response, as evidence for this objective" — and it is deliberately per-objective, because one
-- response can legitimately be evidence for several objectives at once and those are different
-- demonstrations of different capabilities.
--
-- NULL response_id is allowed and is NOT covered by the constraint: evidence can arrive from
-- something other than a submitted response (an import, a backfill), and Postgres treats NULLs as
-- distinct in a unique index, which is the behaviour we want rather than a special case to write.

alter table public.learner_evidence
  add column if not exists response_id text
    check (response_id is null or char_length(response_id) <= 200);

-- 🔴 THE IDEMPOTENCY CONSTRAINT. Writers use `on conflict do nothing`, so a retry is a no-op rather
-- than an error — the second arrival of one answer must not fail loudly OR succeed twice.
create unique index if not exists learner_evidence_response_idx
  on public.learner_evidence(user_id, objective_id, response_id)
  where response_id is not null;

-- What the learner actually typed, kept so a decision can explain itself later. 🔴 NOT used to
-- recompute a verdict: the evaluation is what determines evidence, and re-judging stored text
-- months later with a different evaluator would silently rewrite history.
alter table public.learner_evidence
  add column if not exists response_text text
    check (response_text is null or char_length(response_text) <= 4000);

-- Which task was asked. Provenance for "why did Nemesis skip this?" — without it, evidence says
-- what was demonstrated but not what was put in front of the learner to demonstrate it.
alter table public.learner_evidence
  add column if not exists task_id text
    check (task_id is null or char_length(task_id) <= 200);
