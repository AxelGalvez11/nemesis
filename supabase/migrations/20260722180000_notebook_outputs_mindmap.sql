-- Notebooks can generate a fourth deliverable (owner ask 2026-07-22): Mindmap,
-- alongside Flashcards / Test / Slides. The kind column is a plain check
-- constraint, so the new value has to be allowed before the Create button can
-- insert anything — without this migration the button fails at runtime with a
-- 23514 check violation.
--
-- Note this is notebook_outputs (markdown deliverables attached to a notebook),
-- NOT study_artifacts (the Study page's Mindmaps tab, which stores a parsed
-- outline object). They are separate tables on purpose.

alter table public.notebook_outputs
  drop constraint if exists notebook_outputs_kind_check;

alter table public.notebook_outputs
  add constraint notebook_outputs_kind_check
  check (kind in ('flashcards', 'test', 'slides', 'mindmap'));
