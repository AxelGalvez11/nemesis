// The state vocabulary.
//
// EVERY ENTRY IS SOMETHING THE SYSTEM IS ACTUALLY DOING, and the movement is chosen to
// look like that thing. There is no "wave", no "celebrate", no state whose only
// justification is that it would be nice to have an animation there.
//
// HOW A STATE IS WRITTEN. A state is a function of its own local time returning a PATCH
// over `REST` — only the fields it disturbs. `resolvePose` fills the rest in, so what
// leaves this module is always a complete `Pose` and the compiler checks it. Nothing
// here reads a clock, a random number, or the previous state.
//
// THE FOUR THINGS THE BODY CAN DO TO ITSELF, used consistently across all twenty:
//
//   round   how geometric it is. HIGHER IS MORE RESOLVED — crisp sides, decided. Lower
//           is softer and less settled. This is the character's single strongest
//           expressive axis and it is never used decoratively.
//   taper   which way its mass leans. Attention, and the difference between a creature
//           and a logo.
//   pinch   a waist. The form gathering itself in to work.
//   ripple  a three-lobe wave on the outline. Internal activity, not travel.
//
// AND THE SIGNATURE: `insight` is the only state that drives `round` to its maximum
// with taper and ripple at zero — the form resolving into its purest geometry. `partial`
// starts down that same road and deliberately stops 45% of the way, which is how
// "close, keep going" is said without a frame that could be mistaken for failure.

import { clamp01, EASINGS, pulse, triangle, type EaseName } from "./easing";
import type { ExpressionId } from "./expressions";
import { EYE_H, EYE_RISE, EYE_SPLIT, EYE_W } from "./geometry";
import { resolvePose, type PosePatch } from "./pose";
import { blendRadii, SHAPES } from "./shapes";
import type { MascotMode, MascotStation, Pose } from "./types";

/** Extra shading the product can put on any state. */
export interface StateCtx {
  /** 0..1. Low confidence narrows the eyes slightly. A shading, never a state. */
  readonly confidence: number;
  /** 0..1 speech energy. */
  readonly voice: number;
}

export const DEFAULT_CTX: StateCtx = { confidence: 1, voice: 0 };

export interface StateDef {
  readonly id: MascotMode;
  /** For the lab and for anything that has to name a state to a human. */
  readonly label: string;
  readonly note: string;
  /** Seconds to transition INTO this state. */
  readonly morph: number;
  /** The curve that transition takes. See easing.ts on why it is per-state. */
  readonly ease: EaseName;
  /** Seconds after entry at which the state's own animation has resolved. */
  readonly settle: number;
  /** Seconds per repetition, or null if the state settles and holds. */
  readonly loop: number | null;
  /**
   * How the character feels while doing this, unless the product says otherwise.
   * See expressions.ts on why this is a separate axis rather than more states.
   */
  readonly expression: ExpressionId;
  /**
   * Where a docked mascot stands while doing this.
   *
   * `centre` is for the states where the character IS the thing happening — it is
   * working and there is nothing else to look at yet. Everything else stays out of the
   * way in the corner. See `nemesis-mascot-dock.tsx` for the travel.
   */
  readonly station: MascotStation;
  /**
   * Blink across the way in. Worth it for a state that changes silhouette a long way:
   * the eye shutting over the change makes the new shape read as a decision.
   */
  readonly blinkIn: boolean;
  /** Complete pose at local time `t`. Pure. */
  readonly pose: (t: number, ctx: StateCtx) => Pose;
}

/**
 * The resting face, for states that SCALE it rather than restate it.
 *
 * Aliased from geometry rather than written out again: these numbers were duplicated
 * once, and a change to the face then moved every state's eyes by a different amount
 * than it moved the rest pose.
 */
const E_H = EYE_H;
const E_W = EYE_W;
const E_SPLIT = EYE_SPLIT;
const E_RISE = EYE_RISE;

/** The resting lean, so states can express a departure from it rather than a value. */
const R_TAPER = 0.07;

