// The front door's rotating "Learn ‹subject›" heading — the subject list and the fade timings,
// pulled out as a pure module so LearnHeading.tsx (React + reanimated) stays a dumb renderer and
// the schedule itself can be Deno-tested with no RN/reanimated runtime in the loop.
//
// 🔴 THE SUBJECT LIST IS COPIED, NOT IMPORTED. The web's own list lives in
// apps/web/components/workspace/learn/learn-heading.tsx (LEARN_SUBJECTS, ~line 48) — nine
// subjects across nine faculties, the visible proof of the standing rule that Nemesis serves any
// discipline (CLAUDE.md, owner 2026-07-27: "the design test for anything is whether it works for
// a law student AND a mechanical engineering student"). That file is a "use client" component, and
// src/learn/web.ts's own header bans crossing anything but a pure, React-free sibling module — so
// the list is copied here by hand rather than reached for. Keep the two in sync if the web list
// ever changes; there is no build-time link between them.
export const LEARN_SUBJECTS = [
  "Calculus",
  "Biology",
  "Contract Law",
  "Thermodynamics",
  "Art History",
  "Macroeconomics",
  "Spanish",
  "Data Structures",
  "Anatomy",
] as const;

/** How long a subject holds once it has fully arrived. */
export const HOLD_MS = 3200;

/**
 * The outgoing word's fade.
 *
 * 🔴 THE WEB'S NUMBERS, ON PURPOSE. `learn-heading.tsx` on the web fades out over 700ms and in over
 * 1800ms, and its own comment records the owner slowing it down twice ("make it even slower and
 * smoother", then "still too fast"). A first cut here ran the phone at 180/420 on the theory that a
 * heading above a keyboard is glanced at, not read; that is a guess against a preference the owner
 * has already stated, so the phone keeps the web's pace until they say otherwise.
 */
export const FADE_OUT_MS = 700;

/** The incoming word's fade — slower than the exit, because arrival is the part anyone actually
 *  watches (the web's own asymmetry). */
export const FADE_IN_MS = 1800;

/** Total time one subject occupies the slot: the hold, plus both halves of the fade. The interval
 *  a caller should re-trigger the swap on. */
export const CYCLE_MS = HOLD_MS + FADE_OUT_MS + FADE_IN_MS;

/** index -> next index, wrapping. Its own function so the wrap math has one tested home rather
 *  than being inlined as `(i + 1) % LEARN_SUBJECTS.length` at every call site, where a typo
 *  against the wrong list's length would fail silently (an out-of-range index just renders
 *  `undefined`, not a crash). */
export function nextSubjectIndex(current: number): number {
  return (current + 1) % LEARN_SUBJECTS.length;
}
