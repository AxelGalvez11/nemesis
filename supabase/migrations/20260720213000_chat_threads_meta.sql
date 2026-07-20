-- Session-level artifacts (PR #194's recording outputs: transcript, notes,
-- duration) ride the thread row as meta.outputs so they sync across devices.
-- Size-capped generously (lecture transcripts are long); an oversized write
-- fails the upsert and the client keeps the artifact local-only instead.

alter table public.chat_threads
  add column if not exists meta jsonb
  check (meta is null or pg_column_size(meta) <= 524288);