/**
 * Partway to the resolved silhouette.
 *
 * `crystal` is the most decided the character ever looks. `insight` reaches it outright;
 * `correct`, `partial`, `success` and `complete` travel a measured fraction of the way,
 * which is how "yes", "close", "mastered" and "finished" get said in one visual language
 * instead of four unrelated ones.
 */
const towardCrystal = (k: number) => blendRadii(SHAPES.blob, SHAPES.crystal, k);

type Meta = Omit<StateDef, "id" | "pose">;

function def(id: MascotMode, meta: Meta, pose: (t: number, ctx: StateCtx) => PosePatch): StateDef {
  return { id, ...meta, pose: (t, ctx) => resolvePose(pose(t, ctx)) };
}

/** Low confidence: eyes a touch narrower, form a touch softer. Deliberately faint. */
const doubt = (ctx: StateCtx) => 1 - clamp01(ctx.confidence);

const CATALOGUE: readonly StateDef[] = [
  def(
    "idle",
    {
      label: "Idle",
      note: "Resting. Gaze drift, natural blinks, and a lean so slow you should not notice it.",
      morph: 0.42,
      ease: "outSine",
      settle: 0.42,
      loop: 27,
      expression: "neutral",
      station: "corner",
      blinkIn: false,
    },
    (t) => ({
      // Two hundredths of a taper over 27 seconds. This exists so the form is not
      // frozen; if you can see it happening it is too much.
      body: { taper: R_TAPER + 0.022 * Math.sin(t * 0.232) },
      liveliness: 1,
      lookGain: 0.5,
    }),
  ),

  def(
    "notice",
    {
      label: "Notice",
      note: "The user arrived. It sits up, tightens, and the gaze snaps over.",
      morph: 0.15,
      ease: "outQuint",
      settle: 0.55,
      loop: null,
      expression: "keen",
      station: "corner",
      blinkIn: false,
    },
    (t) => {
      const k = pulse(t / 0.5, 0.26);
      return {
        body: {
          // SITTING UP IS THE WHOLE GESTURE. Nothing travels across the screen; the
          // silhouette narrows and lifts, which is what noticing looks like from across
          // a room.
          shape: "column",
          scale: 1.01 + 0.025 * k,
          taper: R_TAPER,
        },
        eye: { h: E_H * 1.15 },
        lift: -2.2 - 1.1 * k,
        liveliness: 0.9,
        lookGain: 0.95,
      };
    },
  ),

  def(
    "listening",
    {
      label: "Listening",
      note: "Waiting on speech. It leans toward the sound and swells with it — it does not draw a waveform.",
      morph: 0.28,
      ease: "outSine",
      settle: 0.4,
      loop: 3.6,
      expression: "keen",
      station: "corner",
      blinkIn: false,
    },
    (t, ctx) => {
      // ONE SOFT SWELL, NOT AN EQUALISER. Voice energy moves the whole body a little; it
      // never draws a level, which would make the character a meter.
      const v = clamp01(ctx.voice);
      return {
        body: {
          shape: "pebble",
          tilt: -5,
          taper: 0.17,
          stretch: 1 + 0.022 * v + 0.006 * Math.sin(t * 1.745),
          squash: 1 + 0.014 * v,
        },
        eye: { h: E_H * (1.06 - 0.06 * doubt(ctx)), asym: 3 },
        liveliness: 0.95,
        lookGain: 0.9,
      };
    },
  ),

  def(
    "thinking",
    {
      label: "Thinking",
      note: "It gathers at the waist and a wave travels round its outline. Not a spinner, and deliberately not three dots.",
      morph: 0.4,
      ease: "inOutSine",
      settle: 0.4,
      loop: 3.6,
      expression: "narrow",
      station: "centre",
      blinkIn: true,
    },
    (t, ctx) => ({
      body: {
        // The waist is the compression; the wave is the reorganisation. Together they
        // read as work happening INSIDE a form that is otherwise holding still — which
        // is the one thing a spinner, a bouncing dot and an orbiting ring all fail to
        // say.
        shape: "bloom",
        pinch: 0.5 + 0.12 * Math.sin(t * 1.745),
        ripple: 0.04,
        ripplePhase: t * 100,
        stretch: 0.94,
        squash: 1.05,
        taper: 0.03,
      },
      eye: { h: E_H * 0.55, rise: E_RISE + 0.06, split: E_SPLIT * 0.94 },
      gazeX: -0.25,
      gazeY: 0.28,
      // A mind turned inward does not track the cursor. This is the lowest lookGain in
      // the catalogue after `inactive`, and it is what separates thinking from every
      // other busy state.
      liveliness: 0.35 * (0.7 + 0.3 * (1 - doubt(ctx))),
      lookGain: 0.12,
    }),
  ),

  def(
    "searching",
    {
      label: "Searching",
      note: "Reaching outward. Two fragments leave the body and sweep with the gaze.",
      morph: 0.3,
      ease: "outQuint",
      settle: 0.3,
      loop: 2.2,
      expression: "keen",
      station: "centre",
      blinkIn: false,
    },
    (t) => {
      const phase = triangle(t / 2.2) * 2 - 1;
      return {
        body: { stretch: 1.03, taper: R_TAPER + 0.17 * phase },
        sat: {
          spread: 9,
          // Centred overhead and swinging through a limited arc. A full rotation would
          // read as an orbit, which is a different thing entirely.
          spin: -90 + 62 * phase,
          sweep: 0.9,
          scatter: 0.25,
          scale: 0.19,
          alpha: 1,
        },
        eye: { h: E_H * 1.1 },
        gazeX: 0.72 * phase,
        gazeY: -0.16,
        liveliness: 0.5,
        lookGain: 0.2,
      };
    },
  ),

  def(
    "reading",
    {
      label: "Reading",
      note: "Almost all gaze: the eyes traverse a line, snap back, and creep down the page.",
      morph: 0.32,
      ease: "outSine",
      settle: 0.32,
      loop: 3.45,
      expression: "narrow",
      station: "corner",
      blinkIn: true,
    },
    (t) => {
      const LINE = 1.15;
      const p = (t % LINE) / LINE;
      // 82% of each line is the slow traverse; the remaining 18% is the carriage return,
      // which is the fastest movement the character ever makes.
      const x = p < 0.82 ? -0.8 + 1.65 * (p / 0.82) : 0.85 - 1.65 * EASINGS.outQuint((p - 0.82) / 0.18);
      const line = Math.floor((t % (LINE * 3)) / LINE);
      return {
        // A lens: flattened, pointed at both ends. A thing for looking THROUGH.
        body: { shape: "lens", dy: 1.2, stretch: 1.02 },
        eye: { h: E_H * 0.78, w: E_W * 1.06 },
        gazeX: x,
        gazeY: -0.28 + line * 0.3,
        liveliness: 0.55,
        lookGain: 0.1,
      };
    },
  ),

  def(
    "teaching",
    {
      label: "Teaching",
      note: "The normal state during Canvas teaching. Composed, and quiet enough to read next to.",
      morph: 0.35,
      ease: "outSine",
      settle: 0.35,
      loop: 6.47,
      expression: "soft",
      station: "corner",
      blinkIn: false,
    },
    (t, ctx) => ({
      // A 6.5-second breath of six-tenths of one percent. The learner is reading;
      // anything they can consciously see here is competing with the words.
      body: { scale: 1 + 0.006 * Math.sin(t * 0.971), taper: 0.09 },
      eye: { h: E_H * (1 - 0.07 * doubt(ctx)) },
      lift: -1,
      liveliness: 0.85,
      lookGain: 0.6,
    }),
  ),

  def(
    "question",
    {
      label: "Question",
      note: "Asking. It tips off its own axis, its mass shifts, and one eye sits higher than the other.",
      morph: 0.24,
      ease: "outQuint",
      settle: 0.6,
      loop: null,
      expression: "wry",
      station: "corner",
      blinkIn: false,
    },
    (t) => {
      const k = pulse(t / 0.55, 0.3);
      return {
        body: {
          // The drop is fuller at the bottom and narrower at the top, so tipping it puts
          // the character's weight visibly on one foot.
          shape: "drop",
          tilt: 7.5 + 2.5 * k,
          taper: -0.16,
        },
        // THE ASYMMETRY IS THE WHOLE DEVICE. No eyebrow, no punctuation mark, no
        // head-scratch: one eye tilted and lifted a little further than its partner is
        // enough to read as a question, and it survives being 3px tall.
        eye: { asym: 8, h: E_H * 1.08, split: E_SPLIT * 1.03 },
        gazeY: 0.32,
        liveliness: 0.9,
        lookGain: 0.9,
      };
    },
  ),

  def(
    "waiting",
    {
      label: "Waiting",
      note: "After the question. It settles onto its own weight and gives the learner the floor.",
      morph: 0.5,
      ease: "outSine",
      settle: 0.9,
      loop: null,
      expression: "neutral",
      station: "corner",
      blinkIn: true,
    },
    () => ({
      body: { shape: "slab", dy: 1.4, taper: 0.04 },
      eye: { h: E_H * 0.9 },
      liveliness: 0.55,
      lookGain: 0.45,
    }),
  ),

  def(
    "evaluating",
    {
      label: "Evaluating",
      note: "Reading the answer. Short, fast, and the whole form draws in on it.",
      morph: 0.12,
      ease: "outQuint",
      settle: 0.45,
      loop: null,
      expression: "narrow",
      station: "corner",
      blinkIn: false,
    },
    (t) => ({
      body: { stretch: 0.9, squash: 1.07, scale: 0.98, pinch: 0.2, taper: 0.02 },
      eye: { h: E_H * 0.42, split: E_SPLIT * 0.86 },
      glow: 0.12 * pulse(t / 0.45, 0.4),
      liveliness: 0.25,
      lookGain: 0.5,
    }),
  ),

  def(
    "correct",
    {
      label: "Correct",
      note: "A clean snap outward and back. Half a second, no confetti, then straight back to teaching.",
      morph: 0.1,
      ease: "snap",
      settle: 0.55,
      loop: null,
      expression: "bright",
      station: "corner",
      blinkIn: false,
    },
    (t) => {
      const k = pulse(t / 0.55, 0.22);
      return {
        body: {
          radii: towardCrystal(0.7 * k),
          scale: 1 + 0.075 * k,
          stretch: 1 + 0.02 * k,
          squash: 1 + 0.035 * k,
          taper: R_TAPER * (1 - k),
        },
        eye: { h: E_H * (1 + 0.3 * k) },
        lift: -1.8 * k,
        glow: 0.45 * k,
        liveliness: 0.9,
        lookGain: 0.7,
      };
    },
  ),

  def(
    "partial",
    {
      label: "Partial",
      note: "Close. It starts to resolve into its finished geometry and deliberately stops short.",
      morph: 0.22,
      ease: "outQuint",
      settle: 1,
      loop: null,
      expression: "soft",
      station: "corner",
      blinkIn: false,
    },
    (t) => {
      // THE MESSAGE IS THAT IT STOPS. Resolution in this character is `round` reaching
      // its maximum with taper and ripple gone; here it travels 45% of that road and
      // holds. It cannot be confused with `insight`, which completes, and it contains no
      // frame that reads as failure.
      const k = EASINGS.outQuint(clamp01((t - 0.12) / 0.6)) * 0.45;
      return {
        body: {
          radii: towardCrystal(k),
          taper: 0.2 * (1 - k),
          ripple: 0.05 * (1 - k),
          ripplePhase: 30 * k,
          tilt: 4 * (1 - k),
        },
        eye: { h: E_H * 1.04, asym: 5 },
        glow: 0.16 * pulse(t / 0.9, 0.35),
        liveliness: 0.85,
        lookGain: 0.75,
      };
    },
  ),

  def(
    "incorrect",
    {
      label: "Incorrect",
      note: "A controlled reset: the form loses its geometry for a moment, then re-forms.",
      morph: 0.26,
      ease: "inOutSine",
      settle: 0.85,
      loop: null,
      expression: "concerned",
      station: "corner",
      blinkIn: false,
    },
    (t) => {
      // NOT ANGER, NOT A SHAKE, NOT RED. The body goes soft — `round` falls, the sides
      // it had disappear, a slow wave crosses it — and then it comes back. It is the
      // visual of taking something apart to look at it again, which is exactly what
      // Nemesis is about to do.
      const s = pulse(t / 0.85, 0.3);
      return {
        body: {
          // Toward `pebble`: the sides it had soften away and it becomes an unmade
          // thing for a moment, then comes back.
          radii: blendRadii(SHAPES.blob, SHAPES.pebble, s),
          ripple: 0.075 * s,
          ripplePhase: 55 * s,
          stretch: 1 + 0.05 * s,
          squash: 1 - 0.045 * s,
          taper: R_TAPER - 0.16 * s,
        },
        eye: { h: E_H * (1 - 0.3 * s), rise: E_RISE + 0.06 * s },
        liveliness: 0.7,
        lookGain: 0.55,
      };
    },
  ),

  def(
    "confusion",
    {
      label: "Confusion detected",
      note: "The learner is struggling. More attention, less movement — it nearly stops blinking and holds.",
      morph: 0.55,
      ease: "inOutSine",
      settle: 0.8,
      loop: null,
      expression: "narrow",
      station: "corner",
      blinkIn: false,
    },
    () => ({
      body: { scale: 0.985, stretch: 0.97, squash: 1.025, pinch: 0.12, taper: 0.03 },
      eye: { h: E_H * 0.5, split: E_SPLIT * 0.87 },
      lift: -1.4,
      // THE STILLNESS IS THE SIGNAL. Everywhere else, less liveliness would be a bug.
      // Here it is the state: a character that stops drifting and nearly stops blinking
      // is concentrating on you, and it cannot be read as disappointment.
      liveliness: 0.18,
      lookGain: 1,
    }),
  ),

  def(
    "insight",
    {
      label: "Insight",
      note: "The signature. The wave dies, the lean vanishes, and the form resolves into its finished geometry and opens.",
      morph: 0.5,
      ease: "inOutQuart",
      settle: 1.5,
      loop: null,
      expression: "bright",
      station: "corner",
      blinkIn: true,
    },
    (t) => {
      const k = EASINGS.inOutQuart(clamp01(t / 0.9));
      const p = pulse((t - 0.3) / 1.05, 0.32);
      return {
        body: {
          // The only state that reaches `crystal` outright. That is what makes arriving
          // there mean something.
          radii: towardCrystal(k),
          taper: R_TAPER * (1 - k),
          ripple: 0,
          scale: 1 + 0.11 * p,
        },
        eye: { h: E_H * (1 + 0.3 * k) },
        glow: 0.55 * p,
        lift: -2.4 * p,
        liveliness: 0.8,
        lookGain: 0.7,
      };
      // The fragments are NOT declared here, and that is the trick. Arriving from
      // `searching` or `generating-visual`, the transition interpolates their spread and
      // alpha down to REST's zero — so they fold home and are absorbed. Arriving from
      // `teaching`, there were none and nothing happens. One behaviour, no branch, and
      // no knowledge of history.
    },
  ),

  def(
    "generating-visual",
    {
      label: "Generating visual",
      note: "Building something on the Canvas. It leans that way and sends fragments toward it.",
      morph: 0.34,
      ease: "outQuint",
      settle: 0.34,
      loop: 1.6,
      expression: "keen",
      station: "corner",
      blinkIn: false,
    },
    (t) => ({
      body: { shape: "bloom", taper: 0.24, tilt: -3 },
      sat: {
        spread: 5 + 3.4 * triangle(t / 1.6),
        spin: -20,
        sweep: 1,
        scatter: 0.35,
        scale: 0.15,
        alpha: 0.85,
      },
      eye: { h: E_H * 1.05 },
      gazeX: 0.7,
      gazeY: -0.15,
      liveliness: 0.6,
      lookGain: 0.35,
    }),
  ),

  def(
    "speaking",
    {
      label: "Speaking",
      note: "Reading aloud. Rhythmic deformation of the body — there is no mouth, and there will not be one.",
      morph: 0.2,
      ease: "outQuint",
      settle: 0.2,
      loop: 0.861,
      expression: "soft",
      station: "corner",
      blinkIn: false,
    },
    (t, ctx) => {
      // A CARRIER PLUS THE VOICE. At zero energy the character still moves a little,
      // because a mascot that goes rigid between syllables reads as broken rather than as
      // quiet. The voice raises the amplitude; it never gates it.
      const carrier = 0.35 + 0.65 * clamp01(ctx.voice);
      const a = carrier * (0.55 + 0.45 * Math.sin(t * 7.3));
      return {
        body: {
          stretch: 1 + 0.05 * a,
          squash: 1 - 0.035 * a,
          taper: R_TAPER + 0.05 * a,
        },
        eye: { h: E_H * 1.02 },
        lift: -1.3 * a,
        liveliness: 0.85,
        lookGain: 0.75,
      };
    },
  ),

  def(
    "success",
    {
      label: "Success",
      note: "A mastery milestone. `correct`, taken further and held a second longer.",
      morph: 0.14,
      ease: "snap",
      settle: 0.95,
      loop: null,
      expression: "bright",
      station: "corner",
      blinkIn: true,
    },
    (t) => {
      const p = pulse(t / 0.95, 0.24);
      return {
        body: {
          radii: towardCrystal(p),
          scale: 1 + 0.115 * p,
          taper: R_TAPER * (1 - p),
          squash: 1 + 0.03 * p,
        },
        eye: { h: E_H * (1 + 0.25 * p) },
        lift: -3.6 * p,
        glow: 0.5 * p,
        liveliness: 0.9,
        lookGain: 0.7,
      };
    },
  ),

  def(
    "complete",
    {
      label: "Session complete",
      note: "A natural stopping point. The form resolves and STAYS resolved. Finished, not congratulated.",
      morph: 0.7,
      ease: "inOutQuart",
      settle: 1.4,
      loop: 8.72,
      expression: "soft",
      station: "corner",
      blinkIn: true,
    },
    (t) => {
      const k = EASINGS.inOutQuart(clamp01(t / 1.1));
      return {
        body: {
          radii: towardCrystal(0.8 * k),
          taper: R_TAPER * (1 - k),
          dy: 0.8 * k,
          stretch: 1 + 0.01 * Math.sin(t * 0.72),
        },
        eye: { h: E_H * 0.86 },
        // Low and CONSTANT. `success` peaks and falls; this one simply stays lit, which
        // is the difference between a reward and a state of rest.
        glow: 0.14 * k,
        liveliness: 0.5,
        lookGain: 0.5,
      };
    },
  ),

  def(
    "inactive",
    {
      label: "Inactive",
      note: "Long idle. Eyes down to a sliver, one very slow breath, nothing else.",
      morph: 0.9,
      ease: "inOutSine",
      settle: 0.9,
      loop: 8.98,
      expression: "weary",
      station: "corner",
      blinkIn: true,
    },
    (t) => ({
      body: {
        shape: "slab",
        dy: 2.4,
        taper: 0.02 + 0.02 * Math.sin(t * 0.7),
      },
      eye: { open: 0.07 },
      liveliness: 0.12,
      lookGain: 0.15,
    }),
  ),

  // ── Added after the first pass, once the shape catalogue existed ──────────────
  //
  // These six are not decoration. Each is a moment the product already has and the
  // first twenty had no answer for: the character appearing for the first time,
  // acknowledging something without interrupting, a document going in, an answer being
  // written, something needing the learner's attention, and the character noticing a
  // thing the learner is looking at.

  def(
    "greeting",
    {
      label: "Greeting",
      note: "First appearance. It arrives, straightens, and looks pleased to see you. Used once.",
      morph: 0.34,
      ease: "snap",
      settle: 1.1,
      loop: null,
      expression: "bright",
      station: "corner",
      blinkIn: false,
    },
    (t) => {
      const k = pulse(t / 1.05, 0.28);
      return {
        body: {
          radii: blendRadii(SHAPES.blob, SHAPES.column, 0.45 * k),
          scale: 1 + 0.05 * k,
          taper: R_TAPER + 0.06 * k,
        },
        lift: -5.5 * k,
        eye: { h: E_H * (1 + 0.1 * k) },
        liveliness: 1,
        lookGain: 1,
      };
    },
  ),

  def(
    "nod",
    {
      label: "Nod",
      note: "Heard you. One dip, under half a second, and back — the smallest acknowledgement there is.",
      morph: 0.1,
      ease: "outQuint",
      settle: 0.42,
      loop: null,
      expression: "soft",
      station: "corner",
      blinkIn: false,
    },
    (t) => {
      // A DIP, NOT A BOUNCE. It goes down and comes back on an ease-out with no
      // overshoot; a nod that springs reads as a toy agreeing with you.
      const k = pulse(t / 0.42, 0.42);
      return {
        body: { squash: 1 + 0.05 * k, stretch: 1 - 0.025 * k, taper: R_TAPER },
        lift: 3.2 * k,
        eye: { h: E_H * (1 - 0.18 * k) },
        liveliness: 0.9,
        lookGain: 0.85,
      };
    },
  ),

  def(
    "ingesting",
    {
      label: "Ingesting",
      note: "A document going in. The form opens and fragments travel INWARD — the one state where they arrive rather than leave.",
      morph: 0.36,
      ease: "outSine",
      settle: 0.36,
      loop: 1.9,
      expression: "keen",
      station: "centre",
      blinkIn: true,
    },
    (t) => {
      // The fragments run from far out to nothing over each loop, so material is
      // visibly being taken in. `searching` is the same primitive pointed the other way,
      // which is exactly the contrast wanted: one reaches out, one draws in.
      const phase = (t % 1.9) / 1.9;
      return {
        body: {
          shape: "bloom",
          stretch: 1 + 0.03 * Math.sin(t * 3.3),
          squash: 1 + 0.02 * Math.sin(t * 3.3),
          ripple: 0.05,
          ripplePhase: -t * 70,
        },
        sat: {
          spread: 12 * (1 - EASINGS.outQuint(phase)),
          spin: -50 + phase * 40,
          sweep: 0.7,
          scatter: 0.45,
          scale: 0.16 * (1 - phase * 0.6),
          alpha: 1 - EASINGS.outQuint(phase) * 0.9,
        },
        gazeY: 0.2,
        liveliness: 0.6,
        lookGain: 0.3,
      };
    },
  ),

  def(
    "writing",
    {
      label: "Writing",
      note: "Composing an answer. A lens with a small, steady pulse — busy without being loud.",
      morph: 0.26,
      ease: "outSine",
      settle: 0.26,
      loop: 1.42,
      expression: "narrow",
      station: "corner",
      blinkIn: true,
    },
    (t) => ({
      body: {
        shape: "lens",
        stretch: 1 + 0.022 * Math.sin(t * 4.42),
        squash: 1 - 0.015 * Math.sin(t * 4.42),
        taper: R_TAPER + 0.05 * Math.sin(t * 2.21),
      },
      // The gaze tracks along as if following its own line, then returns. Smaller than
      // `reading`'s traverse, because it is producing rather than consuming.
      gazeX: -0.3 + 0.55 * triangle(t / 1.42),
      gazeY: 0.22,
      liveliness: 0.5,
      lookGain: 0.12,
    }),
  ),

  def(
    "alert",
    {
      label: "Alert",
      note: "Something needs the learner. One sharp rise, then it holds — no flashing, no colour, no repeat.",
      morph: 0.11,
      ease: "outQuint",
      settle: 0.7,
      loop: null,
      expression: "wide",
      station: "corner",
      blinkIn: false,
    },
    (t) => {
      // 🔴 IT RISES ONCE AND STOPS. A state that pulses forever to be noticed is a
      // notification badge, and the brief rules the character out of that job: it can
      // say "look at this" once, and then it is the interface's problem.
      const k = pulse(t / 0.6, 0.18);
      return {
        body: {
          shape: "column",
          scale: 1 + 0.04 * k,
          stretch: 1 - 0.02 * k,
          taper: R_TAPER,
        },
        lift: -4.5 * k,
        eye: { h: E_H * (1 + 0.12 * k), split: E_SPLIT * 0.96 },
        liveliness: 0.7,
        lookGain: 1,
      };
    },
  ),

  def(
    "curious",
    {
      label: "Curious",
      note: "Peering at something. Tips, leans, and holds — the state for following what the learner is looking at.",
      morph: 0.22,
      ease: "outQuint",
      settle: 0.5,
      loop: 5.3,
      expression: "keen",
      station: "corner",
      blinkIn: false,
    },
    (t) => ({
      body: {
        shape: "drop",
        // A slow shift of weight from one foot to the other while it looks. This is the
        // only looping body movement in the catalogue that travels at all, and it takes
        // five seconds to do it.
        tilt: -6 + 3 * Math.sin(t * 1.185),
        taper: -0.1 + 0.08 * Math.sin(t * 1.185),
        stretch: 0.99,
      },
      eye: { h: E_H * 1.12 },
      liveliness: 0.95,
      lookGain: 1,
    }),
  ),

  def(
    "wink",
    {
      label: "Wink",
      note: "A beat of complicity — half a second, one eye, and it is over. Used rarely and never twice in a row.",
      morph: 0.1,
      ease: "outQuint",
      settle: 0.5,
      loop: null,
      expression: "wry",
      station: "corner",
      blinkIn: false,
    },
    (t) => {
      const k = pulse(t / 0.46, 0.3);
      return {
        // The body barely takes part: it tips two and a half degrees and leans. The
        // whole gesture is in one eye, which is what keeps it from reading as mugging.
        body: { tilt: 2.5 * k, taper: R_TAPER + 0.06 * k },
        eye: { wink: k, h: E_H * (1 + 0.06 * k) },
        lift: -1.2 * k,
        liveliness: 0.9,
        lookGain: 0.9,
      };
    },
  ),
];

