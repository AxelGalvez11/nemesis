// Finding a note on the phone, by name AND by meaning.
//
// The Library search field has always filtered on title and path only — not even
// the note's text. So a student who wrote a page about first-pass metabolism and
// titled it "Lecture 6" could not find it by typing what it was about, and the
// semantic index built for exactly that question was unreachable from this device.
//
// Both kinds of match are kept, in this order, and the order is the point:
//   1. Name matches, which are instant, work offline, and are what someone typing
//      a title they remember expects to see at the top.
//   2. Meaning matches from the index, appended — never reordering the first kind.
// A meaning match that is ALSO a name match is not listed twice.
//
// The name filter never waits on the network. A slow or failed lookup costs the
// second group and nothing else, so the field behaves exactly as it does today
// while the answer is in flight.
//
// PURE.

export interface FindableNote {
  path: string;
  title: string;
}

export interface FindResult<T extends FindableNote> {
  notes: T[];
  /** How many of them were found ONLY by meaning — what the count line reports,
   *  because "4 results" is misleading when two of them contain none of the words
   *  the student typed. */
  byMeaning: number;
}

/** Does the typed text appear in this note's title or its folder path? PURE. */
export function matchesName(note: FindableNote, needle: string): boolean {
  const lower = needle.toLowerCase();
  return note.title.toLowerCase().includes(lower) || note.path.toLowerCase().includes(lower);
}

/**
 * The rows to show for `query`: name matches first, then any note the semantic
 * index returned that the name filter missed, in the order the index ranked them.
 *
 * `semanticPaths` is expected to be strongest-first. Paths that name no note in
 * `notes` are dropped rather than faked — the index can briefly outlive a note
 * that was just deleted or moved on another device, and a row that opens nothing
 * is worse than a row that is missing. PURE.
 */
export function findNotes<T extends FindableNote>(
  notes: readonly T[],
  query: string,
  semanticPaths: readonly string[] = [],
): FindResult<T> {
  const needle = query.trim();
  if (!needle) return { byMeaning: 0, notes: [...notes] };

  const named = notes.filter((note) => matchesName(note, needle));
  const takenPaths = new Set(named.map((note) => note.path));

  const byPath = new Map(notes.map((note) => [note.path, note]));
  const meaning: T[] = [];
  for (const path of semanticPaths) {
    if (takenPaths.has(path)) continue;
    const note = byPath.get(path);
    if (!note) continue;
    takenPaths.add(path);
    meaning.push(note);
  }

  return { byMeaning: meaning.length, notes: [...named, ...meaning] };
}

/** The line above the list. Says plainly when some rows matched no typed word.
 *  PURE. */
export function findSummary(total: number, byMeaning: number): string {
  const results = `${total} result${total === 1 ? "" : "s"}`;
  return byMeaning > 0 ? `${results} · ${byMeaning} by meaning` : results;
}
