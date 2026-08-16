-- A turn the model controller could not decide must not be counted as a turn the structured policy
-- was chosen for.
--
-- 🔴🔴 THE MODEL CONTROLLER IS NOW THE DEFAULT, WHICH CHANGES WHAT A REFUSAL COSTS. While it was a
-- default-off baseline, `teaching-strategy.ts` argued at length that a fallback would be
-- catastrophic: the LLM arm would quietly BE the Nemesis arm, both would report the same outcomes,
-- and the conclusion drawn would be "structured cognition adds nothing" when the baseline had never
-- run. That argument was about SILENCE, not about falling back. A refusal now means a learner
-- staring at a blank canvas because an upstream provider blinked, so the product needs a fallback —
-- and the danger is removed by giving it its own name instead of hiding it under an existing one.
--
-- 🔴 THE OLD CONSTRAINT IS DROPPED BY NAME RATHER THAN GUESSED AT. Postgres named it when the column
-- was added inline, so it is found from the catalog rather than assumed — an `alter table ... drop
-- constraint` against a name that does not exist takes the migration down, and a migration that
-- cannot be applied twice is a migration that cannot be applied at all.
--
-- 🔴 AND NO ROW IS REWRITTEN. Existing values stay exactly what they are: `nemesis_policy`,
-- `llm_teacher`, or null for rows that predate the strategy layer. Widening a check constraint is
-- additive by construction, so this cannot orphan anything.

do $$
declare
  v_name text;
begin
  select con.conname
    into v_name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'public'
     and rel.relname = 'learner_evidence'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%teaching_strategy%'
   limit 1;

  if v_name is not null then
    execute format('alter table public.learner_evidence drop constraint %I', v_name);
  end if;
end
$$;

alter table public.learner_evidence
  add constraint learner_evidence_teaching_strategy_check
  check (
    teaching_strategy is null
    or teaching_strategy in ('nemesis_policy', 'llm_teacher', 'nemesis_policy_fallback')
  );

comment on column public.learner_evidence.teaching_strategy is
  'Which controller chose the action this row came from. nemesis_policy and llm_teacher are ARMS a '
  'session is assigned to; nemesis_policy_fallback is what happened to ONE TURN when the assigned '
  'controller refused and the structured policy answered in its place. Comparisons must filter on '
  'the exact value: folding fallback rows into nemesis_policy would count a failure of one arm as a '
  'result for the other.';
