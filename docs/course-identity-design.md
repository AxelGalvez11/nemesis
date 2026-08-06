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

## 6. Decisions — settled by the owner, 2026-08-06

These were open questions when this document was written. They are not open any
more, and the answers are requirements, not preferences.

### 6.1 Apply the migration — YES

Additive: one new table plus four nullable columns. Applied through the
Management API under a production-assigned timestamp, with the stored statements
verified against the merged file afterwards.

🔴 **`supabase db push` is PROHIBITED in this repository**, and so is
`supabase migration repair`, until the migration-governance task lands. The
repository has 62 local-only versions, 65 remote-only versions and only 28 that
match, plus two files sharing the version `20260724200000`. A push would run
~62 migrations, including one that would install a constraint production cannot
satisfy.

### 6.2 The picker lives in the reader/source header — an editable course pill

**The reader/source header is the canonical place to see and change a source's
course.** It reads as its code when one is known — `PHCY 2109` — and as
**Assign course** when none is. Editable in place.

Upload MAY offer an optional picker, and MAY inherit a course when the student
uploads from a context whose course is already verified. It **must not add a
mandatory step to every upload**: a student adding four lectures before class
should not answer four questions to do it. Library bulk assignment comes later.

### 6.3 Chat may associate — ONLY when the student vouches

The chat may create or set a course association **only when the student
explicitly vouches for it** — "this is for PHCY 2109", "put this in Contract
Law". The student's actual code or name is preserved verbatim; the model does
not tidy `contract law` into `Contract Law I` or expand `PHCY 2109` into a title
it inferred.

🔴 If the wording is ambiguous, **ask**. Never infer an association from:

- the file's contents
- the filename
- topic overlap with an existing course
- the existence of a folder with a similar name

The same vouching rule that governs folders (`folderNamedByStudent`), applied to
an identity that outlives the folder.

### 6.4 Topic matching is retired as an authority

`matchCourse` and everything built on it **must never create, file, or write a
course association**. It may remain only as a clearly labelled *suggestion* that
requires the student to confirm before anything is written.

It keeps its existing, narrower job — choosing a folder for a NEW item when
nothing better is known — because a folder is a place and not a claim about
identity. The moment a suggestion becomes a `course_id`, a guess has been
recorded as a fact.

### 6.5 Existing material stays unassociated

Every `course_id` starts null and is filled by the student, once, per source.
**No backfill by guessing.** The migration seeds the `courses` TABLE from
`calendar_events.course` — a place the student typed the course themselves — and
associates nothing.

### 6.6 A verified association is inherited and survives renaming

Once a source has a verified `course_id`, notes, flashcards and tests generated
from it **inherit that same id**, not a copy of its label. Renaming a course or
moving a folder must not orphan them — which is the whole reason this is a table
with an id rather than a string in four places.
