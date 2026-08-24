-- Folders for the things Nemesis MAKES, not just for the sessions that made them.
--
-- Owner 2026-08-24: *"And the library, I don't know if you added the folders. Could you… yeah.
-- Add the folders."*
--
-- 🔴 THE `folders` TABLE IS REUSED, NOT COPIED, AND THAT WAS THE WHOLE REASON IT WAS BUILT
-- GENERIC. Its own migration says so: *"Generic on purpose… folders organise sessions, and
-- Nemesis is not education-only"*. A second `library_folders` table would give the learner two
-- unrelated folder trees with the same names in each, and "Fall 2026 / Pharmacology" would have
-- to be made twice — once for the canvas and once for the deck the canvas produced. One tree.
-- The two-level depth guard, the cascade on delete and the RLS policies all come along unchanged.
--
-- 🔴 THREE COLUMNS BECAUSE THE LIBRARY HAS THREE SHELVES, and they live in three tables that
-- predate each other: decks in `study_decks`, notes in `readable_library_documents`, slide decks
-- in `assets`. There is no single "output" table to hang one column on, and inventing one now
-- would be a migration of live rows rather than an addition beside them.
--
-- 🔴🔴 `on delete set null`, MATCHING THE CANVASES. Deleting a folder must never delete a
-- learner's work — the sidebar already promises this in words ("Canvases inside are kept — they
-- go back to your recents") and the Library says the same. An artifact whose folder is gone
-- becomes unfiled, which is recoverable; an artifact deleted with its folder is not.
--
-- 🔴 NOTHING IS BACKFILLED AND NOTHING MOVES. Every column is nullable and starts null, so every
-- existing deck, note and slide deck is simply unfiled — which is exactly what it was before this
-- ran. This migration is reversible by dropping three columns.

-- ------------------------------------------------------------------ the columns

alter table public.study_decks
  add column if not exists folder_id uuid references public.folders(id) on delete set null;

alter table public.readable_library_documents
  add column if not exists folder_id uuid references public.folders(id) on delete set null;

alter table public.assets
  add column if not exists folder_id uuid references public.folders(id) on delete set null;

-- 🔴 PARTIAL INDEXES, BECAUSE THE COLUMN IS NULL FOR ALMOST EVERY ROW AND WILL STAY THAT WAY.
-- The Library reads "everything in this folder" and "everything with no folder"; only the first
-- needs an index, and indexing the nulls would be indexing the whole table for nothing.
create index if not exists study_decks_folder_idx
  on public.study_decks(folder_id) where folder_id is not null;

create index if not exists readable_library_documents_folder_idx
  on public.readable_library_documents(folder_id) where folder_id is not null and deleted = false;

create index if not exists assets_folder_idx
  on public.assets(folder_id) where folder_id is not null and deleted = false;

-- ------------------------------------------------------------------ whose folder is it

-- 🔴🔴 A ROW MAY ONLY BE FILED INTO A FOLDER ITS OWN OWNER OWNS, AND RLS DOES NOT SAY THIS.
-- The policies on `folders` stop a learner READING a stranger's folder; they do not stop one
-- WRITING a stranger's folder id into a column, because the write happens on this table, where
-- the policy only checks who owns the deck. Nothing leaks either way — the stranger still cannot
-- see the deck, and the owner still cannot see the folder — but the column would then hold an id
-- that means nothing to anyone, and "which folder is this in?" would have no honest answer.
--
-- Cheaper than a check constraint with a subquery, and it fires on exactly the two statements
-- that can break the invariant.
create or replace function public.folder_belongs_to_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  folder_owner uuid;
begin
  if new.folder_id is null then
    return new;
  end if;
  select user_id into folder_owner from public.folders where id = new.folder_id;
  -- A missing folder is left to the foreign key to refuse, so the two failures stay distinct.
  if folder_owner is not null and folder_owner <> new.user_id then
    raise exception 'a folder belongs to a different account';
  end if;
  return new;
end;
$$;

drop trigger if exists study_decks_folder_owner on public.study_decks;
create trigger study_decks_folder_owner before insert or update of folder_id on public.study_decks
for each row execute function public.folder_belongs_to_owner();

drop trigger if exists readable_library_documents_folder_owner on public.readable_library_documents;
create trigger readable_library_documents_folder_owner
before insert or update of folder_id on public.readable_library_documents
for each row execute function public.folder_belongs_to_owner();

drop trigger if exists assets_folder_owner on public.assets;
create trigger assets_folder_owner before insert or update of folder_id on public.assets
for each row execute function public.folder_belongs_to_owner();
