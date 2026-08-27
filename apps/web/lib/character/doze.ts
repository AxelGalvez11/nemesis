// When the character falls asleep.
//
// Owner, 2026-08-26: *"bloub has nice animations called burst, sleep, thinking, i want those"*.
// `sleep` is in the catalogue and always has been; what it never had is a moment when it is TRUE.
// This is that moment, and it is arithmetic so it can be checked without waiting two minutes in
// front of a browser.
//
// 🔴 THE THREE ACTIVITIES WITH NO PRODUCER ARE A KNOWN, NAMED GAP. `stations.ts` says so in its own
// comments: `retrieving`, `ingesting` and `arrived` are rows nothing can reach. Adding a row to
// that table is the easy half; the half that makes it real is a fact on a surface. So this file
// exists rather than a fourth unreachable row.

/**
 * How long nothing has to happen before the character dozes off.
 *
 * 🔴 MINUTES, NOT SECONDS, AND THE RISK IS ENTIRELY ON ONE SIDE. Too long and a learner never sees
 * it, which costs nothing. Too short and a character falls asleep while somebody is READING, which
 * is the commonest thing they do on this surface and the one moment the character should look
 * present. Reading a page of a lesson takes well over a minute and involves no pointer, no key and
 * no turn — so anything under about that is a character that sleeps through the actual work.
 */
export const DOZE_AFTER_MS = 150_000;

/** How long a nudge keeps it awake before the clock starts again. Same number, stated once. */
export const WAKE_MS = DOZE_AFTER_MS;

export interface DozeInput {
  /** Milliseconds since the learner last did anything: moved, typed, or asked for something. */
  readonly idleMs: number;
  /**
   * Nemesis is doing something — a turn, a bring-up, a search.
   *
   * 🔴 IT OUTRANKS THE CLOCK ABSOLUTELY. A character asleep while the thing it was asked for is
   * being worked on is not a quiet character, it is a broken one: the learner is waiting on a
   * reply and the only thing on screen says nobody is home.
   */
  readonly working: boolean;
  /**
   * The learner is looking at something read-only, or the character is hidden.
   *
   * Nothing has happened by definition, so the clock would run out every time.
   */
  readonly away: boolean;
}

export function isDozing({ idleMs, working, away }: DozeInput): boolean {
  if (working || away) return false;
  return idleMs >= DOZE_AFTER_MS;
}
