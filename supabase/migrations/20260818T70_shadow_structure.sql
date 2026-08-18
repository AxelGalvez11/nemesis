-- 20260818T70 — record whether the cheap route got the SHAPE right, not just the amount.
--
-- 🔴🔴 THE COMPARATOR COULD NOT SEE ITS TWO WORST CASES. `judgeShadow` compares counts — tables,
-- figures, equations, characters — so a table whose values all landed one column to the left, and a
-- two-column page read across the gutter, both came out with identical numbers on both sides and
-- were recorded as `safe`. Every count preserved, every relationship destroyed.
--
-- `parse-fidelity.ts` measures the shape directly, and this column stores what it measured.
--
-- 🔴 THE COLUMN HOLDS MEASUREMENTS, INCLUDING ONES THAT DECIDE NOTHING. Passage-order agreement is
-- recorded on every row and classifies nothing, because there is no defensible cut point for it
-- yet: some disagreement is genuinely two parsers splitting sentences differently. Storing it now
-- is what makes it possible to set that threshold LATER from the distribution, instead of inventing
-- one today and then measuring against our own guess.
--
-- ADDITIVE AND REVERSIBLE: a nullable-by-default jsonb column with an empty default. Rows written
-- before this keep working and read as `{}` — an absence of measurement, which is the truth.

alter table public.parse_shadow_evals
  add column if not exists structure jsonb not null default '{}'::jsonb;

comment on column public.parse_shadow_evals.structure is
  'Structural comparison of the two parses: column interleave, table value-vs-position agreement, passage-order agreement. Some fields are recorded without being classified.';
