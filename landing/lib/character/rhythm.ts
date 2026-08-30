// The cycle: which state, which face, and whether he is watching you.
//
// 🔴 OWNER, 2026-08-30: *"when it's following the mouse, it should not be doing the expressions.
// So when he's doing expressions, he should be moving on its own, not tracking the mouse"*. That
// is a rule about a rotation, so it lives where the rotation does and `rhythm.test.ts` checks it
// over the whole thing rather than at one step.
//
// 🔴 IT WAS INSIDE `Mascot.tsx` AND CAME OUT SO IT COULD BE CHECKED, for the same reason `brow.ts`
// and `spin.ts` are separate: that file is a client component with a dev-time throw at module
// scope, and the rule is a pure function of one integer. Nothing about it changed on the way out
// except that it now returns `watching`.

import { BEATS, REST } from "./body";
import type { StateId } from "../bloub/states";

/**
 * All sixteen resting faces, in the gallery's own reading order. None were crossed out, and
 * none are affected by the circle rule: an expression moves the eyes, never the body.
 *
 * The ids are French because the vendored table is French, and renaming them here would mean
 * editing a vendored file — see the note about copying it unedited.
 */
export const FACES: readonly string[] = [
  "neutre", // Neutral
  "attentif", // Attentive
  "surpris", // Surprised
  "excite", // Excited
  "heureux", // Happy
  "hilare", // Laughing
  "colere", // Angry
  "triste", // Sad
  "effraye", // Scared
  "mefiant", // Suspicious
  "confus", // Confused
  "curieux", // Curious
  "fier", // Proud
  "timide", // Shy
  "blase", // Unimpressed
  "somnolent", // Sleepy
];

/**
 * The face he wears while he is watching you, and the only one he wears while watching.
 *
 * 🔴 IT IS THE ABSENCE OF AN EXPRESSION, WHICH IS THE OWNER'S RULE STATED AS DATA. *"When it's
 * following the mouse, it should not be doing the expressions."* Neutral is not one of the
 * fifteen taking a turn at the front — it is what is on his face when he has nothing else going
 * on, which is exactly the state in which watching somebody reads as watching them.
 */
export const WATCHING = "neutre";

/**
 * The fifteen he wears when he is not watching you.
 *
 * 🔴 DERIVED, so the two lists cannot drift apart. Writing the fifteen out again would mean a
 * face could be added above and silently never appear, or appear in both roles at once.
 *
 * 🔴 AND FIFTEEN AGAINST TWO BEATS IS ON PURPOSE, exactly as sixteen against two was. The two run
 * at co-prime lengths so the pairing only comes back round after thirty of them, several minutes
 * in. Nobody watches that long, which is the point: two visits to the top of the page do not see
 * the same thing.
 */
export const FEELINGS: readonly string[] = FACES.filter((face) => face !== WATCHING);

/** How long the character rests between beats. Owner's pacing, not a default. */
export const HOLD_SECONDS = 6;

/**
 * Where the cycle is up to, as one number: which state, which face, and whether he is watching
 * you or off in his own head.
 *
 * Odd steps beat and even steps rest, and the rests then alternate again between the two kinds,
 * so step `n` resolves with no stored pairing between any of the lists — which is what keeps this
 * a function of one number rather than a small state machine.
 *
 * 🔴 A BEAT IS NEVER WATCHING, AND SAYING SO HERE COSTS NOTHING BUT MEANS SOMETHING. `wink` and
 * `wide` are `baseFace: false`, so the renderer already refuses to steer them and hands the eyes
 * to the animation's own gaze. Naming it makes `watching` mean one thing — "the cursor is
 * driving his eyes right now" — rather than "we asked, and it may or may not have been honoured".
 */
export function beatAt(step: number): { state: StateId; face: string; watching: boolean } {
  if (step % 2 === 1) {
    return { state: BEATS[((step - 1) / 2) % BEATS.length]!, face: WATCHING, watching: false };
  }
  const rest = step / 2;
  if (rest % 2 === 0) return { state: REST, face: WATCHING, watching: true };
  return { state: REST, face: FEELINGS[((rest - 1) / 2) % FEELINGS.length]!, watching: false };
}
