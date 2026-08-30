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

import { TRACK_PITCH, TRACK_YAW } from "@/lib/avatar";

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

// ── Which way the head turns when the pointer moves ──────────────────────────
//
// 🔴🔴 THE PITCH WAS INVERTED FOR AS LONG AS THIS ENGINE HAS TRACKED A POINTER, AND NOTHING IN THE
// PRODUCT COULD HAVE CAUGHT IT. Owner, 2026-08-28: *"it seems to have an inverted following because
// whenever my mouse goes up, the eyes go down, whenever the mouse goes down, the eyes go up"*, and
// then, so it could not be misread as a request: *"I'm saying that it's already inverted, and I
// need it to be fixed because it's not tracking the mouse movement."*
//
// The two axes do not have the same sign, and that is the trap:
//
//   • **Screen y runs DOWNWARD.** A pointer below the character has a positive normalised `y`.
//   • **Head pitch runs UPWARD.** `quatFromTurn` rotates about X, so a positive `turn.x` carries the
//     face toward the top of the screen — which is why `neutral` is written as 28.62 and described
//     everywhere in this codebase as looking 28.6° *up*.
//
// Multiply one by the other and the character looks up when you go down. Yaw has no such conflict:
// screen x and head yaw both run to the right, so `wantY` was correct and only the vertical was
// wrong, which is exactly the half of the report the owner could see.
//
// 🔴 THE VENDORED ENGINE GETS THIS RIGHT AND SAYS SO IN ITS OWN COMMENT. `landing/lib/bloub/gaze.ts`,
// which is the upstream this renderer was measured against, writes `pitch: PITCH - ny * PITCH_MAX`
// beside the note *"tangage positif = regard vers le haut, alors que le y de l'ecran descend"* —
// positive pitch is looking up, while the screen's y goes down. Our renderer wrote the multiply
// inline without the negation, so there was no line anywhere saying what the sign meant.
//
// 🔴 SO IT IS A NAMED FUNCTION NOW, RATHER THAN TWO MULTIPLIES INSIDE AN ANIMATION FRAME. A sign
// buried in a rAF tick is unaskable; a sign in a pure function is one assertion. The test that
// pins it is written in the owner's own words.

/** Where the pointer is, relative to the character, normalised to -1..1 and clamped. */
export interface TrackAim {
  /** Positive to the RIGHT of the character. */
  readonly x: number;
  /** Positive BELOW the character — screen y, which runs downward. */
  readonly y: number;
}

/**
 * The head angles that aim at `aim`, in degrees: `x` is pitch, `y` is yaw.
 *
 * 🔴 THE PITCH IS NEGATED AND THE YAW IS NOT. See the note above; this is the whole of the
 * 2026-08-28 fix and it is one character of code, which is why it needs the paragraph.
 */
export function trackTurn(aim: TrackAim): { x: number; y: number } {
  return { x: -aim.y * TRACK_PITCH, y: aim.x * TRACK_YAW };
}

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

// ── How far away is "all the way over there" ──────────────────────────────────
//
// 🔴🔴 THIS WAS `character size x 2.5`, AND IT IS WHY THE OWNER KEPT REPORTING THAT THE CHARACTER
// DOES NOT FOLLOW THE MOUSE — three times, and twice I replied that it did.
//
// The renderer normalises the pointer's offset against a reach and clamps to ±1. At a 76px
// character that reach was **190px**, so the head hit full deflection 190px away and every pointer
// position beyond it drew the identical frame. Measured against the real layout, character above
// the composer at x=389 in a 1470px window:
//
//   pointer x   450   550   700   900   1400
//   head yaw     8°   22°   26°   26°    26°
//
// **61% of the window is one frozen position**, and it is the 61% holding the answer and the
// composer — where a pointer actually spends its time. Moving between two far corners, which is how
// I "verified" this, samples two saturated extremes and misses that everything between them is a
// step rather than a slope.
//
// The 2.5 came from the reference, where the character is drawn nearly full-screen and 2.5 of its
// widths IS most of the view. At 76px on a laptop it is a thumbnail's worth of screen.
//
// 🔴 SO THE REACH IS A PROPERTY OF THE SCREEN, NOT OF THE CHARACTER. Measuring to the furthest
// corner means nothing on the page is ever clamped: every pixel of pointer movement anywhere
// changes the head by a little, which is what "follows the mouse" means.

