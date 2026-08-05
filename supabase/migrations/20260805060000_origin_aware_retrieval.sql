-- Origin-aware retrieval: note search, source search, and an opt-in combined view.
--
-- WHY THIS EXISTS. `library_chunks` now holds two kinds of row — a piece of a
-- NOTE and a piece of the canonical PARSE of an original file — and until this
-- migration the only search function in the product had no idea the second kind
-- could exist. It selected `c.path, c.title, ...` and a source chunk's `path` is
-- the empty string, because a parse has no place in the note tree (where a file
-- APPEARS is its placement's business, and a file can be filed twice).
--
-- 🔴 A CORRECTION TO THE RECORD, KEPT HERE BECAUSE IT CHANGES WHAT THIS FILE IS
-- FOR. I reported that the first embedded source chunk would surface inside note
-- search with an empty path. It would NOT have. The live function joins
--
--     join public.readable_library_documents d on d.id = c.document_id
--
-- and `library_chunks_one_origin` forces a source chunk's `document_id` to be
-- NULL, so that inner join can never match one. Source chunks were already
-- excluded. But they were excluded INCIDENTALLY — that join arrived in
-- 20260724T01 to stop a DELETED NOTE being quoted, and it has been doing a
-- second, unrelated job by accident ever since. Anyone rewriting the RPC to drop
-- the join (say, to denormalise `deleted` onto the chunk) would silently reopen
-- the leak, and nothing would have told them. So the filter becomes DECLARED:
--
--     and c.origin_type = 'note'
--
-- The predicate is redundant against today's join and load-bearing against
-- tomorrow's edit. That is the point of writing it down.
--
-- THE SHAPE, and the rule behind it: A CALLER GETS SOURCES ONLY BY ASKING.
--
--   match_library_chunks   notes only     unchanged signature, unchanged output
--   match_source_chunks    sources only   full measured provenance + placements
--   match_library_all      both           a separate name = an explicit opt-in
--
-- There is deliberately no `include_sources boolean default false` parameter on
-- the note function. A default is a thing that gets flipped; a separate function
-- is a thing a caller had to type.
--
-- DEPLOY: owner-gated — against ref qyjmivntajbigjswhahb.

-- `hnsw.*` is only a RECOGNISED parameter once pgvector's library is loaded into
-- the session (see 20260725T01). One vector operation loads it; without this the
-- CREATEs below fail with "permission denied to set parameter", which looks like
-- a grant problem and is not one.
select '[1,0]'::extensions.vector <=> '[0,1]'::extensions.vector;

-- ── 1. Note search: same signature, same rows, now by declaration ────────────
-- Byte-identical output to the function it replaces. The regression test asserts
-- that against a real database with source chunks present.
create or replace function public.match_library_chunks(
  query_embedding extensions.vector(1024),
  match_count int default 8,
  match_threshold float default 0.35
)
returns table (
  path text,
  title text,
  chunk_index int,
  content text,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
set hnsw.ef_search = 100
set hnsw.iterative_scan = 'strict_order'
as $$
  select
    c.path,
    c.title,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.library_chunks c
  join public.readable_library_documents d on d.id = c.document_id
  where c.embedding is not null
    -- DECLARED, not inherited from the join above. See the header.
    and c.origin_type = 'note'
    and d.deleted = false
    and (1 - (c.embedding <=> query_embedding)) > match_threshold
  order by c.embedding <=> query_embedding asc
  limit match_count;
$$;

comment on function public.match_library_chunks is
  'ANN over the caller''s own NOTE chunks (origin_type = ''note''), excluding deleted notes. Source chunks are excluded BY DECLARATION, not by the document join. For originals use match_source_chunks; for both use match_library_all.';

revoke execute on function public.match_library_chunks(extensions.vector(1024), int, float) from public, anon;
grant execute on function public.match_library_chunks(extensions.vector(1024), int, float) to authenticated, service_role;

-- ── 2. Note search must not slow down as originals arrive ────────────────────
-- `library_chunks_vec_idx` covers EVERY embedding. With `iterative_scan =
-- strict_order` a filtered query cannot come back short, but it pays for that by
-- scanning deeper until it has `match_count` rows that pass the filter. Once one
-- 300-page PDF outnumbers an account's notes by three orders of magnitude, a
-- note-only query would walk past thousands of source vectors to find eight note
-- ones. A partial index means it never sees them.
--
-- ONE partial index, not two. Sources get the full index: they will dominate the
-- table, so the filter is barely selective in that direction and a second HNSW
-- index would triple the write cost of embedding a large document for no gain.
create index if not exists library_chunks_vec_note_idx
  on public.library_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where origin_type = 'note';

comment on index public.library_chunks_vec_note_idx is
  'Note-only ANN index. Keeps note search independent of how many original documents an account has indexed.';

-- ── 3. Source search: measured provenance, and every place the file is filed ──
--
-- 🔴 THERE IS NO SUCH THING AS *THE* FILE ROW. One parse can be referenced by
-- several placements — the same PDF filed in two folders is two `library_sources`
-- rows sharing one parse — so returning "the" source id would mean picking one
-- arbitrarily and presenting a choice as a fact. Identity is the PARSE
-- (`parsed_document_id`) plus the physical bytes (`content_hash`); the placements
-- come back as a list, which is honest whether it holds nought, one or five.
--
-- 🔴 A CHUNK WHOSE LAST LIVE PLACEMENT IS GONE IS NOT RETRIEVABLE. This is the
-- source-side analogue of `d.deleted = false`: a student who deleted a file from
-- their Library must not have it quoted back at them, even though the parse and
-- its chunks legitimately survive the delete (see 20260805050000 — cleanup is a
-- deliberate sweep, never a cascade). Deleting a placement therefore makes the
-- material unfindable IMMEDIATELY and destroys nothing; undeleting restores it.
create or replace function public.match_source_chunks(
  query_embedding extensions.vector(1024),
  match_count int default 8,
  match_threshold float default 0.35
)
returns table (
  chunk_id uuid,
  parsed_document_id uuid,
  content_hash text,
  doc_kind text,
  title text,
  chunk_index int,
  content text,
  unit_kind text,
  unit_index int,
  unit_label text,
  cell_range text,
  heading_path text[],
  parser_version text,
  chunker_version text,
  embedding_version text,
  placements jsonb,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
set hnsw.ef_search = 100
set hnsw.iterative_scan = 'strict_order'
as $$
  select
    c.id,
    c.parsed_document_id,
    p.content_hash,
    p.doc_kind,
    c.title,
    c.chunk_index,
    c.content,
    c.unit_kind,
    c.unit_index,
    c.unit_label,
    c.cell_range,
    c.heading_path,
    c.parser_version,
    c.chunker_version,
    c.embedding_version,
    -- Zero-or-more, newest first. `coalesce` so the column is `[]` rather than
    -- null when a placement disappears between the EXISTS below and this
    -- aggregate — a consumer should never have to null-check a list.
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'id', s.id,
                   'folder_path', s.folder_path,
                   'file_name', s.file_name,
                   'mime_type', s.mime_type
                 )
                 order by s.created_at desc
               )
        from public.library_sources s
        where s.parsed_document_id = c.parsed_document_id
          and s.deleted = false
      ),
      '[]'::jsonb
    ) as placements,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.library_chunks c
  join public.parsed_documents p on p.id = c.parsed_document_id
  where c.embedding is not null
    and c.origin_type = 'source'
    and (1 - (c.embedding <=> query_embedding)) > match_threshold
    -- The delete rule. In WHERE, so LIMIT applies after it and a query cannot
    -- come back short because unreferenced parses ate its budget.
    and exists (
      select 1
      from public.library_sources s
      where s.parsed_document_id = c.parsed_document_id
        and s.deleted = false
    )
  order by c.embedding <=> query_embedding asc
  limit match_count;
