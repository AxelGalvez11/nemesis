---
name: nemesis-school-sync
description: "THE flagship workflow: sync the student's school world end-to-end. Sweep Blackboard + Outlook (read-only, via the school browser), capture new lectures/slides/attachments into the Library, then INTELLIGENTLY produce structured lecture notes and exam-grade flashcards from the new material, and update the semester graph, calendar, Home page, and ledger. Use when the student says 'sync my school', 'check blackboard/outlook', 'what's new in my courses', 'catch me up', or asks for their daily brief."
version: 1.1.0
metadata:
  hermes:
    tags: [school, sync, blackboard, outlook, lectures, notes, flashcards, daily-brief, pipeline, nemesis]
    related_skills: [school-portal, nemesis-import, nemesis-study-decks, nemesis-organize, nemesis-graph, nemesis-ledger, nemesis-email]
---

# School sync — the main loop

This is the product's core promise: the student logs into their portals ONCE (their
cookies live in the school browser), and from then on one command keeps their whole
academic world current — files captured, notes written, flashcards made, deadlines on
the calendar. You run the pipeline; the student just studies.

Portals have no APIs. The school browser IS the integration: navigate it read-only.

## Hard rules (before anything)

- **Read-only on portals.** Never submit, upload, mark-read, delete, or change settings
  on Blackboard/Outlook. You are a reader there.
- **Login walls and CAPTCHAs are the student's.** If a portal shows a login page or a
  CAPTCHA, STOP that portal's sweep and tell the student plainly: "Blackboard needs you
  to log in once in the browser panel — then say 'sync my school' again." Never ask for
  or type credentials.
- **When login walls block BOTH portals (session expired):** Do NOT skip the rest of
  the pipeline. You still need to (a) read the existing local state (graph.json, Home.md,
  Library) and report what is current, (b) write the state file with this attempt's
  timestamp as lastRun — prevents wasted re-attempts before the student logs in, and
  (c) log a ledger entry for the attempted sync (area: browse). If only ONE portal needs
  login, continue with the other — do not bail on both.
- **State file:** `~/Documents/Nemesis Library/.nemesis/school-sync.json` —
  `{ "lastRun": ISO, "seen": { "<stable item id or URL>": ISO } }`. Read it first;
  only process items NOT in `seen`; write it back at the end (read-merge-write).
- **Cap the batch.** Process at most 5 new lecture files' worth of notes+flashcards per
  run. If more are new, capture ALL files but queue the rest for the next sync and say
  so ("Captured 9 new files; made notes for the 5 most recent — run sync again for the
  rest.").
- Ledger-log every capture and every produced artifact (nemesis-ledger; sent/submitted
  always false). Batch lookups and page-reads in the same turn wherever possible.

## Phase 1 — Sweep (read-only)

Per the school-portal skill's navigation notes:
- **Blackboard** (https://blackboard.uthsc.edu/): for each course the student takes —
  new announcements, new files under Content/Course Documents (slides, PDFs, docx),
  assignment/exam entries with due dates.
- **Outlook web** (https://outlook.cloud.microsoft/mail/): new school emails since
  lastRun — sender, subject, gist; note attachments worth capturing (syllabi, slides,
  schedules). Triage per nemesis-email (read-only; never send).

Collect everything into one worklist before producing anything.

## Phase 2 — Capture

- Download each new file into `School/<Course>/Slides/` (lecture decks) or
  `School/<Course>/` (everything else). Keep original filenames; prefix with a date
  (`2026-07-11 — `) only when the original name has none.
- Announcements: append to `School/<Course>/Announcements.md` (date, title, one-line
  gist, link) — newest first.
- Email attachments worth keeping go the same way; note in the ledger which email they
  came from.

## Phase 3 — Produce (the intelligence; this is why students pay)

For each new lecture file (up to the batch cap), READ it and produce:

**A structured lecture note** at `<Course>/<Lecture name>.md`:
- `# <Lecture name>` + one-line "what this lecture is really about".
- `## Key concepts` — the ideas, not a slide-by-slide transcript.
- `## Drugs` — for pharmacy content: each drug with mechanism, dosing points, key
  adverse effects/interactions/monitoring, in tight bullets. Cite slide numbers like
  `(slide 14)` so the student can verify.
- `## Clinical pearls & exam-likely points` — what an examiner would ask.
- `[[wikilinks]]` to related existing notes (check what exists first; link, don't duplicate).

**A flashcard deck** per nemesis-study-decks (`Flashcards/<Course> — <Lecture name>.tsv`,
`# course: <Course>` on line 1): 8–15 exam-quality cards — application-level (mechanisms,
adverse effects, interactions, monitoring, dosing decisions), one concept per card, no
"what is X" filler. If a deck for this lecture already exists, ADD only genuinely new
cards.

**Vocabulary**: append new terms the lecture introduced to `Vocabulary.md` (one line
each, per nemesis-organize).

## Phase 4 — Record & report

- **Graph** (.nemesis/graph.json, per nemesis-graph): new/changed deadlines, exams,
  lectures, concepts — tag provenance (blackboard/outlook, date).
- **Calendar** (School/calendar.json): every date found (due dates, exams, events).
- **Home.md**: refresh "This week" and "Recent lectures" (per nemesis-organize).
- **Ledger**: one line per real action.
- **Report to the student, plain and short**: what's new (per course), what you made
  (notes/decks by name), what deadlines changed, what's queued, and anything that needs
  them (a login, an ambiguous course mapping). Lead with the single most urgent thing.

## When there's nothing new

Say so in one line ("Swept Blackboard and Outlook — nothing new since Friday 9pm."),
update lastRun, and stop. Never manufacture work.