/** Below this a reach is meaningless — a pane a few hundred pixels wide. */
const MIN_REACH = 260;

/**
 * How far the pointer has to be before the head is turned as far as it goes.
 *
 * The distance to the furthest corner of the viewport, so full deflection happens exactly at the
 * corner the pointer is least often in, and every position short of it is proportional.
 */
export function trackReach(input: {
  readonly centre: { readonly x: number; readonly y: number };
  readonly viewport: { readonly width: number; readonly height: number };
}): number {
  const { centre, viewport } = input;
  return Math.max(
    MIN_REACH,
    Math.hypot(centre.x, centre.y),
    Math.hypot(viewport.width - centre.x, centre.y),
    Math.hypot(centre.x, viewport.height - centre.y),
    Math.hypot(viewport.width - centre.x, viewport.height - centre.y),
  );
}

/**
 * The glance as a client-coordinate offset to add to whatever the character is watching.
 *
 * 🔴 IT GOES THROUGH THE AIM POINT RATHER THAN STRAIGHT ONTO THE HEAD ANGLE, so a glance eases in
 * and out on `TRACK_EASE` exactly like every other change of attention, and there is no second
 * motion path to keep in step with the first.
 *
 * 🔴 IT TAKES THE REACH, NOT THE CHARACTER'S SIZE, AND THAT CHANGED WITH `trackReach`. A glance is
 * a FRACTION OF FULL DEFLECTION — `glanceAt` returns one — so it has to be multiplied by whatever
 * full deflection currently costs in pixels. Written against the character's own size, as it was,
 * it would have shrunk to a sixth of itself the moment the reach became a property of the screen,
 * and nothing would have failed.
 */
