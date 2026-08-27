// What shape the character is, and the rule that keeps it that shape.
//
// 🔴 THIS FILE WAS `circle.ts` AND THE RULE IN IT IS UNCHANGED — ONLY WHAT IT IS A RULE ABOUT.
// Read the two instructions in order, because the second is easy to misread as undoing the first:
//
//   2026-08-25: *"make it stay circle shaped only"*
//   2026-08-26: *"could you make the character, the mascot, a cube? instead of the circle?"*,
//               and, asked how far that goes, *"use squircle like in the github repo for bloub"*,
//               applied to the site as well as the app.
//
// The first was never really about circles. Watching the page run, the owner was objecting to the
// body CHANGING SHAPE while it played — an egg, then a hexagon, then a spray of dots — and
// "circle only" was the shape it happened to rest in at the time. The second changes the resting
// shape and says nothing about states that reshape, so the rule survives its own rename intact:
// **the body is one shape and stays that shape.** Every state this file refused, it still refuses.
//
// So `keepsTheCircle` is `keepsItsShape` and the checks inside it are untouched, to the line. If
// a future instruction really does mean "let it morph again", that is a change to the RULE and
// the whole of this file should go, rather than a shape being quietly added to `CYCLE`.
//
// 🔴 IT LIVES HERE, NEXT TO `brow.ts`, AND NOT IN `lib/bloub/`. That folder is jeremy-prt/bloub
// copied unedited so the site, the app and the phone stay in agreement about what a frame means;
// a rule of ours added into it would be the first divergence. This is our opinion ABOUT the
// vendored table, expressed by reading it.
//
// 🔴 AND IT IS A RULE, NOT A SECOND LIST. The obvious way to write this was a hand-maintained
// "these reshape" list beside the "these play" list, which is how the component carried it
// before — and a hand list can be wrong about the table it describes, silently, forever. Reading
// the table means the rule cannot drift from the engine even if the engine changes.
//
// It is pure and DOM-free so it can be tested, for the same reason `brow.ts` is.

import { STATE_BY_ID, type StateId } from "../bloub/states";

/**
 * Does this state leave the body the shape it rests in?
 *
 * Four ways a state can stop being one, and all four are in the vendored data:
 *
 *   baseBody: false   the state draws its OWN silhouette, and that silhouette is the whole
 *                     animation — `egg`, `hexagon`, `sleep`, the "!" of `alert`.
 *   dots              the body breaks into, or throws off, separate discs (`thinking`, `burst`).
 *   arcs              rings and ribbons thrown around it (`orbit`, `swirl`, `comet`).
 *   notif             the badge, which is not merely an addition: the renderer cuts a NOTCH out
 *                     of the body mask to seat it, so the crown loses a bite.
 *
 * 🔴 IT SAMPLES ACROSS THE WHOLE STATE, NOT AT t=0, and that is the difference between a real
 * check and one that passes everything. A pose is a function of time: `burst` is a clean circle
 * for its opening frames and only then collapses and sprays, so a single sample at the start
 * clears the most obvious violation in the table.
 */
export function keepsItsShape(id: StateId): boolean {
  const def = STATE_BY_ID.get(id);
  if (!def || !def.baseBody) return false;
  const SAMPLES = 32;
  for (let i = 0; i <= SAMPLES; i += 1) {
    const pose = def.pose((def.duration * i) / SAMPLES);
    if (pose.dots.length > 0 || pose.arcs.length > 0 || pose.notif !== null) return false;
  }
  return true;
}

/**
 * The shape the body rests in.
 *
 * 🔴 ONE OF THE CUSTOMISER'S OWN, NOT A SHAPE OF OURS (owner, 2026-08-26: *"use squircle like in
 * the github repo for bloub"*). `SHAPE_BY_ID` in `lib/bloub/skins.ts` is upstream's own table,
 * vendored unedited like everything else in that folder, and this is the id of one of its rows.
 * The app draws the same character from the same numbers — see `apps/web/lib/character/body.ts`
 * — which is the whole reason the engine was copied rather than reimplemented three times.
 */
export const SHAPE = "squircle";

/**
 * The rest the cycle returns to between beats, wearing a different face each time.
 *
 * This is where the sixteen expressions live — the vendored `expression` prop resolves through
 * the RESTING face only — so the rest is doing more work on this page than the beats are.
 */
export const REST: StateId = "idle";

/**
 * The beats. Two, because two is how many the rule leaves.
 *
 * 🔴 THIS IS A REVERSAL THE OWNER MADE, NOT A TIDY-UP. On 2026-08-24 he went through the bloub
 * gallery tile by tile and kept nine animations, `egg` and `hexagon` among them; on 2026-08-25,
 * watching it run on the page, he asked for one shape only. The later instruction wins, exactly as
 * the gallery sheet won over the shape rule before it. Both earlier positions are in git and in
 * the project memory note, and both are superseded — do not "restore" from either.
 *
 * 🔴 AND THE 2026-08-26 SQUIRCLE DID NOT RE-OPEN THIS. It changed what the body rests as; these
 * six still reshape it mid-animation, which is the thing that was actually objected to.
 *
 * What he kept is intact: nothing here was crossed out on his sheet. What went is every state he
 * kept that reshapes — `thinking`, `sleep`, `egg`, `hexagon`, `notify`, `burst`.
 */
export const BEATS: readonly StateId[] = ["wink", "wide"];

/** Everything the cycle can put on screen, rest included. */
export const CYCLE: readonly StateId[] = [REST, ...BEATS];
