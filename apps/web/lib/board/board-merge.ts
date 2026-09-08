// Keeping what the learner started while a saved canvas was still loading.
//
// 🔴🔴 THIS EXISTS BECAUSE A DROPPED FILE WAS SILENTLY THROWN AWAY. Owner, 2026-09-07, of a canvas
// he had just made: *"I dropped in the sources ... and it pretty much just stayed on the landing
// canvas"*.
//
// A saved board renders while `getBoard` is still in flight. The landing is up, and the landing
// takes drops and starts threads. When the fetch resolved, `board-provider.tsx` replaced every
// piece of state with the stored document — so the file went, `sources.length` fell back to zero,
// and the landing returned. The parse of that file was still running and wrote into a source that
// no longer existed. Nothing on screen said any of this; it read as "the drop did nothing".
//
// 🔴 THE STORED COPY WINS ON A CLASH, AND THERE IS NO REAL CLASH TO LOSE. Ids are minted with
// `crypto.randomUUID`, so a local id cannot collide with a stored one. The check is here so this
// stays correct if that ever stops being true, and so the rule is stated rather than assumed.
//
// 🔴 ORDER IS STORED FIRST, THEN LOCAL. What was already on the canvas keeps the positions and the
// numbering it had; the new arrival goes on the end, which is where a new arrival belongs and what
// keeps citation ids (`s1`, `s2`) pointing at the same documents as before the reload.
//
// PURE. No React, no I/O.

/** Anything with an id: a card, a source, a made thing. */
export interface Identified {
  readonly id: string;
}

/**
 * The stored list, plus anything the learner made locally that it has never heard of.
 *
 * 🔴 AN EMPTY LOCAL LIST RETURNS THE STORED ARRAY ITSELF, not a copy. This runs inside a `setState`
 * updater on the common path (nothing was started during the load), and returning a new array
 * every time would re-render every card on the board for no change.
 */
export function mergeLoaded<T extends Identified>(stored: readonly T[], local: readonly T[]): T[] {
  if (local.length === 0) return stored as T[];
  const known = new Set(stored.map((item) => item.id));
  const extra = local.filter((item) => !known.has(item.id));
  return extra.length === 0 ? (stored as T[]) : [...stored, ...extra];
}

/**
 * The ticks a loaded board should carry, keeping anything dropped during the load ticked.
 *
 * 🔴 A FILE DROPPED MID-LOAD ARRIVES TICKED, LIKE EVERY OTHER ARRIVAL. The stored tick list has
 * never heard of it, so seeding from that alone would leave the document in the panel and out of
 * every answer — the subtlest half of the same bug, because the file is visibly there.
 */
export function mergeTicks(storedTicks: readonly string[], localTicks: readonly string[], storedSourceIds: readonly string[]): string[] {
  const stored = new Set(storedTicks);
  const known = new Set(storedSourceIds);
  const extra = localTicks.filter((id) => !stored.has(id) && !known.has(id));
  return extra.length === 0 ? [...storedTicks] : [...storedTicks, ...extra];
}
