// The animations, played.
//
// 🔴 `frameAt(animation, ms)` IS A PURE FUNCTION OF THE CLOCK. The reference this was
// measured from runs a state machine — it advances a cursor, and it draws the gap before
// each blink from `Math.random()` as it goes. That is a perfectly good way to drive a
// screen and a bad way to be checkable: the same instant renders differently depending on
// how you arrived at it, so a test cannot assert a frame, a scrubber cannot go backwards,
// and a screenshot is not reproducible. Here the whole timeline is addressable: give it a
// millisecond and it computes the step, the morph, the blink and the ambient wander from
// that number alone. See `./noise.ts`, which makes the same argument.

import { hash01, hashSigned } from "./noise";

import { FACE_BY_ID } from "./faces";
import { ANIMATION_BY_ID } from "./animations";
import type { Animation, EaseName, EyeSpec, Face, Step } from "./types";

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * The three shapes a morph can take.
 *
 * `smooth` is the one every animation in the set actually uses; the other two are here
 * because the reference offers them and a face authored against one would otherwise
 * arrive at the wrong speed.
 */
export function ease(name: EaseName, at: number): number {
  const p = clamp01(at);
  if (name === "snappy") return 1 - (1 - p) ** 3;
  if (name === "bouncy") {
    // A damped cosine, normalised so it still lands exactly on 1 at the end. Without the
    // divisor it overshoots and settles short, and a loop visibly steps at the seam.
    const end = 1 - Math.exp(-6) * Math.cos(8);
    return clamp01((1 - Math.exp(-6 * p) * Math.cos(8 * p)) / end);
  }
  return p * p * (3 - 2 * p);
}

const stepMs = (s: Step): number => s.transitionMs + s.holdMs;

/** How long one pass through the steps takes. A ping-pong plays that twice. */
export function animationDuration(a: Animation): number {
  const one = a.steps.reduce((sum, s) => sum + stepMs(s), 0);
  return a.mode === "pingPong" ? one * 2 : one;
}

/**
 * Which step is on screen at `ms`, and how far into it.
 *
 * Returns the index of the step being played, the index it is morphing FROM, and the
 * eased progress of that morph — 1 once the morph is done and the hold has begun.
 */
export interface Cursor {
  readonly step: number;
  readonly from: number;
  readonly progress: number;
}

export function cursorAt(a: Animation, ms: number): Cursor {
  const count = a.steps.length;
  if (count === 0) return { step: -1, from: -1, progress: 1 };
  const one = a.steps.reduce((sum, s) => sum + stepMs(s), 0);
  if (one <= 0) return { step: 0, from: 0, progress: 1 };

  let t = Math.max(0, ms);
  let order = a.steps.map((_, i) => i);
  if (a.mode === "once") {
    t = Math.min(t, one - 1e-6);
  } else if (a.mode === "pingPong" && count > 1) {
    const cycle = one * 2;
    t %= cycle;
    if (t >= one) {
      t -= one;
      order = [...order].reverse();
    }
  } else {
    t %= one;
  }

  for (let i = 0; i < count; i++) {
    const index = order[i]!;
    const s = a.steps[index]!;
    const span = stepMs(s);
    if (t >= span) {
      t -= span;
      continue;
    }
    // The step before this one in play order is what it is morphing away from — which is
    // the LAST step when we have just wrapped, so a loop's seam is a morph like any other
    // rather than a jump.
    const from = order[(i - 1 + count) % count]!;
    const progress = s.transitionMs <= 0 ? 1 : ease(s.ease, t / s.transitionMs);
    return { step: index, from, progress };
  }
  return { step: order[count - 1]!, from: order[count - 1]!, progress: 1 };
}

// ── Blending two faces ──────────────────────────────────────────────────────────

const mix = (a: number, b: number, p: number): number => a + (b - a) * p;

/**
 * The same angle as `to`, expressed as near `from` as possible.
 *
 * A head at 170 degrees morphing to one at -170 is a 20-degree turn, not a 340-degree
 * spin — but the plain numbers say otherwise, and the character whips all the way round.
 */
export function nearestAngle(to: number, from: number): number {
  let out = to;
  while (out - from > 180) out -= 360;
  while (out - from < -180) out += 360;
  return out;
}

const mixEye = (a: EyeSpec, b: EyeSpec, p: number): EyeSpec => ({
  width: mix(a.width, b.width, p),
  height: mix(a.height, b.height, p),
  x: mix(a.x, b.x, p),
  y: mix(a.y, b.y, p),
  angle: mix(a.angle, nearestAngle(b.angle, a.angle), p),
});

