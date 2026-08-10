-- Organising canvas sessions, and storing a durable object ONCE.
--
-- Owner approved applying this on 2026-08-10.
--
-- Two separate ideas that arrive together because they are the two things the product shell
-- needs and neither can be expressed in the canvas's jsonb document:
--
--   1. FOLDERS + PINNING organise sessions. A canvas cannot file itself, because filing is a
--      fact about the relationship BETWEEN canvases.
--
--   2. ASSETS store a durable object once and reference it. Today every canvas carries its own
--      copy of a source's extracted text inside its `document` column, so attaching the same
--      lecture PDF to two canvases stores the text twice — and an hour of audio would be stored
--      twice too. That is also why reference-aware deletion cannot be written today: there are
--      no references to count, only copies.
--
-- 🔴 NOTHING EXISTING IS MODIFIED OR MIGRATED HERE. The two new columns are nullable, the four
-- new tables start empty, and `learning_canvases.document` keeps holding sources exactly as it
-- does now. Moving sources out of the document into assets is a separate, reversible step that
-- needs a backfill and its own review — doing it in the same migration that creates the tables
-- would mean the schema change could not be judged apart from the data change.

-- ------------------------------------------------------------------ folders

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Generic on purpose. The owner's rule: folders organise sessions, and Nemesis is not
  -- education-only — "Fall 2026 / Pharmacology" and "Work / Personal" must both be natural.
  parent_id uuid references public.folders(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists folders_owner_idx on public.folders(user_id, name);
create index if not exists folders_parent_idx on public.folders(parent_id) where parent_id is not null;

-- 🔴 TWO LEVELS, ENFORCED BY THE DATABASE — "do not build a full filesystem" as a constraint
-- rather than as a comment somebody will not read. A folder may only sit inside a top-level
-- folder, which also makes cycles impossible without a recursive check.
create or replace function public.folders_depth_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_parent uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'a folder cannot contain itself';
  end if;
  select parent_id into parent_parent from public.folders where id = new.parent_id;
  if parent_parent is not null then
    raise exception 'folders nest two levels deep at most';
  end if;
  return new;
end;
$$;

drop trigger if exists folders_depth on public.folders;
create trigger folders_depth before insert or update on public.folders
for each row execute function public.folders_depth_guard();

alter table public.folders enable row level security;

drop policy if exists folders_select on public.folders;
create policy folders_select on public.folders for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists folders_insert on public.folders;
create policy folders_insert on public.folders for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists folders_update on public.folders;
create policy folders_update on public.folders for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists folders_delete on public.folders;
create policy folders_delete on public.folders for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.folders from anon, authenticated;
grant select, insert, update, delete on public.folders to authenticated;

-- ------------------------------------------------- canvases: pinning + filing

alter table public.learning_canvases
  add column if not exists pinned_at timestamptz,
  -- `set null`, not `cascade`: deleting a folder must never delete the learner's sessions. The
  -- sessions fall back to unfiled, which is recoverable; the other way round is not.
  add column if not exists folder_id uuid references public.folders(id) on delete set null;

-- Pinned first, then most recently touched — the home list's exact order, so it never sorts in
-- application code over a page of rows it happens to have.
create index if not exists learning_canvases_pinned_idx
  on public.learning_canvases(user_id, pinned_at desc nulls last, updated_at desc)
  where deleted = false;

create index if not exists learning_canvases_folder_idx
  on public.learning_canvases(folder_id) where folder_id is not null and deleted = false;

-- ------------------------------------------------------------------- assets

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in (
    'document', 'recording', 'image', 'generated_document', 'generated_slides', 'other'
  )),
  title text not null default '' check (char_length(title) <= 300),
  -- Where the bytes are. A storage path, or null for something that has no file of its own.
  storage_ref text,
  -- Recordings only. Kept here rather than in a recordings table because a recording IS an
  -- asset that can also become a source — forcing it to be one or the other is the modelling
  -- mistake the owner called out.
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  transcript_status text check (transcript_status in ('none', 'pending', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists assets_owner_idx on public.assets(user_id, created_at desc)
  where deleted = false;

alter table public.assets enable row level security;

drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists assets_insert on public.assets;
create policy assets_insert on public.assets for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists assets_update on public.assets;
create policy assets_update on public.assets for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists assets_delete on public.assets;
create policy assets_delete on public.assets for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.assets from anon, authenticated;
grant select, insert, update, delete on public.assets to authenticated;

-- ------------------------------------------- what a canvas uses, and produces

-- 🔴 TWO TABLES, NOT ONE WITH A `role` COLUMN. A source is material Nemesis grounds its
-- teaching ON; an output is an artifact it produced. They are opposite ends of a session, they
-- will grow different columns, and a single table with a discriminator is the shape that makes
-- "show me this canvas's sources" a filtered scan forever.

create table if not exists public.canvas_sources (
  canvas_id uuid not null references public.learning_canvases(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (canvas_id, asset_id)
);

create table if not exists public.canvas_outputs (
  canvas_id uuid not null references public.learning_canvases(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (canvas_id, asset_id)
);

-- The reverse lookup §12 needs: "is anything else still using this asset?" Without it, the
-- reference count is a full scan of every join row the learner owns.
create index if not exists canvas_sources_asset_idx on public.canvas_sources(asset_id);
create index if not exists canvas_outputs_asset_idx on public.canvas_outputs(asset_id);

alter table public.canvas_sources enable row level security;
alter table public.canvas_outputs enable row level security;

-- Ownership is the CANVAS's. A join row carries no user_id of its own, so the policy asks the
-- canvas — which means a row can never outlive the permission that created it.
drop policy if exists canvas_sources_all on public.canvas_sources;
create policy canvas_sources_all on public.canvas_sources for all to authenticated
using (exists (
  select 1 from public.learning_canvases c
  where c.id = canvas_id and c.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.learning_canvases c
  where c.id = canvas_id and c.user_id = (select auth.uid())
) and exists (
  select 1 from public.assets a
  where a.id = asset_id and a.user_id = (select auth.uid())
));

drop policy if exists canvas_outputs_all on public.canvas_outputs;
create policy canvas_outputs_all on public.canvas_outputs for all to authenticated
using (exists (
  select 1 from public.learning_canvases c
  where c.id = canvas_id and c.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.learning_canvases c
  where c.id = canvas_id and c.user_id = (select auth.uid())
) and exists (
  select 1 from public.assets a
  where a.id = asset_id and a.user_id = (select auth.uid())
));

revoke all on public.canvas_sources from anon, authenticated;
revoke all on public.canvas_outputs from anon, authenticated;
grant select, insert, update, delete on public.canvas_sources to authenticated;
grant select, insert, update, delete on public.canvas_outputs to authenticated;

-- ------------------------------------------------- reference-aware deletion

-- §12: deleting Canvas A must not destroy a PDF that Canvas B is still using.
--
-- Returns the assets that are now referenced by nothing, so a caller can delete their bytes.
-- Deliberately a REPORT rather than a delete: storage removal is not transactional with this,
-- and a function that silently dropped files would be the least recoverable thing in the app.
create or replace function public.orphaned_assets()
returns table (id uuid, kind text, storage_ref text)
language sql
security invoker
set search_path = ''
as $$
  select a.id, a.kind, a.storage_ref
  from public.assets a
  where a.user_id = (select auth.uid())
    and a.deleted = false
    and not exists (select 1 from public.canvas_sources s where s.asset_id = a.id)
    and not exists (select 1 from public.canvas_outputs o where o.asset_id = a.id);
$$;

revoke all on function public.orphaned_assets() from anon;
grant execute on function public.orphaned_assets() to authenticated;
