-- §33: scaffolding is part of the evidence.
--
-- 🔴 THE OWNER'S CASE: "If two learners eventually say 'active site,' but one produced it
-- independently while another required three cues, those responses are not equivalent evidence."
-- Until now nothing on this table could tell those two rows apart, so a recognition tap and an
-- unaided explanation were the same demonstration — which is exactly how "recognised HTN" becomes
-- "knows HTN" and the learner is skipped past it under §22 scheduling.
--
-- 🔴 TEXT, NOT A NUMBER, AND `scaffolding_level` IS NOT REUSED FOR IT. That column counts how much
-- assistance was AVAILABLE (0 = the prompt alone) and stays exactly as it is. This one records WHICH
-- KIND OF TASK was set. They are different questions: a learner shown five options was not given
-- four units of help, they were asked a question answerable by discriminating rather than by
-- producing. Storing a rung as an ordinal would invite arithmetic on a scale where the distance
-- between rungs means nothing, and would lose the name that makes a row reviewable.
--
-- 🔴 BOTH NULLABLE AND NEITHER DEFAULTED, for the reason the observations migration already gives:
-- rows written before this ran were produced by a runtime that did not record these, and null is the
-- only honest way to say so. Defaulting `scaffold_rung` to 'independent' would credit every old row
-- with unaided production; defaulting to 'taught' would erase demonstrations that really happened.
-- Absent means NOT RECORDED. It never means a rung.

alter table public.learner_evidence
  -- At what cognitive demand the response was produced. A property of the TASK, known before the
  -- learner answers, so no later change of mind about what a rung means can invalidate a stored row.
  -- Ordered, weakest first: taught < recognition < cued < narrowed < independent.
  add column if not exists scaffold_rung text
    check (scaffold_rung is null or scaffold_rung in
      ('taught', 'recognition', 'cued', 'narrowed', 'independent'));

alter table public.learner_evidence
  -- What this response said about THIS objective, when one answer was put to several at once.
  --
  -- 🔴 `not_addressed` IS THE VALUE THIS COLUMN EXISTS FOR, AND IT IS NOT `not_demonstrated`.
  -- "They answered ably and never mentioned this" and "they were asked and produced nothing usable"
  -- are different facts calling for opposite teaching — the second wants scaffolding, the first
  -- wants asking. `demonstration_obtained` alone cannot tell them apart, because it is false for
  -- both.
  add column if not exists objective_evidence text
    check (objective_evidence is null or objective_evidence in
      ('demonstrated', 'partial', 'contradicted', 'not_addressed'));