export function blendFaces(a: Face, b: Face, p: number): Face {
  if (p <= 0) return a;
  if (p >= 1) return b;
  return {
    id: b.id,
    head: {
      x: mix(a.head.x, nearestAngle(b.head.x, a.head.x), p),
      y: mix(a.head.y, nearestAngle(b.head.y, a.head.y), p),
      z: mix(a.head.z, nearestAngle(b.head.z, a.head.z), p),
    },
    spacing: mix(a.spacing, b.spacing, p),
    left: mixEye(a.left, b.left, p),
    right: mixEye(a.right, b.right, p),
    // 🔴 THE ARRIVING FACE'S MOTION, NOT A BLEND. These are named modes, not amounts;
    // there is no halfway between a tremble and a slow drift. Switching at the start of
    // the morph means the new life is already running as the new face arrives.
    eyeMotion: b.eyeMotion,
    bodyMotion: b.bodyMotion,
  };
}

// ── Blinking ────────────────────────────────────────────────────────────────────

/**
 * How open the eyes are at `ms`, 1 open and 0 shut.
 *
 * 🔴 THE SCHEDULE IS ADDRESSED, NOT ACCUMULATED. Blink `k` starts at a time computed from
 * `k` alone, so asking about a moment an hour in costs the same as asking about the first
 * second and gives the same answer every time. The gaps are still irregular — they come
 * out of a hash of the index rather than out of a counter — which is what keeps the
 * character from blinking metronomically.
 */
export function blinkAt(plan: Animation["blink"], ms: number): number {
  if (!plan || ms < plan.firstMs) return 1;
  const span = plan.maxGapMs - plan.minGapMs;
  let start = plan.firstMs;
  // Bounded: the loop advances by at least `durationMs + minGapMs` each time, so it
  // cannot spin, but a plan with a zero-length gap would still cost one step per blink
  // for a large `ms`. The cap is what stops a hand-written plan hanging the tab.
  for (let k = 0; k < 100_000; k++) {
    const end = start + plan.durationMs;
    if (ms < end) {
      // A triangle: shut at the middle of the blink, open at both ends.
      return Math.abs(((ms - start) / plan.durationMs) * 2 - 1);
    }
    const gap = plan.minGapMs + hash01(k * 2654435761) * span;
    const next = end + gap;
    if (next <= start) return 1;
    start = next;
    if (ms < start) return 1;
  }
  return 1;
}

// ── Ambient life ────────────────────────────────────────────────────────────────

const smoothstep = (v: number): number => v * v * (3 - 2 * v);

/** A value that wanders smoothly, changing direction every `interval` milliseconds. */
function wander(ms: number, axis: number, seed: number, interval: number): number {
  const p = ms / interval;
  const step = Math.floor(p);
  const blend = smoothstep(p - step);
  const a = hashSigned(Math.round((step * 3 + axis + seed) * 1000));
  const b = hashSigned(Math.round(((step + 1) * 3 + axis + seed) * 1000));
  return a + (b - a) * blend;
}

/**
 * A flick: still, then a fast move to a new place, then still again.
 *
 * This is what an eye actually does. A continuously drifting eye reads as unfocused;
 * holding still and jumping reads as looking at things.
 */
function saccade(ms: number, axis: number): number {
  if (ms <= 0) return 0;
  const interval = 1100;
  const move = 140;
  const step = Math.floor(ms / interval);
  const blend = smoothstep(Math.min(1, (ms - step * interval) / move));
  const a = step === 0 ? 0 : hashSigned(Math.round((step - 1) * 2 + axis + 17.29 * 1000));
  const b = hashSigned(Math.round(step * 2 + axis + 17.29 * 1000));
  return a + (b - a) * blend;
}

const seedOf = (f: Face): number => f.head.x * 0.71 + f.head.y * 1.13 + f.head.z * 1.37;

/** The wander applied to the eyes, in flat face units. */
export function eyeDriftAt(face: Face, ms: number, strength = 1): { x: number; y: number } {
  if (face.eyeMotion === "microSaccades") {
    return { x: saccade(ms, 0) * 1.5 * strength, y: saccade(ms, 1) * 0.9 * strength };
  }
  if (face.eyeMotion === "shake") {
    const t = ms / 1000;
    return {
      x: (Math.sin(t * 47) + Math.sin(t * 71) * 0.45) * 1.2 * strength,
      y: (Math.sin(t * 59) + Math.sin(t * 83) * 0.4) * 0.8 * strength,
    };
  }
  return { x: 0, y: 0 };
}

/** The wander applied to the head, in degrees. */
export function livenFace(face: Face, ms: number, strength = 1): Face {
  if (face.bodyMotion === "none") return face;
  const seed = seedOf(face);
  if (face.bodyMotion === "shake") {
    const t = ms / 1000;
    return {
      ...face,
      head: {
        x: face.head.x + (Math.sin(t * 31) + Math.sin(t * 53) * 0.45) * 1.15 * strength,
        y: face.head.y + (Math.sin(t * 37) + Math.sin(t * 61) * 0.4) * 1.35 * strength,
        z: face.head.z + Math.sin(t * 43) * 0.7 * strength,
      },
    };
  }
  return {
    ...face,
    head: {
      x: face.head.x + wander(ms, 0, seed, 2600) * 0.8 * strength,
      y: face.head.y + wander(ms, 1, seed, 3300) * 1.15 * strength,
      z: face.head.z + wander(ms, 2, seed, 4100) * 0.45 * strength,
    },
  };
}

