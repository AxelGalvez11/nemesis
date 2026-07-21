-- Synchronous providers (Groq Whisper) finish inside the submit request,
-- before the phone's first status poll. The finished text parks here until
-- the status route hands it to the client, which clears it — the durable
-- home for a transcript is the recording artifact, not this queue table.
alter table public.transcription_jobs
  add column if not exists transcript text;
