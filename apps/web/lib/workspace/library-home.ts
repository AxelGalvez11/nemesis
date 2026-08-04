// The Library opens ON A NOTE — never a dashboard (owner 2026-08-04: "this
// isnt a NOTE, the 'home' is supposed to be a NOTE", pointing at
// https://obsidian.md/help/, whose landing page is literally a note titled
// "Home"). Bare /library resolves to:
//   1. a top-level-or-anywhere note named "Home", if the student has one —
//      they own the landing page the moment they make it;
//   2. otherwise the most recently edited note — still a note, never a grid
//      of cards;
//   3. otherwise (a brand-new empty account) the caller seeds a Home note
//      with LIBRARY_HOME_SEED, which the student can rewrite or delete like
//      any other note. Deleting it does NOT resurrect it — the seed is only
//      for accounts with zero notes.

import type { CloudLibraryNote } from "./library-tree";

/** True for a note named Home (any folder, any case, .md optional). */
export function isHomeNote(note: Pick<CloudLibraryNote, "path">): boolean {
  const leaf = note.path.split("/").pop() ?? note.path;
  return leaf.replace(/\.md$/i, "").trim().toLowerCase() === "home";
}

/** The note the bare /library URL shows. Null only for an empty library. */
export function pickLibraryLandingNote(notes: CloudLibraryNote[]): CloudLibraryNote | null {
  const named = notes.find(isHomeNote);
  if (named) return named;
  if (notes.length === 0) return null;
  // updatedAt is ISO text, so string comparison IS date comparison; blanks
  // (preview fixtures) sort last, and the original order breaks ties.
  return notes.reduce((latest, note) => ((note.updatedAt || "") > (latest.updatedAt || "") ? note : latest));
}

/** First-run Home note, in the student's own hands from the first keystroke. */
export const LIBRARY_HOME_SEED = `Welcome to your Library — one connected wiki of everything you are learning. This page is a note like any other: click anywhere and start typing.

## Get started

- Make a note with New note in the sidebar.
- Import documents and Nemesis files them into organized topic pages, keeping the original file under Sources.
- Connect ideas by typing \`[[\` — pages link like a wiki.

## Around the Library

- Left: your folders, notes, and source files.
- Right: the outline of the page you are reading.
- Every folder is a page too — open one and it lists the notes inside it.
`;
