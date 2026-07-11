---
name: nemesis-organize
description: Organize the student's Nemesis workspace — notes, folders, flashcard decks, and lecture recordings. Move, rename, group, tidy, and clean up files in the Library so Study/Library/Recorder stay orderly. Use when the student says "organize/clean up/tidy/sort/rename/group/file my notes/decks/folders/recordings/library".
version: 1.0.0
metadata:
  hermes:
    tags: [organize, library, notes, folders, flashcards, decks, recordings, study, nemesis, cleanup]
---

# Organize the Nemesis workspace

The whole workspace is plain files on the student's Mac, so you organize it the same way a
person would in Finder — by moving, renaming, and grouping files with the terminal. The app
reads these folders live, so your changes show up in the Library, Study, and Recorder pages.

Use this skill when the student asks you to organize, clean up, tidy, sort, rename, group,
or file their notes, folders, flashcard decks, or recordings.

## The layout (memorize this)

```
~/Documents/Nemesis Library/                 ← the vault (notes + decks live here)
  <Folder>/<Note>.md                         ← notes; a subfolder is a "folder" in the UI
  Flashcards/<Deck name>.tsv                 ← one flashcard deck per file (Study page)
  Lectures/<Lecture note>.md                 ← auto-saved recording notes
  School/<Course>/…                          ← files captured from Blackboard/Outlook
  School/calendar.json                       ← the Calendar page's events
~/Documents/Nemesis Recordings/<name>.webm   ← the actual audio recordings
```

- **Notes** are Markdown (`.md`). The subfolder a note sits in IS its "folder" in the
  Library sidebar. Moving a note between folders = moving the file between subdirectories.
- **Flashcard decks** are tab-separated `.tsv` files in `Flashcards/`. The file name is the
  deck name. The first line `# course: <Course>` is what groups decks into a **section** on
  the Study page. See the `nemesis-study-decks` skill for the exact file format.
- **Recordings** are audio files in `~/Documents/Nemesis Recordings/`; each usually has a
  companion note in `Lectures/` that references it by filename (`*Audio: <file>*`).

## Golden rules

1. **Look before you touch.** List the relevant folder first (`ls`, `find`) and tell the
   student the plan — what you'll move/rename/delete and where — before doing it. For any
   delete, name the exact files and get a yes.
2. **Move to Trash, don't hard-delete.** Prefer the app's trash (or `mv` into a
   `~/.Trash`-style holding folder) over `rm` so nothing is unrecoverable. Never `rm -rf`.
3. **Keep pairs together.** When you move or rename a recording, move/rename its companion
   `Lectures/` note too, and keep the `*Audio: <file>*` marker line pointing at the right
   filename — otherwise the Recorder page can't match them.
4. **Don't rewrite content while organizing.** Organizing = moving/renaming/grouping files.
   Do not edit the inside of a note or a card as a side effect of tidying.
5. **Quote paths** — these folders have spaces (`Nemesis Library`). Always quote or escape.
6. **Report what you did** in plain English: a short list of what moved where, what was
   renamed, what (if anything) went to Trash.

## Common jobs

### Group notes into folders by course/topic
List loose notes at the vault root, propose a folder scheme (e.g. `Pharmacology/`,
`Cardiology/`, `Infectious disease/`), create the folders (`mkdir -p`), and `mv` each note
in. Confirm the scheme with the student first if it isn't obvious.

### Regroup flashcard decks into sections
The Study page's section headers come from each deck's `# course:` line. To move a deck to a
different section, edit ONLY that first line. To rename a deck, rename the `.tsv` file. To
merge two decks, append one file's card lines (not its `# course:` line) onto the other,
then Trash the empty one. Verify the result is still valid TSV (a real TAB between front and
back, `# course:` on line 1).

### Rename / move / retire recordings
Rename the audio file in `Nemesis Recordings/` AND its `Lectures/` companion note together,
fixing the `*Audio: <file>*` marker. To retire an old recording, move both to Trash after
confirming with the student.

### Clean up duplicates and stray files
Find obvious duplicates (same title with ` 2`, `.md.md`, empty files) and propose removing
them. Always list them for the student before removing.

## After organizing

Tell the student to glance at the Library / Study / Recorder page — it refreshes when the
window regains focus, so their reorganized workspace shows up right away. If something looks
off, you can still see the true state by listing the folders again.
