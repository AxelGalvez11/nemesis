-- Source indexing: the original document becomes first-class evidence.
--
-- Until now only NOTES were indexed (library_chunks.document_id references
-- readable_library_documents, NOT NULL). The stored original was never chunked or
-- embedded, so "importing a lecture makes it available to Nemesis" was true ONLY
-- because the librarian turned it into notes. That is why generation could not
-- simply be switched off: it was load-bearing for retrieval.
--
-- FOUR LAYERS, FOUR IDENTITIES, AND THE BOUNDARIES ARE THE POINT:
--
--   1 file        physical identity  = content_hash (sha256 of the bytes)
--   2 parse       canonical form     = parsed_documents.id (user, hash, parser_version)
--   3 chunks      disposable         = library_chunks (chunker_version, embedding_version)
--   4 placement   where it appears   = library_sources.id (folder, title, course)
--
-- 🔴 CHUNKS HANG OFF THE PARSE, NEVER OFF A PLACEMENT.
--
-- The first draft of this migration gave source chunks a `source_id` referencing
-- library_sources ON DELETE CASCADE. That is a data-loss bug the moment the same
-- PDF is filed in two folders: removing one placement would cascade away the
-- chunks the OTHER placement still depends on. Chunks belong to the canonical
-- parse; placements are joined to them through library_sources.parsed_document_id.
--
-- Consequences that follow from that single rule, all of them requirements:
--   * the same file in two folders = two placements, ONE parse, ONE chunk set;
--   * renaming or MOVING a placement touches no parse, no chunk, no embedding --
--     folder and title live on the placement and nowhere else;
--   * deleting one placement leaves everything else intact;
--   * the underlying parse and chunks are collectable only when NOTHING in that
--     account references them any more.
--
-- THE CHUNK TABLE IS NOT THE DOCUMENT. parsed_documents.structure holds the full
-- structured parse -- units (pages/slides/sheets/sections), headings, paragraphs,
-- lists, tables, figures, captions, cell ranges. Chunks are a retrieval
-- optimisation, meant to be discarded and rebuilt whenever chunking or embedding
-- improves. Nothing may come to treat a chunk as the canonical text of anything.
--
-- DEDUPLICATION IS ACCOUNT-SCOPED, DELIBERATELY. Identity is keyed on
-- (user_id, content_hash, parser_version). A global fingerprint table would let
-- one account learn -- directly or by timing -- that another had uploaded a
-- particular file. Storage may optimise underneath; application-visible identity
-- stays isolated.

-- ── The parse: canonical, versioned, and its own job record ──────────────────
create table if not exists public.parsed_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  content_hash text not null check (char_length(content_hash) = 64),

  doc_kind text not null check (doc_kind in ('pdf', 'pptx', 'docx', 'xlsx', 'image', 'text', 'html')),

  -- 🔴 THREE VERSIONS, THREE COLUMNS, ON PURPOSE. They evolve independently, and
  -- collapsing them into one "processing_version" would make targeted
  -- reprocessing impossible:
  --     parser  changes -> parse + chunk + embed
  --     chunker changes ->         chunk + embed
  --     embedder changes->                 embed
  -- parser_version lives HERE because it determines the canonical extraction; the
  -- other two live on the chunks, because that is what they determine.
  parser_version text not null,

  -- The structured parse: units, hierarchy, tables, figure references, cell
  -- ranges. Deliberately richer than anything the chunker emits.
  -- NOTE: a very large document's structure is TOASTed. If that ever becomes the
  -- constraint, the answer is a separate units table -- never a thinner parse.
  structure jsonb not null default '{}'::jsonb,

  -- What was read and what was NOT: units found vs read, figures kept vs
  -- unreadable, sheets, tables. A partial parse must never present as complete.
  coverage jsonb not null default '{}'::jsonb,

  unit_count integer not null default 0,
  visual_count integer not null default 0,
  table_count integer not null default 0,

  -- 🔴 OBSERVABILITY. The row is created BEFORE the work starts, so it doubles as
  -- the job record: a source can never sit in the Library looking "uploaded"
  -- while indexing failed three stages later. `failed_stage` names where, `error`
  -- says what, and both survive for inspection rather than being swallowed.
  state text not null default 'pending'
    check (state in ('pending', 'parsing', 'parsed', 'chunking', 'chunked', 'embedding', 'ready', 'failed')),
  failed_stage text check (failed_stage is null or failed_stage in ('parse', 'chunk', 'embed')),
  error text,
  attempts integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 🔴 CONCURRENCY SAFETY IS THIS INDEX, not an application check. Two simultaneous
-- uploads of the same file race to insert; one wins, the other takes the existing
-- row (`on conflict do nothing` then select). Without a database-level guarantee
-- the loser would parse and embed a second time, and both would pay.
create unique index if not exists parsed_documents_identity
  on public.parsed_documents(user_id, content_hash, parser_version);

-- "Everything parsed with parser X" -- batch reprocessing, and finding stragglers.
create index if not exists parsed_documents_parser_idx
  on public.parsed_documents(parser_version, created_at desc);
-- Work queue / failure sweep.
create index if not exists parsed_documents_state_idx
  on public.parsed_documents(state, updated_at desc) where state <> 'ready';

alter table public.parsed_documents enable row level security;

drop policy if exists parsed_documents_owner_select on public.parsed_documents;
create policy parsed_documents_owner_select
  on public.parsed_documents for select to authenticated
  using ((select auth.uid()) = user_id);

