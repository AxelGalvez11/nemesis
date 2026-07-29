-- Why each transcription provider did or did not answer.
--
-- The provider ladder in nemesis-transcribe (xAI -> Groq -> AssemblyAI) falls
-- through silently on purpose: an outage at the cheap provider must not fail a
-- student's recording. The cost of that design is that a provider which NEVER
-- answers is indistinguishable from one that was never reached.
--
-- Observed 2026-07-28: xAI went live at 20:35 UTC, a real recording ran through
-- the new function version at 21:02, and the row still read provider='assemblyai'
-- with nothing anywhere saying whether the key was missing or the call had
-- failed. `console.warn` does not reach the log endpoint, and `error` is only
-- written when the whole job dies — a successful fallback writes nothing at all.
-- At $0.17/hr against $0.10/hr that silence is the difference between a 29% and
-- a 55% margin on Pro, invisible until an invoice arrives.
--
-- Nullable and free-text on purpose: this is a breadcrumb trail for a human, not
-- a schema anyone should branch on. `provider` remains the answer to "who
-- transcribed this"; this column answers "and what happened to the others".
alter table public.transcription_jobs
  add column if not exists provider_notes text;

comment on column public.transcription_jobs.provider_notes is
  'Attempt trail through the provider ladder, e.g. "xai: HTTP 404 — model not found | assemblyai: submitted". Written by nemesis-transcribe; diagnostic only.';
