-- Side-by-side transcript comparison, so "is xAI worse than AssemblyAI" can be
-- answered with two transcripts of THE SAME AUDIO instead of an impression.
--
-- WHY NEW COLUMNS RATHER THAN REUSING `transcript`: that column is load-bearing
-- on the SYNCHRONOUS path. handleStatus checks `job.transcript` being non-empty
-- BEFORE it looks at `status`, and treats a value there as "a sync provider
-- parked this — serve it once and clear it". Writing AssemblyAI's asynchronous
-- transcript into it would fire that branch on an async job: the student would
-- be handed a transcript before the AssemblyAI poll had finished, and the meter
-- settlement in the completed-branch would never run. These columns stay out of
-- that logic entirely.
--
-- RETENTION IS DELIBERATELY NARROW. Everywhere else in this lane a transcript is
-- handed over once and erased, because the recording artifact is its durable home
-- and lecture text is the student's, not ours. These columns are written ONLY for
-- user ids listed in the COMPARE_TRANSCRIPT_UIDS function secret — in practice the
-- owner's own account, comparing the owner's own recordings. For every other
-- student the behaviour of this table is byte-for-byte what it was before.
alter table public.transcription_jobs
  add column if not exists transcript_primary text,
  add column if not exists transcript_alt text,
  add column if not exists provider_alt text;

comment on column public.transcription_jobs.transcript_primary is
  'Comparison only. Transcript from the provider that SERVED the student. Written solely for uids in COMPARE_TRANSCRIPT_UIDS; null for everyone else.';
comment on column public.transcription_jobs.transcript_alt is
  'Comparison only. Transcript from the SHADOW provider run over the same audio. Never served to a student, never billed to their meter.';
comment on column public.transcription_jobs.provider_alt is
  'Which provider produced transcript_alt, or why it could not.';

-- No RLS change is needed or wanted: transcription_jobs is reached only through
-- the service role inside nemesis-transcribe, and adding a read path for these
-- columns would be handing lecture text back out over the API — the opposite of
-- the point.