$$;

comment on function public.match_source_chunks is
  'ANN over the caller''s own ORIGINAL-DOCUMENT chunks. Returns MEASURED provenance only (unit_kind/index/label, cell_range, heading_path) plus every live placement of the parse. Identity is the parse + content hash, never a single placement, because one parse can be filed many times.';

revoke execute on function public.match_source_chunks(extensions.vector(1024), int, float) from public, anon;
grant execute on function public.match_source_chunks(extensions.vector(1024), int, float) to authenticated, service_role;

-- ── 4. Both, for a caller that asked for both ────────────────────────────────
--
-- 🔴 `path` IS NULL FOR A SOURCE ROW, NEVER ''. An empty string is a value that
-- looks like a path and renders as one; null is a consumer's obligation to
-- branch. `origin_type` is the discriminator and comes back on every row, so no
-- caller has to infer a row's kind from whether a field happens to be blank —
-- inferring origin from an empty path is exactly the failure mode this whole
-- migration exists to make impossible.
--
-- ONE ranking, ONE order-by: rows compete on cosine distance alone. Deciding that
-- an original outranks a note derived from it is a RANKING policy, and ranking
-- policy does not belong in the retrieval layer — it belongs to whoever composes
-- an answer, who can see both rows and the question.
--
-- 🔴 SO ONE ORIGIN CAN TAKE EVERY SLOT, AND THAT IS NOT A BUG. If the eight
-- nearest passages in an account all come from one spreadsheet, eight
-- spreadsheet chunks are what a caller asking for eight gets. THERE IS NO
-- REPRESENTATION GUARANTEE AT ANY LIMIT — the per-arm LIMIT is `match_count`
-- too, so raising it raises both arms and the nearer origin keeps winning.
--
-- What the per-arm limit really buys is narrower and worth stating exactly: each
-- arm runs its OWN ANN scan through its OWN index, so a 4,000-chunk document
-- cannot starve the note scan of candidates. Notes are always FOUND; they then
-- lose on distance like anything else. A caller that needs both origins
-- represented calls the two single-origin functions and merges under a policy of
-- its own — which is the right place for a policy to live.
--
-- (Two earlier drafts of this comment claimed this shape prevented crowding out.
-- It does not. The regression test caught the claim both times, which is the
-- reason the test exists. Quotas here would be exactly the ranking policy this
-- layer refuses to hold.)
create or replace function public.match_library_all(
  query_embedding extensions.vector(1024),
  match_count int default 8,
  match_threshold float default 0.35
)
returns table (
  origin_type text,
  chunk_id uuid,
  path text,
  title text,
  chunk_index int,
  content text,
  parsed_document_id uuid,
  doc_kind text,
  unit_kind text,
  unit_index int,
  unit_label text,
  cell_range text,
  heading_path text[],
  placements jsonb,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
set hnsw.ef_search = 100
set hnsw.iterative_scan = 'strict_order'
as $$
  -- TWO CTEs, not two arms of one UNION: a branch of a UNION may not carry its
  -- own ORDER BY / LIMIT (Postgres rejects it outright), and each arm MUST have
  -- them. Without a per-arm limit the union would be ranked globally, and an
  -- account with one big PDF would see notes vanish from combined search
  -- entirely — the crowding-out this shape exists to prevent.
  with note_hits as (
    select
      'note'::text as origin_type,
      c.id as chunk_id,
      c.path,
      c.title,
      c.chunk_index,
      c.content,
      null::uuid as parsed_document_id,
      null::text as doc_kind,
      null::text as unit_kind,
      null::int as unit_index,
      null::text as unit_label,
      null::text as cell_range,
      null::text[] as heading_path,
      '[]'::jsonb as placements,
      c.embedding <=> query_embedding as distance
    from public.library_chunks c
    join public.readable_library_documents d on d.id = c.document_id
    where c.embedding is not null
      and c.origin_type = 'note'
      and d.deleted = false
      and (1 - (c.embedding <=> query_embedding)) > match_threshold
    order by c.embedding <=> query_embedding asc
    limit match_count
  ),
  source_hits as (
    select
      'source'::text as origin_type,
      c.id as chunk_id,
      -- 🔴 NULL, never ''. See the header: an empty string renders as a path.
      null::text as path,
      c.title,
      c.chunk_index,
      c.content,
      c.parsed_document_id,
      p.doc_kind,
      c.unit_kind,
      c.unit_index,
      c.unit_label,
      c.cell_range,
      c.heading_path,
      coalesce(
        (
          select jsonb_agg(
                   jsonb_build_object(
                     'id', s.id,
                     'folder_path', s.folder_path,
                     'file_name', s.file_name,
                     'mime_type', s.mime_type
                   )
                   order by s.created_at desc
                 )
          from public.library_sources s
          where s.parsed_document_id = c.parsed_document_id
            and s.deleted = false
        ),
        '[]'::jsonb
      ) as placements,
      c.embedding <=> query_embedding as distance
    from public.library_chunks c
    join public.parsed_documents p on p.id = c.parsed_document_id
    where c.embedding is not null
      and c.origin_type = 'source'
      and (1 - (c.embedding <=> query_embedding)) > match_threshold
      and exists (
        select 1
        from public.library_sources s
        where s.parsed_document_id = c.parsed_document_id
          and s.deleted = false
      )
    order by c.embedding <=> query_embedding asc
    limit match_count
  ),
  hits as (
    select * from note_hits
    union all
    select * from source_hits
  )
  select
    hits.origin_type,
    hits.chunk_id,
    hits.path,
    hits.title,
    hits.chunk_index,
    hits.content,
    hits.parsed_document_id,
    hits.doc_kind,
    hits.unit_kind,
    hits.unit_index,
    hits.unit_label,
    hits.cell_range,
    hits.heading_path,
    hits.placements,
    1 - hits.distance as similarity
  from hits
  order by hits.distance asc
  limit match_count;
$$;

comment on function public.match_library_all is
  'OPT-IN combined retrieval over notes AND originals. Each arm runs its own ANN scan through its own index (so a huge document cannot starve the note scan of candidates), then the union is ranked by cosine distance ALONE -- one origin may legitimately take every slot. `origin_type` discriminates every row; `path` is NULL (never '''') for a source row.';

revoke execute on function public.match_library_all(extensions.vector(1024), int, float) from public, anon;
grant execute on function public.match_library_all(extensions.vector(1024), int, float) to authenticated, service_role;
