// Where the character looks when nobody has told it where to look.
//
// 🔴🔴 THE SECOND HALF OF ONE REPORT, AND IT ONLY MAKES SENSE BESIDE THE FIRST (owner 2026-08-26:
// *"This should be forward facing, not just looking around. Well, it should look around
// occasionally, but not… it looks like it's just looking behind. It should be looking at text,
// composer. Right now it's just sort of drifted off."*). That sentence contains two distinct
// instructions and they pull in opposite directions:
//
//   1. FACE FORWARD. Handled by `NemesisAvatar`'s `facing` prop — see its own note. The measured
//      poses are three-quarter views authored for a character alone on a page; levelling them is
//      what stops the head reading as turned away.
//   2. LOOK AROUND OCCASIONALLY. Which is what this file is. A head that is levelled and then
//      never moves is not "forward facing", it is a portrait — and levelling also cancels the
//      engine's own ±1° head wander, so without this the character would be *more* dead than
//      before, not less.
//
// So: forward and attentive almost all of the time, with a real glance away every few seconds.
// "Occasionally" is the operative word. The failure this replaces was a character that swept
// continuously, which is why the numbers below are a long gap and a short excursion rather than a
// gentle permanent oscillation.
//
// PURE. No React, no DOM, no clock of its own — every function takes the time it should answer
// for, so a test can ask what the character is doing at any instant.

/** One glance every this often. */
export const GLANCE_EVERY_MS = 8200;

/**
 * How long one glance takes, away and back.
 *
 * 🔴 THE WHOLE EXCURSION, NOT THE HOLD. There is no hold: the head leaves, reaches its farthest
 * point halfway through, and is back. A glance that PARKS somewhere is indistinguishable from the
 * drifted-off pose this exists to replace — the thing that made the old behaviour read as "looking
 * behind" was not the angle on its own, it was holding the angle.
 */
export const GLANCE_MS = 1150;

/**
 * How far a glance goes, as a fraction of the head's full deflection.
 *
 * `TRACK_YAW` is 26° and `TRACK_PITCH` is 15°, so these are about **14° of yaw and 4.5° of pitch**.
 * Measured against the contact sheet: at 14° both eyes are still well inside the silhouette and
 * the character plainly reads as glancing; by 26° the far eye is against the rim, and past 40° it
 * starts to go behind the body, which is the "looking behind" in the report.
 */
export const GLANCE_YAW = 0.55;
export const GLANCE_PITCH = 0.3;

/**
 * How long a pointer that has stopped moving still counts as something to watch.
 *
 * 🔴 THIS NUMBER IS WHY THE CHARACTER USED TO STARE AT NOTHING. `NemesisAvatar` releases the head
 * to `turn = 0` the moment the pointer leaves the window, and `turn = 0` meant *the authored
 * three-quarter pose* — so a learner who let go of the mouse to read got a character looking away
 * over its shoulder until they touched it again. Reading is the single most common thing anyone
 * does on this surface. Now a stopped pointer stops claiming the gaze after a few seconds and the
 * page's own content gets it back.
 */
export const POINTER_MEMORY_MS = 2600;

