// Where a note sits when the student has arranged the list by hand.
//
// Owner 2026-07-28: "the library notion like functionality". Dragging a note
// INTO and OUT OF a folder already worked (useRowDrag); what was missing is
// dragging it up and down to a place you chose. The library sorted only by
// title or date, so a rearrangement had nowhere to live and would have snapped
// back on the next load.
//
// FRACTIONAL POSITIONS, so a move writes ONE row.
//
// Dropping between two notes takes the midpoint of their positions, which means
// a reorder is a single UPDATE no matter how long the list is. The obvious
// alternative — renumber the whole folder 1..N on every drop — writes N rows,
// and a half-applied batch leaves the list in an order the student did not
// choose. A wrong order is a worse failure than the one this trades against:
// midpoints eventually run out of floating-point room, but only after ~50
// consecutive drops between the SAME TWO notes, and `needsRenumber` catches
// that so the folder can be renumbered once, deliberately.
//
// POSITIONS ARE PER-FOLDER. The tree groups notes by folder before sorting
// (library-sync.ts), so two notes in different folders may hold the same number
// and it means nothing. Treating positions as globally comparable is a bug that
// only appears once someone drags across folders, which is why the tests say so
// out loud.

/** Gap below which midpoints stop being reliably distinct — renumber instead. */
export const MIN_POSITION_GAP = 1e-6;

/** Spacing used when handing out fresh positions to a whole folder. */
export const POSITION_STEP = 1;

/**
 * The position for a note dropped between `prev` and `next`, where either may
 * be null at the ends of the list.
 *
 * Head and tail step by a whole unit rather than halving toward an edge, so
 * repeatedly dragging things to the top does not squeeze positions toward zero.
 */
export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return 0;
  if (prev === null) return (next as number) - POSITION_STEP;
  if (next === null) return prev + POSITION_STEP;
  return (prev + next) / 2;
}

/** True when `prev` and `next` are too close to place anything between them. */
export function needsRenumber(prev: number | null, next: number | null): boolean {
  if (prev === null || next === null) return false;
  return Math.abs(next - prev) < MIN_POSITION_GAP;
}

/** Fresh, evenly spaced positions for one folder's notes, in the given order.
 *  Used after `needsRenumber`, and to give an unordered folder its first
 *  positions. */
export function renumbered(paths: readonly string[]): Array<{ path: string; position: number }> {
  return paths.map((path, index) => ({ path, position: index * POSITION_STEP }));
}

/** A note as the manual comparator sees it. */
export interface OrderedNote {
  title: string;
  /** Null for anything never dragged — see compareManual. */
  position?: number | null;
}

/**
 * Order two notes by hand-arranged position.
 *
 * NULL SORTS LAST, tie-broken by title. This is the rule that matters most and
 * the one with a precedent: notes arrive from the web app, from chat, and from
 * the recorder, none of which set a position, so most of a real library is null
 * on the day this ships. Sorting null FIRST would bury the arrangement the
 * student made under every note they have ever created; sorting it last leaves
 * their arrangement on top and everything else in the familiar A–Z order
 * underneath. It also matches what compareNotes already does with a missing
 * timestamp, so the list behaves consistently across sort modes.
 */
export function compareManual(a: OrderedNote, b: OrderedNote): number {
  const ap = a.position ?? null;
  const bp = b.position ?? null;
  if (ap === null && bp === null) return a.title.localeCompare(b.title);
  if (ap === null) return 1;
  if (bp === null) return -1;
  return ap - bp || a.title.localeCompare(b.title);
}

/**
 * The position a note needs to land at `toIndex` within `folderNotes`, given
 * the list as it is currently ordered.
 *
 * `folderNotes` must already be in display order and must EXCLUDE the note
 * being moved — the caller removes it first, so "drop at index 2" means "become
 * the third note", which is what the finger did.
 */
export function positionForDrop(
  folderNotes: readonly OrderedNote[],
  toIndex: number,
): { position: number; renumber: boolean } {
  const clamped = Math.max(0, Math.min(toIndex, folderNotes.length));
  const before = clamped > 0 ? (folderNotes[clamped - 1]?.position ?? null) : null;
  const after = clamped < folderNotes.length ? (folderNotes[clamped]?.position ?? null) : null;
  return { position: positionBetween(before, after), renumber: needsRenumber(before, after) };
}
