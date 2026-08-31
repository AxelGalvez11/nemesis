-- Who wrote a Library note: Nemesis, or the learner.
--
-- 🔴 WHY A COLUMN AND NOT A JOIN. The owner asked for the Claude Design split on 2026-08-31:
-- *"users drop in a bubble of a comment or edit (if its nemesis made)"* — comment on anything,
-- but only offer to REVISE what Nemesis itself produced. Nothing in the schema could answer that
-- question. `recordLedger` writes an `assets` row carrying a kind and a title and NOTHING that
-- points back at the note, so there is no join from a note to "Nemesis made this", and the ledger
-- is best-effort anyway (it returns null on any failure and the deliverable still ships). A
-- heuristic on the folder name would have worked until the first learner moved a note.
--
-- 🔴 DEFAULT 'learner' IS THE SAFE DIRECTION. An unknown row must not offer Nemesis a door to
-- rewrite something a person typed. The backfill below only promotes rows this app itself
-- created under its two known output folders.
alter table public.readable_library_documents
  add column if not exists made_by text not null default 'learner';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'readable_library_documents_made_by_check'
  ) then
    alter table public.readable_library_documents
      add constraint readable_library_documents_made_by_check
      check (made_by in ('learner', 'nemesis'));
  end if;
end $$;

-- The two folders `canvas-deliverables.ts` writes into (CANVAS_NOTE_FOLDER and RESEARCH_FOLDER).
-- 🔴 Anchored with `like 'x/%'`, so a learner's own note merely NAMED "Research" is untouched.
update public.readable_library_documents
   set made_by = 'nemesis'
 where made_by = 'learner'
   and (path like 'Canvas outputs/%' or path like 'Research/%');

create index if not exists readable_library_documents_made_by_idx
  on public.readable_library_documents(user_id, made_by);
