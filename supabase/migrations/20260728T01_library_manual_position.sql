-- Hand-arranged library order (owner 2026-07-28: "the library notion like
-- functionality").
--
-- The library could only be sorted by title or date, so dragging a note up or
-- down had nowhere to be recorded and would have snapped back on the next load.
-- This is where that arrangement lives.
--
-- NULLABLE ON PURPOSE, with no default and no backfill. Every note that already
-- exists — and every note the web app, chat, or the recorder creates from here
-- on — simply has no position, and the client sorts those LAST, in title order
-- (apps/mobile/src/lib/library-order.ts, compareManual). Backfilling would mean
-- inventing an arrangement the student never chose and then showing it to them
-- as if they had.
--
-- The value is a FRACTIONAL index, not a rank: dropping a note between two
-- others stores the midpoint of their positions, so a reorder is a single-row
-- UPDATE rather than renumbering the folder. double precision is what makes
-- that halving possible; an integer column would force the N-row rewrite this
-- design exists to avoid.
--
-- POSITIONS ARE ONLY COMPARABLE WITHIN ONE FOLDER. The tree groups by folder
-- before sorting, so two notes in different folders may hold the same number.
--
-- Additive and nullable: existing rows are untouched, every existing query
-- keeps working, and RLS is unchanged (the table's existing per-user policies
-- already cover this column).

alter table public.readable_library_documents
  add column if not exists position double precision;

comment on column public.readable_library_documents.position is
  'Hand-arranged order within the note''s folder. Fractional index — a drop stores the midpoint of its neighbours, so a reorder writes one row. NULL = never dragged, and sorts last in title order. Not comparable across folders.';

-- Sorting happens per folder, and a folder is the leading path segment, so the
-- useful index is per-user + position. Partial: the NULL rows are the majority
-- and are never ordered by this column.
create index if not exists readable_library_documents_user_position_idx
  on public.readable_library_documents (user_id, position)
  where position is not null and deleted = false;
