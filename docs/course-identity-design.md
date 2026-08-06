# Course identity: `courseId` separate from `folderId`

Owner, 2026-08-06. Architecture approved; the decisions below are settled, not
open questions. Written after the routing-precedence work in #446 landed rungs
1, 2, 4 and 5 and left rung 3 empty.

> Keep folder location and course identity as separate fields:
> - `courseId`: stable academic identity shared by source, note, deck, and test
> - `folderId`: where that artifact appears in Library or Study

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

The owner's own data shows the cost. Their four known course strings are
`PHCY 1215`, `PHCY 1218`, `PHCY 2105`, `PHCY 2114`. Their Library has a broad
`Pharmacy` folder. Their Study page had an invented `Pharmacology`. Their
Pharmacogenomics lecture is `PHCY 2109` — **a course that exists in their life
and nowhere in the app**, because they have no calendar events for it.

## 2. The model

Two fields, never conflated:

- **`course_id`** — stable academic identity. One row per course the student is
  actually taking, created by them. Shared unchanged by a source, the notes
  written from it, the deck built from it, and the test generated from it.
- **`folder_path`** — where the artifact *appears*. Renaming a folder must not
  change what course something belongs to, and moving a deck between folders
  must not orphan it from its course.

A course is displayed as **`PHCY 2109 · Pharmacogenomics for the Pharmacist`** —
code first because that is what students use, name second because a code alone
is unreadable to anyone else. When only one is known, that one is the label.

### Why a table and not a string

Three things a string cannot do, all of which have already bitten:

1. **Renaming.** "PHCY 2109" → "Pharmacogenomics" today orphans every artifact
   filed under the old spelling.
2. **Two spellings of one course.** `Pharmacy`, `Pharmacology` and `PHCY 2109`
   are three names for one thing in this student's workspace right now.
3. **Verified vs guessed.** A string cannot record *how* the association was
   made. The whole design turns on that distinction.

## 3. Schema

```sql
create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  code        text,
  name        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint courses_need_a_label check (coalesce(code, '') <> '' or coalesce(name, '') <> '')
);
```

**A course may have a code, a name, or both — at least one must exist.** A trade
course may have only a name; a lecture course is often known only by its code
until the student types the rest. Requiring both would make this unusable for
half the fields this product serves — the field-agnostic rule applied to a
schema.

One nullable `course_id` on each thing that can belong to a course:
`library_sources`, `library_documents`, `study_decks`, `study_artifacts`. All
`on delete set null`, never cascade: deleting a course must not delete a
semester of notes. The artifact survives and becomes unassociated, which is
recoverable; the alternative is not.

## 4. No backfill

**Nothing is seeded and nothing is auto-associated.**

An earlier draft created one course per distinct `calendar_events.course`. That
was wrong: those strings may be imports, duplicates, or labels an earlier model
generated. A seeded row is indistinguishable, once written, from one the student
created — so a table meant to hold *verified* identity would begin life full of
unverified guesses wearing the same clothes.

Because every row is created by the student, **"verified" is a property of the
table rather than a column on it**. No `unverified` flag exists, because nothing
in the system can produce an unverified row.

The calendar strings are not thrown away. The picker offers them as
**suggestions**, read live from `calendar_events` at pick time. A suggestion
becomes a course only when the student clicks it — at which point they have
verified it, and their own spelling is what gets stored.

Existing sources also stay unassociated. A lecture that has always been in
`Pharmacy` keeps appearing in `Pharmacy`; it simply has no course until asked.

## 5. Where a course is assigned

**A course pill in the reader / source header**, editable in place. It shows
either the assigned course or **"Assign course"**. That is the canonical writer.

Upload *may* offer an optional picker, or inherit a course from an already
verified course context, but **assigning a course must never become a mandatory
upload step**. Bulk assignment from the Library comes later.

## 6. What chat may and may not do

Chat may create or set a course **only when the student explicitly vouches for
it** — "this is for PHCY 2109", "put this in Contract Law". The student's actual
code and name are preserved as typed. **If it is ambiguous, chat asks.**

Chat must never infer a course identity from:

- the filename
- the document's contents
- topic overlap
- the existence of a folder with a similar name

This is the same vouching rule #446 applied to folders, raised to identity —
where the stakes are higher, because a folder is a place and an identity is a
claim.

## 7. Topic matching is retired as an authority

The word matcher **must never create, assign, move, or write a course
identity**. It may remain only as a clearly labelled *suggestion* that requires
the student to confirm.

This is a real demotion. Today `matchCourse` still decides the folder for an
item with no attached document at all. Under this design it may propose and
never decide.

## 8. Inheritance

Once a source has a verified `course_id`, **every note, flashcard deck, and test
generated from that source inherits that same id** — not a copy of its label,
the id itself.

That is what makes the two guarantees hold:

- **Renaming the course** updates every artifact's label at once, because they
  share an id rather than a copy of a string.
- **Moving folders** changes where things appear and nothing else. The course
  relationship does not live in the path, so a path change cannot break it.

The precedence ladder gains its missing rung:

1. a folder/course selected in the UI
2. a folder/course named in the student's own message
3. **the source's verified `course_id`** ← this
4. the source's existing folder
5. unfiled

Rungs 3 and 4 differ in kind: a `course_id` gives the artifact a *course*, the
folder gives it a *place*. When rung 3 fires the artifact gets both — the course
by identity, the folder from the course's own display label.

## 9. What is built, and what is not

**Built and merged (#446):** rungs 1, 2, 4, 5; the vouching rule for folders;
the source-attached distinction that stops an unsorted document being guessed at.

**This PR:** the schema and this design. No application code reads or writes
`course_id` yet, so merging and applying changes no behaviour.

**Not built yet**, in the order it should be:

1. The course pill in the reader/source header — create, assign, clear.
2. Inheritance at creation: notes, decks and tests copy the source's `course_id`.
3. Study and Library labels rendered from the course, `CODE · Name`.
4. The chat verbs, gated by the vouching rule, asking when ambiguous.
5. Demoting `matchCourse` to a confirm-only suggestion.
6. Library bulk assignment.