-- Writes are the indexer's (service role). A client may look at its own parse to
-- see how far ingestion got; it may not claim one was made.
revoke all on public.parsed_documents from anon, authenticated;
grant select on public.parsed_documents to authenticated;

-- ── Placement points at the ACTIVE parse, and remembers the bytes ────────────
-- 🔴 ORGANISATION IS NOT IDENTITY. folder_path, file_name and any future course
-- live here and ONLY here. Moving Lecture 8.pdf from Inbox to
-- Pharmacology/Cardiovascular rewrites one row and triggers no parsing, no
-- chunking and no embedding -- which is the whole reason placement is a separate
-- layer from the parse it points at.
alter table public.library_sources
  add column if not exists content_hash text,
  add column if not exists parsed_document_id uuid references public.parsed_documents(id) on delete set null;

create index if not exists library_sources_hash_idx
  on public.library_sources(user_id, content_hash);
-- Reverse lookup: which placements still reference this parse? This is the
-- garbage-collection question, and retrieval's route back to folder and title.
create index if not exists library_sources_parse_idx
  on public.library_sources(parsed_document_id) where deleted = false;

comment on column public.library_sources.content_hash is
  'sha256 of the original bytes, account-scoped. Two placements of one file share a parse; each keeps its own folder and title.';
comment on column public.library_sources.parsed_document_id is
  'The ACTIVE parse. Historical parses are kept and remain distinguishable; this points at the newest accepted one.';

-- ── Chunks gain typed provenance ─────────────────────────────────────────────
-- A chunk used to be implicitly "a piece of a note". It is now explicitly a piece
-- of EITHER a note or a canonical parse, and it carries where it came from as
-- STRUCTURED COLUMNS rather than as markers inside its own text: citation location
-- must be queryable, never parsed back out of prose.
alter table public.library_chunks
  add column if not exists origin_type text not null default 'note'
    check (origin_type in ('source', 'note')),

  -- 🔴 The parse, NOT a placement. See the header.
  add column if not exists parsed_document_id uuid references public.parsed_documents(id) on delete cascade,

  -- WHERE IN THE DOCUMENT. `unit_kind` normalises across formats so a page, a
  -- slide, a sheet and a section are the same shape of answer:
  --   PDF -> page   PPTX -> slide   XLSX -> sheet   DOCX/MD/HTML -> section
  -- 'document' is the honest value for a file with no meaningful subdivision --
  -- better than inventing page 1.
  add column if not exists unit_kind text
    check (unit_kind is null or unit_kind in ('page', 'slide', 'sheet', 'section', 'document')),
  add column if not exists unit_index integer,
  add column if not exists unit_label text,

  -- Spreadsheets cite a range, not a page. Text, because A1:D12, a named range
  -- and a table name are all legitimate answers.
  add column if not exists cell_range text,

  -- The heading trail down to this chunk, outermost first. This is what lets a
  -- result reconstruct placement -> document -> unit -> section -> chunk instead
  -- of being a floating block of text, and what adjacent-context expansion walks.
  add column if not exists heading_path text[],

  -- Denormalised from the parse so a reprocessing sweep can find stale chunks
  -- without a join; the parse remains the source of truth.
  add column if not exists parser_version text,
  add column if not exists chunker_version text,
  add column if not exists embedding_version text;

-- A source chunk has no note. Nullability must relax before that is expressible.
alter table public.library_chunks alter column document_id drop not null;

-- 🔴 EXACTLY ONE ORIGIN, STRUCTURALLY. Without this a row could claim both or
-- neither, and the rule that an original outranks anything derived from it would
-- depend on a model remembering it. Encoded here instead.
alter table public.library_chunks
  drop constraint if exists library_chunks_one_origin;
alter table public.library_chunks
  add constraint library_chunks_one_origin check (
    (origin_type = 'note'   and document_id is not null and parsed_document_id is null)
    or
    (origin_type = 'source' and parsed_document_id is not null and document_id is null)
  );

-- 🔴 IDEMPOTENCY AND RETRY SAFETY. One row per (parse, chunker, embedding, index).
-- Re-running the indexer after a partial failure cannot duplicate work, and a
-- chunker or embedding upgrade writes a NEW generation ALONGSIDE the old rather
-- than colliding with it -- which is what makes rebuilding the retrieval
-- representation safe while the old one keeps serving.
create unique index if not exists library_chunks_source_identity
  on public.library_chunks(parsed_document_id, chunker_version, embedding_version, chunk_index)
  where origin_type = 'source';

create index if not exists library_chunks_parse_idx
  on public.library_chunks(parsed_document_id) where origin_type = 'source';
-- "Everything chunked with Y" / "everything embedded with Z".
create index if not exists library_chunks_versions_idx
  on public.library_chunks(chunker_version, embedding_version);

comment on column public.library_chunks.origin_type is
  'source = a chunk of the canonical parse of an original file. note = a chunk of a note, student-written or generated. Both are retrievable; the original carries higher evidentiary authority, and that distinction is structural rather than remembered.';
comment on column public.library_chunks.parsed_document_id is
  'The PARSE this chunk came from. Never a placement: the same file filed twice shares one chunk set, so cascading from a placement would delete chunks another placement still needs.';
comment on column public.library_chunks.heading_path is
  'Outermost-first heading trail, so a hit can be placed in its document rather than floating.';
