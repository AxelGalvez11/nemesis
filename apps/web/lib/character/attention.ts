// One clock for what the character is doing with its attention: watching you, or wearing a face.
//
// 🔴🔴 THE BUG THIS EXISTS TO FIX IS THAT THERE WERE TWO CLOCKS, AND NOBODY HAD MADE THEM AGREE.
// Owner, 2026-08-30: *"during expressions the mouse still moves the mascot eyes"*.
//
//   the montage's clock   `montageFace` walked the chosen list on a five-second floor, from the
//                         moment the character came to rest.
//   the attention clock   `absorbedAt` handed the pointer back for six seconds in every eighteen.
//
// Both were correct on their own and nothing ever lined them up, so the two ran in every
// combination — and the combination that was on screen two thirds of the time was **an expression
// with the cursor driving its eyes**, which is the one that had to be avoided. The character was
// wearing a face for 100% of its rest and it read as wearing none, because in the majority case
// the pointer overrode the very thing an expression is made of.
//
// 🔴 THIS IS THE FIFTH REPORT ABOUT THE SAME SURFACE AND THE FIRST STRUCTURAL ANSWER. The others
// were numbers: 20s/5s became 18s/6s, a nine-second hold became five, a gate in front of the
// stretch was removed. `gaze.ts` even carries the warning against exactly that — *"four narrowings
// of the `?` mark were each a true statement about when it was wrong and none was why it was
// wrong"*. Tuning a share cannot fix an overlap. So the two clocks become one, and the one thing
// it guarantees is the thing that was asked for:
//
//   **WATCHING YOU AND WEARING A FACE ARE MUTUALLY EXCLUSIVE.** One clock, so they cannot overlap.
//
// 🔴 AND IT IS THE SAME ANSWER THE FRONT PAGE GOT ON THE SAME DAY (`landing/lib/character/
// rhythm.ts`). Two renderers, two engines, one rule — deliberately, because it is the owner's rule
// about the character and not an implementation detail of either.
//
// PURE. No React, no DOM, no clock of its own: it answers for whatever instant it is handed, so a
// test can ask what the character is doing at any moment of an hour-long session.

import { holdFor, resolveMontage } from "./montage";

/**
 * How long the character watches the pointer between two faces.
 *
 * 🔴 IT SETS THE SHARE TOGETHER WITH THE ENTRIES, NOT ON ITS OWN, and that is a change in kind
 * from the fixed 18s/6s it replaces. Each face now gets ITS OWN length — `holdFor` — because a
 * loop that is cut off part way through is, on screen, the held face it exists to replace: the
 * longest, `gaze-searching`, is a playlist of six poses running 16.8 seconds. So the character is
 * absorbed for exactly as long as the thing it is absorbed in takes, and this is the gap between.
 *
 * 🔴 NINE SECONDS PUTS THE SPLIT AT 53/47 in favour of following, measured over the owner's own
 * default of twenty-four entries: 216s of watching against 192.9s of faces, in a round of 409s.
 * Two things are being balanced and both come from him. He has reported *"not following the mouse
 * at all"* three times, which is why following keeps the majority; and he has reported the
 * expressions not landing four times, which is why it is a bare one. The old split gave faces a
 * third of the time and drowned all of it under the cursor.
 */
export const FOLLOW_MS = 9_000;

/** Watching the pointer, wearing nothing but the resting face. */
export interface Following {
  readonly kind: "follow";
}

/** Absorbed in one montage entry, with the cursor out of it entirely. */
export interface Absorbed {
  readonly kind: "absorbed";
  /** The animation id to play — a movement loop or a held feeling, from the learner's own list. */
  readonly entry: string;
  /** Which stretch of this pass it is. Lets a caller vary anything else it wants to. */
  readonly round: number;
}

export type Attention = Following | Absorbed;

const FOLLOWING: Following = { kind: "follow" };

/**
 * What the character is doing `ms` into an unbroken rest.
 *
 * 🔴 `ms` IS TIME SINCE IT CAME TO REST, NOT WALL TIME, and that is deliberate: it means the
 * character always WATCHES YOU FIRST after anything happens. Nemesis finishes an answer, the
 * character comes back to rest looking at you, and only drifts off into its own head once nine
 * seconds have passed with nothing going on. The old attention clock was absolute, so the
 * character could just as easily finish an answer by staring into space.
 *
 * 🔴 ADDRESSED, NOT ADVANCED — the same construction as `montageFace` and the blink schedule.
 * Asking about a moment an hour in costs the same as asking about the first second, nothing has to
 * be ticked, and two characters mounted together do not march in step (see `seed`).
 */
export function attentionAt(input: {
  readonly ms: number;
  /** The learner's own picks, or nothing for the default set. */
  readonly chosen?: readonly string[] | null;
  /** Shifts which entry a character starts on, so two on one page differ. */
  readonly seed?: number;
}): Attention {
  const { ms, chosen, seed = 0 } = input;
  if (!Number.isFinite(ms) || ms < 0) return FOLLOWING;
  const entries = resolveMontage(chosen);
  const n = entries.length;
  if (n === 0) return FOLLOWING;

  const holds = entries.map(holdFor);
  // One pass is every entry once, each preceded by its own stretch of watching. Taking the
  // remainder against the pass is what keeps this constant-cost however long the session runs.
  const pass = n * FOLLOW_MS + holds.reduce((a, b) => a + b, 0);
  let left = ms % pass;
  for (let round = 0; round < n; round += 1) {
    if (left < FOLLOW_MS) return FOLLOWING;
    left -= FOLLOW_MS;
    // 🔴 THE SEED ROTATES THE LIST, IT DOES NOT OFFSET THE CLOCK. Offsetting time would drop a
    // character halfway through some loop on its very first frame; rotating starts it cleanly on a
    // different entry, which is all the seed was ever for. `pass` is a sum over every entry, so it
    // is the same whichever rotation is in use and the walk always consumes exactly one pass.
    const at = (round + seed) % n;
    if (left < holds[at]!) return { kind: "absorbed", entry: entries[at]!, round };
    left -= holds[at]!;
  }
  // Unreachable while the walk consumes exactly `pass`; following is the safe answer if it ever is.
  return FOLLOWING;
}
