-- Source indexing: the original document becomes first-class evidence.
--
-- Until now only NOTES were indexed (library_chunks.document_id references
-- readable_library_documents, NOT NULL). The stored original was never chunked or
-- embedded, so "importing a lecture makes it available to Nemesis" was true ONLY
-- because the librarian turned it into notes. That is why generation could not
-- simply be switched off: it was load-bearing for retrieval.
--
-- THREE LAYERS, THREE IDENTITIES. The owner's requirement, and the thing this
-- migration exists to encode:
--
--   original file        physical identity   = content_hash (sha256 of the bytes)
--        |
--        v
--   structured parse     parse identity      = parsed_documents.id
--        |                                     (content_hash, parser_version)
--        v
--   retrieval chunks     disposable          = library_chunks rows
--                                              (chunker_version, embedding_version)
--
-- and, running alongside rather than beneath:
--
--   library placement    attachment identity = library_sources.id
--
-- The same PDF filed into two folders is TWO library_sources rows, ONE parse, ONE
-- set of chunks. Each placement keeps its own folder, course and title; the bytes
-- and the expensive parse are paid for once. Deduplication is deliberately WITHIN
-- a user: a global hash table would let one account learn that another had
-- uploaded a particular file.
--
-- THE CHUNK TABLE IS NOT THE DOCUMENT. parsed_documents.structure holds the full
-- structured parse -- pages/slides/sheets, headings, paragraphs, lists, tables,
-- figures, captions, cells. Chunks are a retrieval optimisation and are meant to
-- be thrown away and rebuilt whenever chunking or embedding improves. Nothing may
-- come to depend on a chunk as the canonical text of anything.

-- ── The parse ────────────────────────────────────────────────────────────────
create table if not exists public.parsed_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Physical identity: sha256 of the ORIGINAL bytes, lowercase hex. Two
  -- library_sources rows holding the same file share one parse.
  content_hash text not null check (char_length(content_hash) = 64),

  -- What the file is, as the parser decided (magic bytes beat the extension).
  doc_kind text not null check (doc_kind in ('pdf', 'pptx', 'docx', 'xlsx', 'image', 'text')),

  -- 🔴 THREE VERSIONS, THREE COLUMNS, ON PURPOSE. They evolve independently and
  -- collapsing them into one "index version" would make targeted reprocessing
  -- impossible. Re-parse when extraction improves; re-chunk without re-parsing;
  -- re-embed with a better model without doing either.
  parser_version text not null,

  -- The structured parse. Pages/slides/sheets, hierarchy, tables, figure
  -- references, cell ranges. Deliberately richer than anything the chunker emits.
  -- NOTE: a very large document's structure is TOASTed; if that becomes a
  -- problem the answer is a units table, not a thinner parse.
  structure jsonb not null default '{}'::jsonb,

  -- What was read and what was NOT -- pages found vs read, figures kept vs
  -- unreadable, sheets, tables. A partial parse must never present as complete.
  coverage jsonb not null default '{}'::jsonb,

  -- Cheap top-level counts so a caller can judge a parse without loading it.
  unit_count integer not null default 0,
  visual_count integer not null default 0,
  table_count integer not null default 0,

  created_at timestamptz not null default now()
);

-- Idempotency. Re-importing an unchanged file finds this row instead of paying
-- to parse and embed again; a NEW parser_version deliberately produces a NEW row,
-- which is what makes "reprocess everything parsed by version X" answerable.
create unique index if not exists parsed_documents_identity
  on public.parsed_documents(user_id, content_hash, parser_version);

create index if not exists parsed_documents_reprocess_idx
  on public.parsed_documents(parser_version, created_at desc);

alter table public.parsed_documents enable row level security;

drop policy if exists parsed_documents_owner_select on public.parsed_documents;
create policy parsed_documents_owner_select
  on public.parsed_documents for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.parsed_documents from anon, authenticated;
grant select on public.parsed_documents to authenticated;

