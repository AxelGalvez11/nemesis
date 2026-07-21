-- Batch C: tests and mindmaps stop being title-only shells. `content` holds
-- the typed payload — {questions:[{q,options,answer,why}],attempts:[…]} for
-- tests (desktop extras.ts parity) and {outline:"…markdown…"} for mindmaps —
-- written by the client's generation pass and by test attempts.
alter table public.study_artifacts
  add column if not exists content jsonb;
