-- Preserve WHICH KIND of failure the evaluator diagnosed, alongside the verdict it already stores.
--
-- The judge has produced this since it was written: `careless` for a right method executed wrongly,
-- `conceptual` for the wrong method entirely, `missing_prerequisite` for a gap further back. It
-- reached the feedback on screen and the telemetry ring buffer, and then died with the render — so
-- two learners who need opposite next moves have been indistinguishable in the durable record.
--
-- ADDITIVE AND REVERSIBLE. Nothing backfills: every row written before today reads back as "no kind
-- was named", which is exactly what was true of them.

alter table public.learner_evidence
  add column if not exists error_type text;

-- 🔴 DELIBERATELY NO CHECK CONSTRAINT, UNLIKE `response_modality` NEXT DOOR, AND THE ASYMMETRY IS
-- THE POINT. `recordEvidence` treats a failed insert as a warning and returns false, so a value the
-- constraint did not know would not be dropped on its own — it would discard the WHOLE
-- demonstration, silently, including the verdict and the response text. Modality is three values
-- fixed by physics; a diagnostic taxonomy is expected to grow, so the one that can grow is the one
-- that must not be able to fail a write. `evidenceFromRow` validates on the way out instead, where
-- an unrecognised value costs one field rather than the whole row.

comment on column public.learner_evidence.error_type is
  'Which kind of failure the evaluator established (recall_failure, conceptual, procedural, vocabulary, careless, missing_prerequisite). Null means no kind was named — never inferred from the verdict, never backfilled. Validated on read, not by a constraint, so an unknown value cannot fail the insert.';
