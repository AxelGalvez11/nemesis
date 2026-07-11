---
name: nemesis-import
description: Migrate a student's existing school life into the Library — agent-led, propose-then-execute, never manual labor
---

# Importing the student's existing world

Posture: the student should never do work you can do. You find, you fetch, you convert,
you file. They approve. Copy, never move; never delete originals. Log every batch in the
activity ledger (nemesis-ledger). Update the semester graph (nemesis-graph) after ingest.

## 1. Local discovery — "Find my school files"
Search ONLY these locations (never the whole disk):
`~/Documents`, `~/Desktop`, `~/Downloads`, and cloud-synced folders under
`~/Library/CloudStorage/` (OneDrive-*, GoogleDrive-*).
Look for pdf/pptx/docx/md whose names or paths suggest coursework (course codes like
"PHCY 1205", words like syllabus, lecture, slides, exam, notes; modified within the
current school year). Then:
1) PROPOSE: show a short summary (counts by course + a few example filenames) and ask
   which to bring in.
2) EXECUTE on approval: copy into the right course folders in the Library
   (`<Course>/Slides`, `<Course>/Syllabus`, `<Course>/Notes`, else `Imports/`).
macOS may show one-time permission dialogs on first access — tell the student that's
Apple asking, and it's expected.

## 2. Anki — read their real collection, keep their history
Anki stores everything locally at
`~/Library/Application Support/Anki2/<profile>/collection.anki2` (SQLite).
1) Ask the student to quit Anki first. 2) COPY the file to a temp path — never open the
original. 3) Use the `sqlite3` CLI (ships with macOS) to read decks, notes, cards:
- decks/notetypes live in JSON columns of `col` (older) or `decks`/`notetypes` tables (newer)
- `notes.flds` fields are separated by the 0x1F unit-separator character
- `revlog` holds review history — use recency/lapses per card to seed a rough mastery
Write each Anki deck as a Nemesis deck `.tsv` in `Decks/`, note the seeded mastery in the
graph, and report exactly how many decks/cards came over. If the schema defeats you,
fall back to asking for a File → Export `.apkg` and say why.

## 3. Quizlet — fetch their sets from the site
The student signs into quizlet.com in YOUR browser (same as Blackboard — their login,
their machine). Then, one set at a time from their library:
- Prefer each set's built-in "Export text" (tab-delimited) — it matches the deck format
  exactly; otherwise read the terms from the page.
- ONLY sets they own or can view. Polite pacing; no hammering.
- If a CAPTCHA or verification appears, STOP and ask the student to click it themselves,
  then continue. You never solve CAPTCHAs.

## 4. Notes from Notion / Google Docs / Word / OneNote
- Notion: their Export (Markdown & CSV zip) → unzip, strip the hash suffixes Notion adds
  to filenames, file the `.md` into course folders.
- Google Docs: download as Markdown or `.docx` (or walk their Drive in the browser and
  download what they point at).
- Word `.docx`: convert with macOS `textutil -convert html` then to markdown text for
  notes; keep the original beside it.
- OneNote: no clean export exists — open OneNote web in the browser and save pages out,
  or accept PDFs. Be honest that this one is slower; Microsoft's fault, not theirs.

## Rules
- Propose before big batches; execute without re-asking for the approved batch.
- Copies only. Originals untouched. Everything logged. `sent`/`submitted` stay false.
- After any import: refresh graph objects (courses, concepts) so Today reflects it.
