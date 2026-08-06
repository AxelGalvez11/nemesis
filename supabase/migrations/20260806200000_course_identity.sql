-- Course identity, separate from folder location.
--
-- Owner 2026-08-06: "keep folder location and course identity as separate
-- fields — course_id is the stable academic identity shared by source, note,
-- deck and test; folder_id is where that artifact appears."
--
-- Before this, "the course" was a string living in four places spelled
-- differently in each: calendar_events.course ("PHCY 2105"), a Library top
-- folder ("Pharmacy"), a deck's "::" prefix ("Pharmacology"), and a test's
-- group_name. Nothing tied them together but word matching, so renaming a
-- course orphaned its material and one course could wear three names at once.
--
-- See docs/course-identity-design.md. Purely additive: a new table plus four
-- NULLABLE columns. NOTHING is written by this migration — no course rows, no
-- associations — so applying it changes no behaviour at all until a student
-- creates a course and assigns it themselves.

create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Both nullable, at least one present (owner 2026-08-06). A trade course may
  -- have only a name; a lecture course is often known only by its code until
  -- the student types the rest. Requiring both would make this unusable for
  -- half the fields this product serves.
  code        text,
  name        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint courses_need_a_label check (coalesce(code, '') <> '' or coalesce(name, '') <> '')
);

create index if not exists courses_user_idx on public.courses (user_id, code);

alter table public.courses enable row level security;

drop policy if exists "courses are owner-only" on public.courses;
create policy "courses are owner-only" on public.courses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.courses to authenticated;

-- 🔴 ON DELETE SET NULL, never cascade. Deleting a course must not delete a
-- semester of notes: the artifact survives and becomes unassociated, which the
-- student can undo. The alternative cannot be undone.
alter table public.library_sources   add column if not exists course_id uuid references public.courses(id) on delete set null;
alter table public.library_documents add column if not exists course_id uuid references public.courses(id) on delete set null;
alter table public.study_decks       add column if not exists course_id uuid references public.courses(id) on delete set null;
alter table public.study_artifacts   add column if not exists course_id uuid references public.courses(id) on delete set null;

create index if not exists library_sources_course_idx   on public.library_sources (course_id) where course_id is not null;
create index if not exists library_documents_course_idx on public.library_documents (course_id) where course_id is not null;
create index if not exists study_decks_course_idx       on public.study_decks (course_id) where course_id is not null;
create index if not exists study_artifacts_course_idx   on public.study_artifacts (course_id) where course_id is not null;

-- 🔴🔴 THERE IS NO BACKFILL, AND THAT IS THE POINT.
--
-- An earlier draft seeded one course per distinct calendar_events.course.
-- Owner 2026-08-06 rejected it: "those values may include imports, duplicates,
-- or earlier model-generated labels. The safest option is no automatic
-- backfill." That is right, and the reason generalises — a seeded row is
-- indistinguishable, once written, from one the student created, so a table
-- meant to hold VERIFIED identity would begin life full of unverified guesses
-- wearing the same clothes.
--
-- Every row in `courses` is therefore created by the student, which is what
-- makes "verified" a property of the table rather than a column on it. Nothing
-- here needs an `unverified` flag because nothing here can produce one.
--
-- The calendar strings are not lost. The course picker offers them as
-- SUGGESTIONS, read live from calendar_events at pick time, and a suggestion
-- becomes a course only when the student clicks it — at which point they have
-- verified it, and their own spelling is what gets stored.
--
-- Existing sources also stay unassociated (owner: "do not backfill source
-- associations by guessing"). A lecture that has always been in `Pharmacy`
-- keeps appearing in `Pharmacy`; it simply has no course until asked.