/** A stable pseudo-random number in -1..1 for cycle `n`. Deterministic: no clock, no seed. */
function spread(n: number): number {
  const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

/**
 * How far off its target the head is glancing at `ms`, as a fraction of full deflection.
 *
 * Zero for most of every cycle: the character is looking at whatever claimed its attention. During
 * the glance window it leaves and returns along half a sine, so it is moving fastest in the middle
 * and motionless at both ends — the same shape an eased UI transition has, and the reason the
 * return does not read as a snap back.
 */
export function glanceAt(ms: number): { x: number; y: number } {
  if (ms < 0) return { x: 0, y: 0 };
  const cycle = Math.floor(ms / GLANCE_EVERY_MS);
  const into = ms - cycle * GLANCE_EVERY_MS;
  if (into >= GLANCE_MS) return { x: 0, y: 0 };
  const swing = Math.sin((into / GLANCE_MS) * Math.PI);
  // 🔴 SIDEWAYS FIRST, AND UP RATHER THAN DOWN. A glance down at nothing reads as the character
  // losing interest; the direction anyone's eyes actually go when their attention wanders off a
  // page is up and to one side. The yaw carries the glance and the pitch only tips it.
  const side = spread(cycle);
  const lift = Math.abs(spread(cycle + 101)) * -1;
  return { x: lift * GLANCE_PITCH * swing, y: side * GLANCE_YAW * swing };
}

/**
 * The glance as a client-coordinate offset to add to whatever the character is watching.
 *
 * 🔴 IT GOES THROUGH THE AIM POINT RATHER THAN STRAIGHT ONTO THE HEAD ANGLE, so a glance eases in
 * and out on `TRACK_EASE` exactly like every other change of attention, and there is no second
 * motion path to keep in step with the first. `NemesisAvatar` normalises an aim against
 * `max(width, height) * 2.5`, so one full deflection is 2.5 character-widths away — which is where
 * the multiplier comes from and why this needs the character's size rather than guessing pixels.
 */
export function glanceOffset(ms: number, size: number): { x: number; y: number } {
  const g = glanceAt(ms);
  const reach = size * 2.5;
  return { x: g.y * reach, y: g.x * reach };
}

// ── What the character is looking at ─────────────────────────────────────────
//
// 🔴🔴 THIS IS ARITHMETIC BECAUSE THE BUG IT FIXES WAS INVISIBLE IN A DIFF AND OBVIOUS ON SCREEN,
// which is the same reason `character-place.ts` exists. The precedence lived inside the dock's
// attention interval as a run of early returns, so "does a moving mouse beat a focused text box?"
// could only be answered by opening a browser and staring at a character's eyes — and for weeks
// the answer was no, on the one surface where a text box is focused nearly all the time.
//
// Owner, 2026-08-26: *"the mascot is not following the mouse at all."* Measured on the real
// component, averaging the drawn eye centres over 60 frames: with a field focused the gaze read
// **+58.9 with the pointer far LEFT and +58.4 with it far RIGHT** — pinned, ignoring the mouse
// completely. With nothing focused the identical sweep runs **-56.9 to +56.2**.

/** A point in client coordinates. */
export interface AimPoint {
  readonly x: number;
  readonly y: number;
}

export interface GazeInput {
  /**
   * The surface called `lookAt()`: "attend to THIS". Deliberate and rare.
   *
   * 🔴 THE ONLY THING THAT OUTRANKS THE POINTER. A drawing Nemesis just made, or a question it is
   * asking, is worth more than the cursor. Nothing else is.
   */
  readonly declared: AimPoint | null;
  /**
   * Where the field the learner has focused is.
   *
   * 🔴🔴 NOT A CLAIM, AND TREATING IT AS ONE IS THE WHOLE BUG. Nobody declared anything: a focused
   * field is a guess about where someone is looking, and it is a much worse guess than a cursor
   * they are actively moving. On the canvas the composer keeps focus after every send, so ranking
   * this above the pointer froze the gaze for the rest of the session.
   */
  readonly focused: AimPoint | null;
  /** Where the composer is — the resting target when nothing else applies. */
  readonly resting: AimPoint | null;
  /** Milliseconds since the pointer last moved. `Infinity` when it never has. */
  readonly pointerAgeMs: number;
  /**
   * The character is at the middle of the surface, working.
   *
   * 🔴 THINKING EYES SEARCH, THEY DO NOT FOLLOW (owner 2026-08-25: working must not be "just
   * staring"). This outranks the pointer too — but NOT a declared target, because a surface that
   * has just drawn something still gets to point at it.
   */
  readonly working: AimPoint | null;
}

/**
 * Where to aim, or `null` for "let the avatar follow the cursor itself".
 *
 * 🔴 `null` IS AN ANSWER, NOT AN ABSENCE. `NemesisAvatar` tracks the pointer on its own; handing it
 * an aim point is how a surface takes that over. So "follow the mouse" is expressed by giving it
 * nothing, and every branch below that returns a point is a branch that stops it.
 */
export function gazeTarget(input: GazeInput): AimPoint | null {
  const { declared, focused, resting, pointerAgeMs, working } = input;
  if (declared) return declared;
  if (working) return working;
  // A pointer that is genuinely moving wins. This is the line the owner's report was about.
  if (pointerAgeMs < POINTER_MEMORY_MS) return null;
  // Still pointer: rest on whatever they are typing into, else on the composer.
  return focused ?? resting;
}
