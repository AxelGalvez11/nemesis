-- "They were asked and produced nothing" becomes a value it is possible to store.
--
-- 🔴🔴 THIS CLOSES A LIVE DEFECT, NOT A GAP IN A SCHEMA. The previous migration's own comment on
-- this column says the distinction out loud:
--
--     "`not_addressed` IS THE VALUE THIS COLUMN EXISTS FOR, AND IT IS NOT `not_demonstrated`.
--      'They answered ably and never mentioned this' and 'they were asked and produced nothing
--      usable' are different facts calling for opposite teaching."
--
-- and then the check constraint listed four values, none of which was the second one. So every row
-- the live surface writes for a revealed answer, a typed "I don't know" or an echoed cue was stored
-- as `not_addressed` — "the answer never mentioned this". `projectLearnerState` deliberately drops
-- those rows when deciding a status, so the learner stayed at `unknown`, so the teaching policy took
-- its `unknown` branch and asked the same question again.
--
-- **A learner who told Nemesis they did not know was never shown the answer.** The policy branch that
-- states it (`not_demonstrated`) was unreachable from the product; every test that proved that branch
-- worked built rows with no `objective_evidence` at all, which is the legacy shape and not what the
-- surface writes.
--
-- 🔴 ADDITIVE AND BACKWARD-COMPATIBLE. Widening a check constraint accepts everything it accepted
-- before, so no existing row can become invalid and no read changes. Rows already written under the
-- old rules keep saying `not_addressed`, which is what they were recorded as — 🔴 THEY ARE NOT
-- BACKFILLED. Rewriting them would assert, on our own authority and after the fact, that a learner
-- attempted something the record cannot actually distinguish: the same row shape was produced both
-- by a genuine admission and by a multi-target answer's silence, and nothing stored can tell which.
-- Inventing that distinction retroactively is exactly the kind of claim-about-a-person this whole
-- evidence model refuses to make. New rows carry the truth; old ones keep meaning what they meant.

alter table public.learner_evidence
  drop constraint if exists learner_evidence_objective_evidence_check;

alter table public.learner_evidence
  add constraint learner_evidence_objective_evidence_check
    check (objective_evidence is null or objective_evidence in
      ('demonstrated', 'partial', 'contradicted', 'nothing_produced', 'not_addressed'));
