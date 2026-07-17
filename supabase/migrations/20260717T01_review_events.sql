-- 20260717T01_review_events.sql
-- Phone study review (Phase 3): the phone inserts append-only flashcard grades;
-- the Mac (single writer of study state) ingests them through the same apply path
-- the desktop Study page uses, then stamps ingested_at. Server-side the rows are
-- opaque: deck_path_hash is the vault-key HMAC already used by library_documents,
-- and schedule_key is the desktop study model's own scheduling id (timestamp +
-- counter, `#c<n>` suffix for cloze slots) — content-free by construction, so no
-- course names or card text ever reach the server.
-- Parent spec: docs/design/nemesis-phone-readonly-sync-2026-07.md.

create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Which device graded; audit only (no FK — unpairing a device must not
  -- invalidate or delete grade history).
  device_id uuid,
  -- Same HMAC-SHA256 hex as library_documents.path_hash, for the deck's doc.
  -- Audit/grouping only: the apply path needs just schedule_key.
  deck_path_hash text not null check (char_length(deck_path_hash) = 64),
  -- The study model's schedule key, echoed verbatim from the encrypted deck
  -- snapshot (card id, or `<card id>#c<n>` for a cloze slot).
  schedule_key text not null check (char_length(schedule_key) between 1 and 200),
  grade text not null check (grade in ('again', 'hard', 'good', 'easy')),
  -- Phone wall-clock at grading time; orders offline batches on ingest.
  reviewed_at timestamptz not null,
  -- Generated on the phone per grade; makes offline-queue retries idempotent.
  client_event_id uuid not null,
  created_at timestamptz not null default now(),
  -- Null until the Mac applies the grade to study state.
  ingested_at timestamptz,
  unique (user_id, client_event_id)
);

-- The Mac's ingest poll: own un-ingested rows, oldest grades first.
create index review_events_pending_idx
  on public.review_events (user_id, reviewed_at)
  where ingested_at is null;

alter table public.review_events enable row level security;

create policy review_events_own on public.review_events
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.review_events from anon;