export const STATES: Readonly<Record<MascotMode, StateDef>> = Object.freeze(
  Object.fromEntries(CATALOGUE.map((s) => [s.id, s])) as Record<MascotMode, StateDef>,
);

/** Catalogue order — what the state board walks, and the order states were designed in. */
export const STATE_ORDER: readonly MascotMode[] = CATALOGUE.map((s) => s.id);

/** How long one full pass of a state takes, for the timeline and the freeze controls. */
export const stateDuration = (id: MascotMode): number => {
  const s = STATES[id];
  return s.loop ?? Math.max(s.settle, s.morph) + 0.35;
};

/**
 * The one frame that best represents each state.
 *
 * This does two jobs, which is why it is one table:
 *
 *  · THE STATE BOARD lands here by default, so twenty states shown at once are each
 *    caught at their most characteristic instant rather than all at t = 0 — where half
 *    of them are still indistinguishable from `idle`.
 *  · REDUCED MOTION holds here. The correct answer to `prefers-reduced-motion` is not to
 *    freeze at entry: `correct` at t = 0 has not expanded yet and `insight` has not
 *    resolved, so both would be invisible, and states that must stay distinguishable
 *    would collapse into the same picture. Holding the characteristic frame keeps every
 *    state readable with nothing moving at all.
 *
 * For one-shot states this is the PEAK of the gesture, not its end. For looping ones it
 * is a point far enough in for the loop's signature to have developed.
 */
const STILL: Record<MascotMode, number> = {
  idle: 0,
  notice: 0.5,
  listening: 0.9,
  thinking: 0.9,
  searching: 0.55,
  reading: 0.4,
  teaching: 1.6,
  question: 0.6,
  waiting: 0.9,
  evaluating: 0.2,
  correct: 0.13,
  partial: 0.9,
  incorrect: 0.26,
  confusion: 0.8,
  insight: 0.64,
  "generating-visual": 0.8,
  speaking: 0.215,
  success: 0.23,
  complete: 1.4,
  inactive: 1.2,
  greeting: 0.3,
  nod: 0.18,
  ingesting: 0.55,
  writing: 0.36,
  alert: 0.11,
  curious: 0.9,
  wink: 0.15,
};

export const stillTime = (id: MascotMode): number => STILL[id];
