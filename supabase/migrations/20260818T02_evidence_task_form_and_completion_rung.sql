-- Two additive changes' worth of honesty about WHAT was asked, not just how much help came with it.
--
-- 🔴 WHY THE RUNG CONSTRAINT HAS TO MOVE FIRST. `scaffold_rung`'s check constraint enumerates the
-- ladder, and the ladder has gained a rung between `recognition` and `cued`: `completion`, the rung
-- a faded worked example is answered at. Without this line the runtime can build a completion task,
-- put it on screen, judge it correctly — and then have the insert rejected. `recordEvidence` treats
-- a failed insert as a warning and returns false, so what the learner would lose is not one field
-- but the WHOLE demonstration: the verdict, the response text, the latency, all of it. This
-- migration is therefore a prerequisite for the completion lane, not a tidy-up after it.
--
-- 🔴 WHY `completion` SITS WHERE IT SITS. Above `recognition` because the learner PRODUCED the
-- missing piece rather than picking it; below `cued` because a partly worked solution supplies more
-- of the surrounding structure than a first letter supplies of a word. Where the two are genuinely
-- hard to rank, the ladder's standing asymmetry decides: under-crediting costs one more question,
-- over-crediting skips a learner past something they cannot do.
--
-- 🔴 WHY `task_form` IS A SEPARATE COLUMN AND NOT ANOTHER RUNG. The rung is an ORDERED axis — how
-- much of this task's answer was on screen. WHICH KIND of task was set is a different question, and
-- a form added later may carry no assistance at all while still being a different task; folding the
-- two into one ordered column would make every such form a claim about assistance it never gave.
-- Two columns, each saying one true thing.
--
-- 🔴 AND `task_form` DELIBERATELY HAS NO CHECK CONSTRAINT, for the reason the `error_type` migration
-- gives next door: a taxonomy of task kinds is expected to grow, and a value the database did not
-- recognise would discard the whole row rather than one field. `evidenceFromRow` validates it on the
-- way out instead, where an unknown value costs exactly the field it is in.
--
-- ADDITIVE AND REVERSIBLE. Nothing backfills. Every row written before today reads back as "no form
-- was recorded", which is exactly what was true of them — not "it was the ordinary question", even
-- though that is what the runtime was staging, because nothing observed it.

do $$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'learner_evidence'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%scaffold_rung%';
  if v_name is not null then
    execute format('alter table public.learner_evidence drop constraint %I', v_name);
  end if;
end $$;

alter table public.learner_evidence
  add constraint learner_evidence_scaffold_rung_check
    check (scaffold_rung is null or scaffold_rung in
      ('taught', 'recognition', 'completion', 'cued', 'narrowed', 'independent'));

alter table public.learner_evidence
  add column if not exists task_form text;

comment on column public.learner_evidence.task_form is
  'Which kind of task the response was produced against: direct (the material''s own question) or completion (part of a valid solution on screen, one piece withheld). Null means no form was recorded — never inferred, never backfilled. Deliberately unconstrained: the set is expected to grow, and validating on read rather than by a constraint means an unrecognised value costs one field instead of the whole demonstration.';

comment on column public.learner_evidence.scaffold_rung is
  'At what cognitive demand the response was produced. Ordered, weakest first: taught < recognition < completion < cued < narrowed < independent. A property of the task, known before the learner answers. Null means not recorded and never means a rung.';
