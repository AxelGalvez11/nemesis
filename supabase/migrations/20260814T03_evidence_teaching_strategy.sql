-- Which teaching controller produced the opportunity this row came out of.
--
-- 🔴 THE EXPERIMENT IS UNANSWERABLE WITHOUT THIS COLUMN, AND NO OTHER COLUMN CAN STAND IN FOR IT.
-- Two strategies now decide what a learner is asked next — the structured Nemesis policy and a model
-- given an adaptive-teaching objective — and every metric that compares them (time to demonstrated
-- mastery, repeated errors, questions asked on already-established material) is a grouping over
-- exactly this field. Derive it after the fact and you cannot: `canvas_id` is not an arm,
-- `evaluator_version` is identical by design because the evaluator is the part held constant, and
-- `occurred_at` cannot separate two arms that ran on the same day. An A/B result computed from rows
-- that do not say which arm they came from is a number with no experiment behind it.
--
-- 🔴 A PROPERTY OF THE OPPORTUNITY, NOT OF THE LEARNER AND NOT OF THE ANSWER. It records which
-- controller chose to put this question in front of this person at this moment. It says nothing
-- about whether they knew it, how well they answered, or what they are like — so it sits with the
-- other observations (`operation`, `scaffold_rung`, `scaffolding_level`) rather than anywhere near
-- `verdict`. Nothing may ever read it back as a fact about the person.
--
-- 🔴 NULLABLE AND NOT DEFAULTED, for the reason every observation migration on this table gives.
-- Rows written before this ran came from a runtime with exactly one controller and no concept of an
-- arm. Defaulting them to 'nemesis_policy' would look harmless and would be a fabrication: it would
-- enrol every historical row into the control group of an experiment that did not exist when they
-- were written, and a comparison would then read months of pre-experiment behaviour as one arm's
-- result. **Absent means the row predates the strategy layer. It never means an arm.** Every metric
-- in `strategy-outcomes.ts` therefore excludes rows with no strategy rather than assuming one, and
-- there is deliberately no backfill.
--
-- 🔴 A CHECK CONSTRAINT RATHER THAN FREE TEXT, AND IT MUST BE WIDENED BEFORE A THIRD ARM SHIPS.
-- The constraint is the enforcement that an arm name is one of the arms — a typo in the writer would
-- otherwise become a third silent cohort that every grouping reports separately and nobody notices.
-- The repo rule is that the constraint is widened in its own migration BEFORE the code that writes
-- the new value, never implicitly by a workflow. See `20260814T01_evidence_nothing_produced.sql` for
-- what happens when the constraint and the code's intent disagree: the value the column existed for
-- could not be stored, and a learner who said "I don't know" was never shown the answer.

alter table public.learner_evidence
  -- Which teaching controller chose this opportunity. Fixed for the session that produced it.
  --
  --   nemesis_policy — the structured cognition path: knowledge objects, projected learner state,
  --                    prerequisites, scaffolding, spacing, action ranking, misconception repair.
  --   llm_teacher    — the same model family, given a strong adaptive-teaching objective and left
  --                    to choose the next action itself. The baseline the structured path is being
  --                    measured against.
  add column if not exists teaching_strategy text
    check (teaching_strategy is null or teaching_strategy in ('nemesis_policy', 'llm_teacher'));

-- 🔴 THE INDEX IS FOR THE COMPARISON, NOT FOR THE RUNTIME. Nothing in the teaching loop filters on
-- this column — the runtime reads a learner's evidence by objective and always wants both arms, so
-- an index would be dead weight on the hot path. The comparison does the opposite: it sweeps one
-- user's rows grouped by arm, over a range of time. Partial on `not null` so the historical rows,
-- which are the majority and are excluded from every metric anyway, cost nothing to carry.
create index if not exists learner_evidence_strategy_idx
  on public.learner_evidence (user_id, teaching_strategy, occurred_at)
  where teaching_strategy is not null;
