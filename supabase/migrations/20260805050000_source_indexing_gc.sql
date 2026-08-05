-- Reference-aware cleanup, and an honest state for a half-read document.
--
-- 🔴 NO LIBRARY ACTION MAY DESTROY RETRIEVAL DATA. Deleting, moving or renaming a
-- placement is organisational state. It must never cascade into the canonical
-- parse or its chunks, because the same file can be filed in several places and
-- one of those placements going away says nothing about the others.
--
-- So cleanup is DELAYED AND EXPLICIT rather than cascading:
--
--   delete placement
--     -> count remaining live placements for that parse
--     -> still referenced?  do nothing
--     -> unreferenced?      stamp unreferenced_at, and STOP
--     -> a separate deliberate sweep collects what has been unreferenced long
--        enough, and only then removes chunks, parse and object
--
-- The stamp is reversible on purpose: re-importing the same file, or undoing a
-- delete, clears it and the expensive parse is still there. A cascade would have
-- made "I moved a file out of a folder" and "destroy the index" the same button.

alter table public.parsed_documents
  drop constraint if exists parsed_documents_state_check;
alter table public.parsed_documents
  add constraint parsed_documents_state_check check (state in (
    'pending',
    'parsing',
    'parsed',
    -- 🔴 A 70-SLIDE DECK THAT YIELDED 3 SLIDES IS NOT A SUCCESS. Text coming out
    -- is not the same as the document having been read. A parser that knows it
    -- fell short says so here, and `coverage` says by how much, so nothing
    -- downstream can present a partial read as a complete one.
    'partially_parsed',
    'chunking',
    'chunked',
    'embedding',
    'ready',
    'failed'
  ));

alter table public.parsed_documents
  -- Set when the last live placement referencing this parse goes away. NULL means
  -- "still referenced". Cleared if a placement points here again.
  add column if not exists unreferenced_at timestamptz,
  -- What the parser itself judged about its own completeness, separate from
  -- whether the pipeline ran. A parse can be `ready` for retrieval and still be
  -- known-incomplete; a consumer that cannot tell the two apart cannot report
  -- honestly.
  add column if not exists complete boolean not null default true;

-- The sweep's own index: only rows that are actually candidates.
create index if not exists parsed_documents_gc_idx
  on public.parsed_documents(unreferenced_at)
  where unreferenced_at is not null;

comment on column public.parsed_documents.unreferenced_at is
  'Stamped when the last live placement stops referencing this parse. Cleanup is a separate deliberate sweep -- a Library action must never destroy retrieval data.';
comment on column public.parsed_documents.complete is
  'The PARSER''s judgement of its own coverage. false = known-incomplete (a 70-slide deck that yielded 3). Independent of `state`, which tracks the pipeline.';

-- Answering "is this parse still referenced?" in ONE place, so no caller invents
-- its own version of the question. Counts only LIVE placements: library_sources
-- deletion is soft, and a soft-deleted placement is recoverable, so it still
-- counts as a reference until it is truly gone.
create or replace function public.parse_reference_count(parse_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.library_sources s
  where s.parsed_document_id = parse_id
    and s.deleted = false;
$$;

revoke all on function public.parse_reference_count(uuid) from anon, authenticated;