// ── The whole frame ─────────────────────────────────────────────────────────────

export interface PlayedFace {
  /** The face to draw: already blended, already alive. */
  readonly face: Face;
  readonly blink: number;
  readonly eyeDrift: { readonly x: number; readonly y: number };
  /** Which authored face is on screen, for anything that wants to name it. */
  readonly stepFace: string;
  readonly step: number;
}

export interface PlayOptions {
  /** Off, the face is held exactly as authored: no morph easing life, no wander, no blink. */
  readonly reduced?: boolean;
}

/**
 * How long one animation takes to hand over to another, in milliseconds.
 *
 * 🔴 SWITCHING ANIMATIONS IS A MORPH, NOT A CUT (owner 2026-08-25: "the animations seem to
 * cut abruptly"). Every step INSIDE an animation already eases into the next — that is what
 * `transitionMs` is — so the only place the character ever jumped was the seam BETWEEN two
 * animations. It was also the most visible seam in the product, because it is the one the
 * surfaces drive: every time the app changed what it was doing, the character flinched.
 *
 * 500ms is the reference's own step transition, so a handover takes exactly as long as a
 * move within an animation and the two are indistinguishable to watch.
 */
export const HANDOVER_MS = 500;

/**
 * A playhead: one clock, any number of animations, morphing across every seam.
 *
 * 🔴 THIS IS STATE, AND IT IS HERE RATHER THAN IN THE COMPONENT ON PURPOSE. The bookkeeping
 * a smooth handover needs — what is playing, what was on screen when it changed, how far
 * through the morph we are — is exactly the part that was wrong, and a `useRef` tangle
 * inside a `requestAnimationFrame` callback is the one place in this codebase a test cannot
 * reach. It is a closure over four values; keeping it out here costs nothing and means the
 * fix for the owner's complaint is a thing that can be asserted.
 *
 * `at(ms, animationId)` is called once a frame with a clock that NEVER restarts. Changing
 * the id starts a morph out of whatever face was last returned — including a morph already
 * in flight, so two changes in quick succession do not snap to the first one's target.
 */
export interface Playhead {
  at(ms: number, animationId: string, opts?: PlayOptions): PlayedFace | null;
  /** Which animation is being played toward. */
  readonly playing: string;
}

export function createPlayhead(initial: string): Playhead {
  let playing = initial;
  let onScreen: Face | null = null;
  let from: Face | null = null;
  let startedAt = -Infinity;

  return {
    get playing() {
      return playing;
    },
    at(ms: number, animationId: string, opts: PlayOptions = {}): PlayedFace | null {
      if (animationId !== playing) {
        from = onScreen;
        startedAt = ms;
        playing = animationId;
      }
      const target = playedFaceAt(playing, ms, opts);
      if (!target) return null;

      let face = target.face;
      if (from && !opts.reduced) {
        const p = (ms - startedAt) / HANDOVER_MS;
        if (p >= 1) from = null;
        else {
          // 🔴 CLAMPED AT ZERO RATHER THAN SKIPPED. The first frame of a handover arrives at
          // exactly `startedAt`, so `p` is 0 — and an `if (p > 0)` guard there falls through
          // to the target face, which is precisely the jump this whole mechanism exists to
          // remove. It also poisons the next handover, because the face recorded as "on
          // screen" is then one the viewer never saw.
          face = blendFaces(from, target.face, ease("smooth", Math.max(0, p)));
        }
      }
      onScreen = face;
      return { ...target, face };
    },
  };
}

/** Everything needed to draw one instant of one animation. */
export function playedFaceAt(animationId: string, ms: number, opts: PlayOptions = {}): PlayedFace | null {
  const animation = ANIMATION_BY_ID.get(animationId);
  if (!animation || animation.steps.length === 0) return null;
  const cursor = cursorAt(animation, ms);
  const to = FACE_BY_ID.get(animation.steps[cursor.step]!.face);
  if (!to) return null;

  if (opts.reduced) {
    return { face: to, blink: 1, eyeDrift: { x: 0, y: 0 }, stepFace: to.id, step: cursor.step };
  }

  const from = FACE_BY_ID.get(animation.steps[cursor.from]!.face) ?? to;
  const blended = blendFaces(from, to, cursor.progress);
  return {
    face: livenFace(blended, ms),
    blink: blinkAt(animation.blink, ms),
    eyeDrift: eyeDriftAt(blended, ms),
    stepFace: to.id,
    step: cursor.step,
  };
}