export function glanceOffset(ms: number, reach: number): { x: number; y: number } {
  const g = glanceAt(ms);
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

// ── Following, and being absorbed ────────────────────────────────────────────
//
// 🔴🔴 THE THIRD TIME THIS REPORT HAS BEEN MADE, AND THE FIRST TIME THE MECHANISM CHANGES. Owner,
// 2026-08-26: *"it should follow the mouse … but also have moments where it does its own animations
// and expressions."* Answered with `montage.ts` — a different FACE every few seconds. Owner,
// 2026-08-27: *"it still does not do expressions after a while of following the mouse."* Answered by
// widening the montage to the movement loops and shortening its hold. Owner, 2026-08-28: *"make sure
// that there are moments where it's tracking mouse movement, but other moments where it's just doing
// its own thing, own expressions."*
//
// 🔴 EVERY ANSWER SO FAR CHANGED WHAT THE FACE WAS DOING AND NONE OF THEM CHANGED WHERE THE HEAD WAS
// POINTING, which is the whole of what "doing its own thing" looks like from across a room. A gaze
// loop like `gaze-searching` is six measured poses that carry the head 30px on their own — and the
// renderer was adding pointer tracking ON TOP of every frame of it, so the loop's movement was
// permanently overwritten by the cursor's. The character was following the mouse 100% of the time it
// was awake. There was no "other moments" to see.
//
// 🔴 THIS IS THE PATTERN FROM [[character-signals-are-dead]], RUNNING THE OTHER WAY. Four narrowings
// of the `?` mark were each a true statement about when it was wrong and none was why it was wrong.
// Three widenings of the montage have been the same shape. So this stops adjusting the montage and
// takes the pointer away instead, for a bounded stretch, on a clock.

/**
 * One full round of the character's attention: it follows, then it is absorbed, then it follows.
 *
 * 🔴 FOLLOWING IS STILL THE MAJORITY. The most repeated report about this character used to be
 * *"the mascot is not following the mouse at all"* — three times, and twice I replied that it did.
 * The cycle OPENS on following, so whatever the learner sees in the first seconds after a page
 * loads is the character watching them.
 *
 * 🔴🔴 20s/5s → 18s/6s ON THE FOURTH REPORT OF THE OPPOSITE (owner 2026-08-30: *"the mascot is
 * still following the mouse, and it should follow the mouse at times, but at times, it just should
 * just move independently of the mouse"*). A quarter was already the intent and the learner was not
 * getting a quarter — see the gate that used to stand in front of this, described in
 * `montageLoop`. With that gate gone the share is real, and a third is what reads as *sometimes*.
 */
export const ATTENTION_CYCLE_MS = 18_000;

/**
 * How long one absorbed stretch lasts.
 *
 * Long enough for a montage loop to reach its second and third pose, which is where a loop's
 * movement lives (`montage.ts` measures the busiest at 30px of eye travel over a cycle, against
 * 0.8px for a held feeling). Much shorter and being absorbed is indistinguishable from a glance,
 * which this product already has and which is not what was asked for.
 */
export const ABSORBED_MS = 6_000;

/**
 * Is the character absorbed in its own business at `ms`?
 *
 * 🔴 THE WINDOW SITS AT THE END OF THE CYCLE, so a character that has just mounted follows first.
 */
export function absorbedAt(ms: number): boolean {
  if (!Number.isFinite(ms) || ms < 0) return false;
  return ms % ATTENTION_CYCLE_MS >= ATTENTION_CYCLE_MS - ABSORBED_MS;
}

/**
 * Which absorbed stretch this is, counting from the clock's start — or null while following.
 *
 * 🔴 IT EXISTS SO THE STRETCH CAN CHOOSE WHAT TO DO WITH ITSELF. The montage picks a different
 * movement loop per cycle from this number, so two absorbed stretches in a row are not the same
 * performance; see `montageLoop`. Deterministic, like everything else in this file — no clock of
 * its own, no randomness that a test cannot ask about.
 */
export function absorbedCycleAt(ms: number): number | null {
  if (!absorbedAt(ms)) return null;
  return Math.floor(ms / ATTENTION_CYCLE_MS);
}

/** A point in client coordinates. */
export interface AimPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * What the character's eyes are doing.
 *
 * 🔴 THREE ANSWERS, NOT TWO, AND THE THIRD IS THE 2026-08-28 CHANGE. This used to be `AimPoint |
 * null`, where `null` meant "the avatar follows the cursor by itself" — so there was no way to say
 * *look at nothing in particular, you are busy*. Expressing that as an aim point would have been
 * wrong in a way that is easy to reach for and hard to see: any point at all is still a target, and
 * a character staring fixedly at a computed spot reads as broken rather than as occupied.
 */
export type Gaze =
  /** Watch this exact place. */
  | { readonly kind: "at"; readonly point: AimPoint }
  /** Follow the cursor. The avatar already knows where it is; nothing needs to be measured. */
  | { readonly kind: "pointer" }
  /** Neither. Let the animation's own authored head do the moving. */
  | { readonly kind: "self" };

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
  /**
   * The character is in an absorbed stretch AND has something of its own to be absorbed IN.
   *
   * 🔴 BOTH HALVES, MEASURED BY THE CALLER. A clock alone would take the pointer away while the
   * character happened to be wearing a held feeling, and a held feeling moves the eyes 0.8px — so
   * the learner would see it stop following and then do nothing, which is the exact complaint this
   * is answering, produced deliberately. See the dock.
   */
  readonly absorbed: boolean;
}

/**
 * What the character should be looking at.
 *
 * 🔴 THE WHOLE PRECEDENCE IS HERE AND NOWHERE ELSE. It used to be a run of early returns inside the
 * dock's 120ms interval, which is why "does a moving mouse beat a focused text box?" could only be
 * answered by opening a browser and staring at a character's eyes — and why the answer was wrong for
 * weeks. Every caller MEASURES; this decides.
 */
