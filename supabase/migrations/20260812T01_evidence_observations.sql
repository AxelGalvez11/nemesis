-- Track B1: keep the observations a demonstration already produces.
--
-- 🔴 OBSERVATIONS ONLY. Every column here records something that was MEASURED about one
-- demonstration. None of them records what it means. There is deliberately no `fluency`, no
-- `mastery`, no `automaticity` and no bucketed latency: the moment a threshold is baked into what
-- is stored, the judgement becomes unreviewable — every row written under the old rule quietly
-- means something different from every row written under the new one, and no migration can recover
-- what was actually seen. Store 14200. Decide what it means where changing your mind is free.
--
-- 🔴 ALL NULLABLE, AND NONE OF THEM DEFAULTED. Rows written before this migration were produced by
-- a runtime that did not observe these things, and `null` is the only honest way to say so. A
-- default would retroactively claim something about every demonstration that came before it, and
-- that claim would be false — a 0 latency the learner never took, an operation nobody demanded.
-- Absent means NOT OBSERVED. It never means zero.
--
-- Verified against the deployed policy, not only in unit tests:
--   typed answer, 14.2 s        response_latency_ms = 14200, operation = 'recall', scaffolding 0
--   typed "I don't know"        the same observations, demonstration_obtained = false, verdict null
--   revealed with no typing     latency null - nothing was measured, so nothing is claimed
--   rows from before this ran   all three columns null, and still readable

alter table public.learner_evidence
  -- Which cognitive operation the learner was asked to perform. `recall` is the only one anything
  -- mints today; the column exists so that the day `explain` ships, the demonstrations that came
  -- before it do not silently look like explanations.
  add column if not exists operation text
    check (operation is null or char_length(operation) <= 40);

alter table public.learner_evidence
  -- Milliseconds from the prompt appearing to the answer being submitted, as measured.
  -- 🔴 RAW. Never a band, never a verdict. Interpretation belongs to the projection, which can be
  -- rewritten; this column cannot be, because it is the only record of what actually happened.
  add column if not exists response_latency_ms integer
    check (response_latency_ms is null or response_latency_ms >= 0);

alter table public.learner_evidence
  -- How much assistance was available DURING the attempt. 0 means the prompt and nothing else.
  -- 🔴 STRUCTURAL, NOT A JUDGEMENT ABOUT THE LEARNER. It counts what the runtime offered, not
  -- whether someone needed it. Only one state exists today — associative retrieval is unsupported —
  -- and 0 is recorded rather than left null because it IS observed: no assist was on offer. Higher
  -- values wait until the runtime can actually distinguish them.
  add column if not exists scaffolding_level smallint
    check (scaffolding_level is null or scaffolding_level >= 0);
