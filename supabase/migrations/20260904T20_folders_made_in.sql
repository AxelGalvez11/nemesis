-- Where the learner made a folder, so the Library can show the ones made ON it.
--
-- 🔴🔴 TWO OWNER RULINGS THAT BOTH HOLD, AND THE SECOND MADE THE FIRST SELF-DEFEATING.
--
-- The Library hides folders that hold nothing. That came from a real report — *"I created a new
-- project, but it's showed up in the library, and that's not where it should go"* — and it was
-- right while folders could only be made on /projects or in the sidebar.
--
-- Then (2026-09-03) the Library grew a New folder button of its own, and the same rule started
-- eating its result: you name a folder, it is created, and it never appears, because a folder you
-- have just made is empty by definition. Owner, 2026-09-04: *"making a folder in library doesnt
-- work like in chatgpt, fix it"* — and on chatgpt.com/library an empty folder does show, with a
-- Size of "—".
--
-- 🔴 NULL MEANS "NOT MADE ON THE LIBRARY" — every folder that already exists, and every project
-- made anywhere else. Only the Library writes a value, because it is the only surface whose
-- behaviour depends on the answer. A second value can be added when something needs one; inventing
-- 'projects' now would be a fact nothing reads.
alter table public.folders
  add column if not exists made_in text;

alter table public.folders
  drop constraint if exists folders_made_in_check;

alter table public.folders
  add constraint folders_made_in_check
  check (made_in is null or made_in = 'library');

comment on column public.folders.made_in is
  'Where the learner made this folder. ''library'' = the Library''s own New folder button, which is shown on the Library shelf even while empty. NULL = made anywhere else (a project on /projects, or the sidebar), which appears on the Library only once it holds an output.';
