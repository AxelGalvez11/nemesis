// Everything the character can be, in one place.
//
// 🔴 ONE DOOR, AND THAT IS THE WHOLE POINT OF THIS FILE (owner 2026-08-25: *"i need one
// shared layer and engine"*). Three sets of work arrive here — twenty-three gaze patterns
// measured off a reference, sixteen feelings that actually look like their names, and ten
// routines that change the body — and downstream there is no way to tell which is which.
// A surface asks for `"happy"` or `"burst"` or `"gaze-searching"` through the same call,
// gets the same kind of thing back, and morphs between any two of them.
//
// The alternative was two engines behind one coat of paint. It would have shipped sooner
// and it would have meant every future change made twice, in two vocabularies, with two
// sets of bugs.

import { ANIMATIONS as GAZE_ANIMATIONS } from "./animations";
import { FACES as GAZE_FACES } from "./faces";
import { EXPRESSIONS, EXPRESSION_ANIMATIONS } from "./expressions";
import { ROUTINES, ROUTINE_FACES } from "./routines";
import type { Animation, Face } from "./types";

export const FACES: readonly Face[] = [...GAZE_FACES, ...EXPRESSIONS, ...ROUTINE_FACES];

export const ANIMATIONS: readonly Animation[] = [
  ...EXPRESSION_ANIMATIONS,
  ...ROUTINES,
  ...GAZE_ANIMATIONS,
];

export const FACE_BY_ID: ReadonlyMap<string, Face> = new Map(FACES.map((f) => [f.id, f]));
export const ANIMATION_BY_ID: ReadonlyMap<string, Animation> = new Map(
  ANIMATIONS.map((a) => [a.id, a]),
);

/**
 * 🔴 A COLLISION HERE IS SILENT AND IT IS NOT HYPOTHETICAL. Both other sets shipped with an
 * `idle` and a `thinking`; building the map from a concatenated list means the last one
 * quietly wins, and the symptom is not an error but a surface playing the wrong animation
 * for a reason nobody can see. Checked at load rather than in a test, because the thing
 * that introduces a collision is usually a re-import of the reference, which is a script
 * run and not a code change.
 */
if (FACE_BY_ID.size !== FACES.length || ANIMATION_BY_ID.size !== ANIMATIONS.length) {
  const twice = (ids: readonly string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
  throw new Error(
    `avatar catalogue: repeated ids — faces ${twice(FACES.map((f) => f.id)).join(", ") || "none"}; animations ${twice(ANIMATIONS.map((a) => a.id)).join(", ") || "none"}`,
  );
}

/** Every animation names a face that exists. The same check, for the same reason. */
{
  const missing = ANIMATIONS.flatMap((a) =>
    a.steps.filter((s) => !FACE_BY_ID.has(s.face)).map((s) => `${a.id} → ${s.face}`),
  );
  if (missing.length > 0) {
    throw new Error(`avatar catalogue: animations name faces that do not exist — ${missing.join(", ")}`);
  }
}
