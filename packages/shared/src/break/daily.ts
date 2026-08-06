// Daily puzzle selection for the Break page (owner 2026-08-04: a "brain
// break" page with NYT-style daily games). Everything here is deterministic:
// the same local calendar day gives every student the same puzzle, with no
// server round-trip and no model cost.
//
// Date arithmetic parses the "YYYY-MM-DD" key itself (both sides land on UTC
// midnight, so the difference is exact whole days in any timezone). The key
// is BUILT from local fields — the puzzle flips at the student's midnight,
// not at UTC midnight.

/** "2026-08-04" from the machine's local calendar day. */
export function localDateKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Long display form ("August 4, 2026") without re-parsing through UTC. */
export function dateKeyLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return dateKey;
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/** Break launched 2026-08-05; that day is puzzle #1. Clamped to 1 so a clock
 *  set before launch still gets a valid puzzle instead of a negative index. */
export const BREAK_EPOCH_KEY = "2026-08-04";

export function breakDayNumber(dateKey: string): number {
  const epoch = Date.parse(`${BREAK_EPOCH_KEY}T00:00:00Z`);
  const day = Date.parse(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(day)) return 1;
  return Math.max(1, Math.round((day - epoch) / 86_400_000) + 1);
}

/** FNV-1a, 32-bit — a stable string hash (no Math.random anywhere: reloads
 *  and other devices must agree on the day's puzzle). */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — tiny seeded PRNG, plenty for shuffling game boards. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which puzzle a game shows today. Hashing gameId+date de-correlates the
 *  games (they don't all cycle in lockstep through their banks). */
export function dailyIndex(dateKey: string, gameId: string, bankSize: number): number {
  if (bankSize <= 0) return 0;
  return hashSeed(`${gameId}:${dateKey}`) % bankSize;
}

/** Puzzle-instance key ("more than one puzzle per day", owner 2026-08-04).
 *  n=0 IS the daily — it keeps the plain dateKey so every existing
 *  selection formula and storage key stays byte-identical. n>0 gets a
 *  suffix, which is all a caller needs to hash or store an "extra" puzzle
 *  through the exact same formulas as the daily. */
export function extraKey(dateKey: string, n: number): string {
  return n > 0 ? `${dateKey}#${n}` : dateKey;
}

/** Step used to jump around a fixed-length, day-walked list (Wordle's
 *  answer list today) for puzzle n>0. 137 is prime, so as long as a bank's
 *  length isn't a multiple of 137 — checked in break-content.test.ts — the
 *  walk visits every index exactly once before it ever repeats, meaning
 *  extras 1..length-1 are guaranteed to differ from the day's own answer. */
const EXTRA_WALK_STEP = 137;

/** Generalizes "day number walks the list" (see breakDayNumber) to extra
 *  puzzles: n=0 reproduces today's plain walk exactly; n>0 jumps further
 *  around the same list so extras spread out instead of clustering. */
export function extraWalkIndex(dateKey: string, n: number, length: number): number {
  if (length <= 0) return 0;
  return (breakDayNumber(dateKey) - 1 + EXTRA_WALK_STEP * n) % length;
}

/** Fisher–Yates on a copy — callers keep their original order. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const random = mulberry32(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}
