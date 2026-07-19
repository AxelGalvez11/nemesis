-- Notebooks — NotebookLM-style projects: sources + instructions + scoped chats.
-- ADDITIVE + NON-DESTRUCTIVE. Fresh tables (not the legacy projects/*), server-readable,
-- RLS per-user (auth.uid() = user_id). Every source is stored as EXTRACTED TEXT on the row
-- (the "extract to text" pipeline) — no binary/Storage bucket. `kind` spans the Phase 1 set
-- (library refs, pasted text, scraped web link, PDF/Word/PowerPoint text) plus `youtube`
-- (the immediate fast-follow) so its transcript source needs no further migration.

create table if not exists public.notebooks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null,
  description  text,
  instructions text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.notebooks enable row level security;
drop policy if exists notebooks_owner on public.notebooks;
create policy notebooks_owner on public.notebooks
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.notebooks from anon;
create index if not exists notebooks_user_idx on public.notebooks (user_id, updated_at desc);

drop trigger if exists notebooks_updated_at_trigger on public.notebooks;
create trigger notebooks_updated_at_trigger
  before update on public.notebooks
  for each row execute function core_sources_set_updated_at();

create table if not exists public.notebook_sources (
  id           uuid primary key default gen_random_uuid(),
  notebook_id  uuid not null references public.notebooks (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('library', 'text', 'url', 'pdf', 'docx', 'pptx', 'youtube')),
  name         text not null,
  -- The source's text: library = snapshot of the note; text = the pasted body; url/pdf/docx/pptx/youtube
  -- = the extracted (scraped/parsed/transcribed) text. Phase 2 grounding chunks + embeds this column.
  content      text,
  -- url + youtube sources: the original link the text was extracted from. Null otherwise.
  source_url   text,
  -- library sources only: the readable_library_documents.path this references (a pointer, no copy).
  library_path text,
  -- extracted/original byte size, best-effort (for the "N KB" affordance + future caps). Null when unknown.
  bytes        int,
  created_at   timestamptz not null default now()
);
alter table public.notebook_sources enable row level security;
drop policy if exists notebook_sources_owner on public.notebook_sources;
create policy notebook_sources_owner on public.notebook_sources
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.notebook_sources from anon;
create index if not exists notebook_sources_notebook_idx on public.notebook_sources (notebook_id, created_at desc);
