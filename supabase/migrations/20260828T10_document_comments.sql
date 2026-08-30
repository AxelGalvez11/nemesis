-- Comments a learner leaves ON a document — the annotate layer.
--
-- Owner, 2026-08-28: *"This is not supposed to be that [an editor]. This is supposed to be more of
-- an annotate with a comment type of edit."* And, naming the two jobs of the panel: viewing
-- sources *"so the user can point to something in source and ask a question on it"*, and
-- Nemesis-built documents the user can *"ask for edits on"*. Both jobs anchor to a spot in a
-- document, which is what a row here is.
--
-- 🔴 ONE TABLE FOR BOTH KINDS OF DOCUMENT. `doc_origin` says whether `doc_id` names a Library source
-- (`library_sources.id`) or a made output (a `CanvasOutput.id`, which lives inside the canvas
-- document rather than in a table of its own). That is why `doc_id` is text with no foreign key:
-- half its values have no table to reference, and a comment must not vanish because bookkeeping
-- for one kind changed. Deleting the underlying document orphans its comments harmlessly — they
-- are unreachable (every read is by doc_id) and they are the learner's own words, so keeping them
-- beats a cascade that guesses.
--
-- 🔴 THE ANCHOR IS FRACTIONS AND INDEXES, NEVER PIXELS. `anchor` carries {x,y} as fractions of the
-- unit's element (the contract `use-region-drag.ts` already established: it is the only shape that
-- survives zoom and resize), {box} for a drawn area, {block} for a paragraph in a flowing
-- document, {cell} for a spreadsheet. `unit` is the page/slide/sheet, 1-based, matching every
-- citation anchor in the product.

create table if not exists public.document_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- 🔴 NOT `doc_kind`, AND THE NAME IS LOAD-BEARING. `parsed_documents.doc_kind` means "which
  -- format", and `csv-kind-contract.test.ts` pins that CHECK by grepping migrations for the
  -- column name — a second `doc_kind` CHECK with different values reads to it as the format list
  -- shrinking to two. This column answers a different question (whose document: theirs or ours),
  -- so it carries a different name. Applied to prod as an in-place rename the same day.
  doc_origin text not null check (doc_origin in ('source', 'output')),
  doc_id text not null,

  -- Where on the document. See the header note; kept loose on purpose — a new
  -- anchor shape (an ink stroke, a time range on audio) must not need a migration.
  unit integer,
  anchor jsonb not null default '{}'::jsonb,

  body text not null default '',

  -- Null = open. Resolving is a state, not a deletion: the learner can reopen.
  resolved_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.document_comments is
  'Learner comments pinned to a spot in a document (a Library source or a made output). The annotate layer: never edits the document itself.';

alter table public.document_comments enable row level security;

-- 🔴 OWNER-ONLY, all four verbs. Comments are the learner's own margin notes; nothing is shared,
-- no service-role reader exists, and every query filters by auth.uid() anyway.
drop policy if exists document_comments_owner on public.document_comments;
create policy document_comments_owner on public.document_comments
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The one read this table serves: "the comments on this document", newest last. Open comments are
-- also read per-canvas for the turn packet; the partial index keeps that read off resolved rows.
create index if not exists document_comments_by_doc
  on public.document_comments (user_id, doc_origin, doc_id, created_at);
create index if not exists document_comments_open
  on public.document_comments (user_id, doc_id)
  where resolved_at is null;