-- ── Placement points at the parse, and remembers the bytes ───────────────────
alter table public.library_sources
  add column if not exists content_hash text,
  add column if not exists parsed_document_id uuid references public.parsed_documents(id) on delete set null;

create index if not exists library_sources_hash_idx
  on public.library_sources(user_id, content_hash);

comment on column public.library_sources.content_hash is
  'sha256 of the original bytes. Two placements of the same file share a parse; each keeps its own folder and title.';

-- ── Chunks gain typed provenance ─────────────────────────────────────────────
-- A chunk used to be implicitly "a piece of a note". It is now explicitly a piece
-- of EITHER a note or an original source, and it carries where it came from as
-- STRUCTURED COLUMNS rather than as markers inside its own text. Citation location
-- must be queryable, not parsed back out of prose.

alter table public.library_chunks
  add column if not exists origin_type text not null default 'note'
    check (origin_type in ('source', 'note')),
  add column if not exists source_id uuid references public.library_sources(id) on delete cascade,
  add column if not exists parsed_document_id uuid references public.parsed_documents(id) on delete cascade,

  -- WHERE IN THE DOCUMENT. `unit_kind` says how to read `unit_index`/`unit_label`,
  -- so a page, a slide and a spreadsheet sheet are the same shape of answer.
  -- 'document' is the honest value for a file with no meaningful subdivision --
  -- better than inventing page 1.
  add column if not exists unit_kind text
    check (unit_kind is null or unit_kind in ('page', 'slide', 'sheet', 'section', 'document')),
  add column if not exists unit_index integer,
  add column if not exists unit_label text,

  -- Spreadsheets cite a range, not a page. Kept generic (text) because A1:D12,
  -- a named range and a table name are all legitimate answers.
  add column if not exists cell_range text,

  -- The heading trail down to this chunk, outermost first. This is what lets a
  -- result reconstruct Document -> page/slide/sheet -> section -> chunk instead of
  -- being a floating block of text, and what adjacent-context expansion will walk.
  add column if not exists heading_path text[],

  -- Versions, again separate. parser_version is denormalised from the parse so a
  -- sweep can find stale chunks without joining.
  add column if not exists parser_version text,
  add column if not exists chunker_version text,
  add column if not exists embedding_version text;

-- A source chunk has no note. Nullability has to relax before that is expressible.
alter table public.library_chunks alter column document_id drop not null;

-- 🔴 EXACTLY ONE ORIGIN. Without this a row can claim to be both, or neither, and
-- retrieval ranking (which must prefer the original over anything derived from it)
-- would have nothing trustworthy to rank on.
alter table public.library_chunks
  drop constraint if exists library_chunks_one_origin;
alter table public.library_chunks
  add constraint library_chunks_one_origin check (
    (origin_type = 'note'   and document_id is not null and source_id is null)
    or
    (origin_type = 'source' and source_id  is not null and document_id is null)
  );

-- Idempotency for source chunks: one row per (parse, chunker, embedding, index).
-- Re-running the indexer cannot duplicate embeddings, and a chunker or embedding
-- upgrade writes a NEW generation alongside the old rather than colliding with it.
create unique index if not exists library_chunks_source_identity
  on public.library_chunks(parsed_document_id, chunker_version, embedding_version, chunk_index)
  where origin_type = 'source';

create index if not exists library_chunks_source_idx
  on public.library_chunks(user_id, source_id) where origin_type = 'source';

-- "Re-embed everything produced by chunker X / embedding model Y."
create index if not exists library_chunks_versions_idx
  on public.library_chunks(embedding_version, chunker_version);

comment on column public.library_chunks.origin_type is
  'source = a chunk of the original file (canonical evidence). note = a chunk of a note, user-written or generated. Retrieval may use both; the original carries higher evidentiary authority.';
comment on column public.library_chunks.heading_path is
  'Outermost-first heading trail, so a hit can be placed in the document rather than floating.';
