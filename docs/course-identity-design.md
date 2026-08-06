# Course identity: `courseId` separate from `folderId`

Owner, 2026-08-06. Written after the routing-precedence work in #446 landed
rungs 1, 2, 4 and 5 and left rung 3 empty.

> Keep folder location and course identity as separate fields:
> - `courseId`: stable academic identity shared by source, note, deck, and test
> - `folderId`: where that artifact appears in Library or Study
>
> If the source has no verified course association, inherit its folder and
> remain honest. Do not guess a course from the lecture topic. The user can
> associate the source with a course once, after which every derived artifact
> should inherit it.

**Nothing in this document has been applied.** The migration below is written
and reviewable; running it against production is a separate decision.

---

## 1. What exists today

I checked the live database and the whole TypeScript source. There is no course
identity anywhere:

| where | what | shape |
|---|---|---|
| `calendar_events.course` | free text, filled by syllabus import | `"PHCY 2105"` |
| Library top-level folders | whatever the student made | `Pharmacy`, `PHCY 2114`, `Inbox` |
| Study deck folders | a `::` prefix inside the deck's own name | `Pharmacology::…` |
| Study test folders | a flat `group_name` string | `Pharmacology` |
| code | no `courseId`, no `course_id`, no `courses` table | — |

So "the course" is today a **string that appears in four different places, spelled
differently in each**, and the only thing tying them together is word matching.
That is exactly the weakness the owner's design removes.

The owner's own data shows the cost. Their four known course strings are
`PHCY 1215`, `PHCY 1218`, `PHCY 2105`, `PHCY 2114`. Their Library has a broad
`Pharmacy` folder. Their Study page had an invented `Pharmacology`. Their
Pharmacogenomics lecture is `PHCY 2109` — **a course that exists in their life
and nowhere in the app**, because they have no calendar events for it.

## 2. The model

Two fields, never conflated:

- **`course_id`** — stable academic identity. One row per course the student is
  actually taking. Shared unchanged by a source, the notes written from it, the
  deck built from it, and the test generated from it.
- **`folder_path`** — where the artifact *appears*. Renaming a folder must not
  change what course something belongs to, and moving a deck between folders
  must not orphan it from its course.

A course is displayed as **`PHCY 2109 · Pharmacogenomics for the Pharmacist`** —
code first because that is what students use, name second because a code alone
is unreadable to anyone else.

### Why a table and not a string

Three things a string cannot do, all of which have already bitten:

1. **Renaming.** "PHCY 2109" → "Pharmacogenomics" today orphans every artifact
   filed under the old spelling.
2. **Two spellings of one course.** `Pharmacy`, `Pharmacology` and `PHCY 2109`
   are three names for one thing in this student's workspace right now.
3. **Verified vs guessed.** A string cannot record *how* the association was
   made. A row can, and the owner's rule turns on exactly that distinction.

## 3. Schema

```sql
create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code        text,                         -- "PHCY 2109", nullable: not every field uses codes
  name        text,                         -- "Pharmacogenomics for the Pharmacist"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint courses_need_a_label check (coalesce(code, '') <> '' or coalesce(name, '') <> '')
);
```

`code` and `name` are both nullable with a check that at least one is present.
A trade school course may have only a name; a lecture-hall course may be known
only by its code until the student types the rest. **Requiring both would make
the app unusable for half its intended users**, which is the field-agnostic rule
applied to a schema.

Then one nullable `course_id` on each thing that can belong to a course:

```sql
alter table public.library_sources  add column course_id uuid references public.courses(id) on delete set null;
alter table public.library_documents add column course_id uuid references public.courses(id) on delete set null;
alter table public.study_decks      add column course_id uuid references public.courses(id) on delete set null;
alter table public.study_artifacts  add column course_id uuid references public.courses(id) on delete set null;
```

`on delete set null`, never cascade: deleting a course must not delete a
semester of notes. The artifact survives and becomes unassociated, which is
recoverable; the alternative is not.

### Backfill

One row per distinct `calendar_events.course` per user. That string is the only
thing in the product the student actually typed as a course, so it is the only
honest seed:

```sql
insert into public.courses (user_id, code)
select distinct user_id, trim(course)
from public.calendar_events
where course is not null and trim(course) <> '';
```

`code`, not `name` — `"PHCY 2105"` is a code. Names stay null until the student
supplies them, and the label renders as just the code until then.

**No artifact is auto-associated by the backfill.** Matching existing notes to
courses by word overlap is exactly the guessing the owner ruled out, and it
would write a *verified-looking* association from an unverified inference. Every
`course_id` starts null and is filled by the student, once, per source.

## 4. How an association is made

**Once per source, by the student.** A course picker on a Library source: a
dropdown of their courses plus "Add a course". That is the only writer of
`library_sources.course_id`.

Everything derived inherits it, at creation, from the source it was built from —
which is the plumbing #446 already built. The precedence ladder gains its
missing rung:

1. a folder/course selected in the UI
2. a folder/course named in the student's own message
3. **the source's `course_id`** ← this
4. the source's existing folder
5. unfiled

Rungs 3 and 4 differ in an important way: a `course_id` gives the artifact a
*course*, and the folder gives it a *place*. When rung 3 fires, the deck gets
both — the course by identity, the folder from the course's own display label.

## 5. What this changes on screen

- Study folders become courses where a course is known: `PHCY 2109 · Pharmacogenomics`,
  not `Pharmacology`.
- A source with no course keeps inheriting its folder, and the folder is
  labelled as a folder — no false precision.
- Renaming a course updates every artifact's label at once, because they share
  an id rather than a copy of a string.

## 6. Open decisions for the owner

1. **Apply the migration?** It is additive — a new table plus four nullable
   columns — so nothing existing breaks and the backfill is idempotent. It still
   needs an explicit go-ahead.
2. **Where does the course picker live?** On the Library source row, on the
   reader's header, or in the upload flow. The upload flow catches it earliest
   but adds a step to every upload.
3. **Should the chat be able to associate a source with a course?** It is the
   natural place to say "this is for PHCY 2109" — but that is the model writing
   an identity, which is the thing rung 2 exists to constrain. My inclination:
   yes, but only when the student's message names the course, using the same
   vouching rule as folders.
4. **Retire the topic matcher entirely?** It runs today only when there is no
   attachment at all. Once course association exists, that last case gets rarer,
   and removing it would make "never guess" absolute.
