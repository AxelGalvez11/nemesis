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
-- See docs/course-identity-design.md. Additive and idempotent: a new table plus
-- four NULLABLE columns, so nothing that exists today changes behaviour until
-- a student associates a source with a course.

create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Both nullable, at least one present. A trade course may have only a name;
  -- a lecture course is often known only by its code until the student types
  -- the rest. Requiring both would make this unusable for half the fields this
  -- product serves.
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

-- Seed from the ONE place a student has already typed a course themselves.
-- Written to `code`, not `name`: "PHCY 2105" is a code, and a course shows as
-- its code alone until the student supplies the rest.
--
-- 🔴 NOTHING IS AUTO-ASSOCIATED. Matching existing notes to these courses by
-- word overlap is precisely the guessing this design removes, and it would
-- write a verified-LOOKING association from an unverified inference. Every
-- course_id starts null and is filled by the student, once, per source.
insert into public.courses (user_id, code)
select distinct e.user_id, trim(e.course)
from public.calendar_events e
where e.course is not null
  and trim(e.course) <> ''
  and not exists (
    select 1 from public.courses c
    where c.user_id = e.user_id and lower(coalesce(c.code, '')) = lower(trim(e.course))
  );