export function gazeTarget(input: GazeInput): Gaze {
  const { declared, focused, resting, pointerAgeMs, working, absorbed } = input;
  // A surface that asked outranks everything, including the character's own business: a drawing
  // Nemesis has just made is a fact about the lesson, and being lost in thought is not.
  if (declared) return { kind: "at", point: declared };
  if (working) return { kind: "at", point: working };
  // 🔴 ABOVE THE POINTER, WHICH IS THE POINT OF IT. Ranked below, it could never fire while the
  // learner had a hand on the mouse — and a learner with a hand on the mouse is the only person who
  // was ever going to notice whether the character has moments of its own.
  if (absorbed) return { kind: "self" };
  // A pointer that is genuinely moving wins. This is the line the 2026-08-26 report was about.
  if (pointerAgeMs < POINTER_MEMORY_MS) return { kind: "pointer" };
  // Still pointer: rest on whatever they are typing into, else on the composer.
  const rest = focused ?? resting;
  return rest ? { kind: "at", point: rest } : { kind: "pointer" };
}

// ── How far the head may end up pointing ────────────────────────────────────────────────────

/**
 * The widest the head may point sideways, pose and tracking together, in degrees.
 *
 * 🔴🔴 THIS IS THE SAFETY RAIL FOR `facing="free"`, AND IT EXISTS BECAUSE THE DEFECT IT PREVENTS
 * HAS ALREADY SHIPPED ONCE. Owner, 2026-08-27, having watched both settings side by side on the
 * model sheet and left the toggle on *Head free*: the measured poses keep their own angles again.
 * That undoes the levelling asked for on 2026-08-26 — deliberately, on the owner's own second
 * look — but it does NOT undo the thing levelling was fixing underneath, which was never the pose
 * on its own: tracking ADDS to it. `farRightGlance`, which `gaze-searching` and `gaze-proud` both
 * wear, is authored at 35.3°; `TRACK_YAW` is 26; the sum is **61.3°**, and at 61° the far eye is
 * drawn at **4%** of its size. That is the black ball with one sliver of eye at the rim.
 *
 * Measured on the squircle, sweeping the total yaw and reading the far eye's drawn scale:
 *
 * | total yaw | 26° | 35° | **42°** | 48° | 55° | 61° |
 * |---|---|---|---|---|---|---|
 * | far eye, as drawn | 76% | 58% | **43%** | 30% | 16% | 4% |
 *
 * 42 is where the far eye is still unmistakably an eye. It is also above every authored pose the
 * montage plays (the widest is 35.3), so a pose is NEVER clipped by this on its own — only the
 * tracking on top of it is, which is the correct thing to give up.
 */
export const CAP_YAW = 42;

/**
 * 🔴 THERE IS NO PITCH CAP, AND THAT IS A MEASUREMENT RATHER THAN AN OVERSIGHT. Yaw hides an eye
 * because the face is wrapped round a solid and one eye goes to the far side; pitch tilts both
 * eyes together and hides neither. Measured on the same body, both eyes are drawn at 116% at 15°
 * of pitch and still 113% at 43° — the widest the product can reach (28.6 authored + 15 tracked).
 * A cap here would be a number that never fires, which is worse than no number: it reads as a
 * limit somebody chose.
 */
export const CAP_PITCH: number | null = null;

/**
 * The tracking turn to hand the renderer, given where the pose already points.
 *
 * 🔴 THE TOTAL IS CLAMPED, NOT THE TRACKING, and the difference is what the character does when
 * the pointer is on its far side. Clamping the tracking to a leftover budget would make a
 * wide-posed character nearly unable to follow the pointer in EITHER direction. Clamping the
 * total lets tracking pull a turned head back toward the middle at full strength and only refuses
 * to push it further out — so the pointer always does something, and the something is always
 * legible.
 *
 * 🔴 SPIN IS NOT PASSED THROUGH HERE. A poke is a full 360° turn of the head; anything that
 * clamped it would stop the spin dead at 42° and the poke would read as a twitch. The caller adds
 * it after — see `nemesis-avatar.tsx`.
 */
export function cappedTurn(
  head: { readonly x: number; readonly y: number },
  track: { readonly x: number; readonly y: number },
): { x: number; y: number } {
  const clamp = (v: number, cap: number | null) => (cap === null ? v : Math.min(cap, Math.max(-cap, v)));
  return {
    x: clamp(head.x + track.x, CAP_PITCH) - head.x,
    y: clamp(head.y + track.y, CAP_YAW) - head.y,
  };
}
