// The Nemesis mascot state vocabulary.
//
// Architecture follows the useful part of jeremy-prt/bloub: every state is a pure
// function of local time, transitions are owned by the engine, and the renderer only
// paints a complete pose. The visual language is Nemesis's own: one circular creature,
// expressive eyes, gaze, squash/stretch, restrained movement, and at most two
// monochrome fragments when a state genuinely needs an outside/inside relationship.
//
// NON-NEGOTIABLE: semantic states never select another silhouette. No triangle,
// hexagon, lens, drop, column, crystal, bloom, icon or exclamation transformation. The
// body begins from REST's circle and remains recognisably that circle throughout.

import { clamp01, EASINGS, pulse, triangle, type EaseName } from "./easing";
import type { ExpressionId } from "./expressions";
import { EYE_H, EYE_RISE, EYE_SPLIT, EYE_W } from "./geometry";
import { resolvePose, type PosePatch } from "./pose";
import type { MascotMode, MascotStation, Pose } from "./types";

export interface StateCtx {
  readonly confidence: number;
  readonly voice: number;
}

export const DEFAULT_CTX: StateCtx = { confidence: 1, voice: 0 };

export interface StateDef {
  readonly id: MascotMode;
  readonly label: string;
  readonly note: string;
  readonly morph: number;
  readonly ease: EaseName;
  readonly settle: number;
  readonly loop: number | null;
  readonly expression: ExpressionId;
  readonly station: MascotStation;
  readonly blinkIn: boolean;
  readonly pose: (t: number, ctx: StateCtx) => Pose;
}

const E_H = EYE_H;
const E_W = EYE_W;
const E_SPLIT = EYE_SPLIT;
const E_RISE = EYE_RISE;

type Meta = Omit<StateDef, "id" | "pose">;

function def(id: MascotMode, meta: Meta, pose: (t: number, ctx: StateCtx) => PosePatch): StateDef {
  return { id, ...meta, pose: (t, ctx) => resolvePose(pose(t, ctx)) };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
const doubt = (ctx: StateCtx) => 1 - clamp01(ctx.confidence);

/**
 * Nemesis's signature jump, authored as local deterministic motion rather than a spring
 * engine. `amount` scales travel and deformation, not time, so small acknowledgements
 * and major milestones share one physical vocabulary.
 */
function jumpPatch(t: number, amount = 1): PosePatch {
  const a = Math.max(0, amount);
  let stretch = 1;
  let squash = 1;
  let lift = 0;
  let eyeH = E_H;

  if (t < 0.1) {
    const k = EASINGS.outQuint(clamp01(t / 0.1));
    stretch = lerp(1, 1 + 0.08 * a, k);
    squash = lerp(1, 1 - 0.08 * a, k);
    lift = 1.8 * a * k;
    eyeH = E_H * (1 - 0.06 * a * k);
  } else if (t < 0.26) {
    const k = EASINGS.outQuint((t - 0.1) / 0.16);
    stretch = lerp(1 + 0.08 * a, 1 - 0.06 * a, k);
    squash = lerp(1 - 0.08 * a, 1 + 0.08 * a, k);
    lift = lerp(1.8 * a, -10.5 * a, k);
    eyeH = E_H * lerp(0.94, 1.04, a * k);
  } else if (t < 0.34) {
    const k = EASINGS.inOutSine((t - 0.26) / 0.08);
    stretch = lerp(1 - 0.06 * a, 1 - 0.01 * a, k);
    squash = lerp(1 + 0.08 * a, 1 + 0.01 * a, k);
    lift = lerp(-10.5 * a, -11.4 * a, k);
    eyeH = E_H * (1 + 0.05 * a);
  } else if (t < 0.5) {
    const k = EASINGS.inOutSine((t - 0.34) / 0.16);
    stretch = lerp(1 - 0.01 * a, 1 - 0.04 * a, k);
    squash = lerp(1 + 0.01 * a, 1 + 0.06 * a, k);
    lift = lerp(-11.4 * a, 0, k);
    eyeH = E_H * (1 + 0.03 * a * (1 - k));
  } else if (t < 0.59) {
    const k = EASINGS.outQuint((t - 0.5) / 0.09);
    stretch = lerp(1 - 0.04 * a, 1 + 0.21 * a, k);
    squash = lerp(1 + 0.06 * a, 1 - 0.18 * a, k);
    lift = 0;
    eyeH = E_H * (1 - 0.22 * a * k);
  } else if (t < 0.7) {
    const k = EASINGS.outQuint((t - 0.59) / 0.11);
    stretch = lerp(1 + 0.21 * a, 1 - 0.03 * a, k);
    squash = lerp(1 - 0.18 * a, 1 + 0.055 * a, k);
    lift = -2.2 * a * Math.sin(k * Math.PI);
    eyeH = E_H * lerp(1 - 0.22 * a, 1 + 0.04 * a, k);
  } else if (t < 0.82) {
    const k = EASINGS.outSine((t - 0.7) / 0.12);
    stretch = lerp(1 - 0.03 * a, 1 + 0.035 * a, k);
    squash = lerp(1 + 0.055 * a, 1 - 0.025 * a, k);
    lift = 0;
    eyeH = E_H * lerp(1 + 0.04 * a, 1 - 0.015 * a, k);
  } else if (t < 1) {
    const k = EASINGS.outQuint((t - 0.82) / 0.18);
    stretch = lerp(1 + 0.035 * a, 1, k);
    squash = lerp(1 - 0.025 * a, 1, k);
    eyeH = E_H * lerp(1 - 0.015 * a, 1, k);
  }

  return {
    body: { stretch, squash, taper: 0, pinch: 0, ripple: 0 },
    eye: { h: eyeH },
    lift,
  };
}

function mergePatch(a: PosePatch, b: PosePatch): PosePatch {
  return {
    ...a,
    ...b,
    body: { ...(a.body ?? {}), ...(b.body ?? {}) },
    eye: { ...(a.eye ?? {}), ...(b.eye ?? {}) },
    sat: { ...(a.sat ?? {}), ...(b.sat ?? {}) },
  };
}

const CATALOGUE: readonly StateDef[] = [
  def("idle", {
    label: "Idle",
    note: "Almost still. Life comes from deterministic gaze drift and blinking, not bobbing.",
    morph: 0.36, ease: "outSine", settle: 0.36, loop: 8, expression: "neutral", station: "corner", blinkIn: false,
  }, () => ({ body: { taper: 0, pinch: 0, ripple: 0 }, liveliness: 1, lookGain: 0.55 })),

  def("notice", {
    label: "Attentive",
    note: "The user has Nemesis's attention: a tiny upward stretch and a steady gaze.",
    morph: 0.16, ease: "outQuint", settle: 0.5, loop: null, expression: "keen", station: "corner", blinkIn: false,
  }, (t) => {
    const k = EASINGS.outQuint(clamp01(t / 0.35));
    return { body: { stretch: 0.985, squash: 1.025, taper: 0 }, lift: -1.6 * k, eye: { h: E_H * 1.06 }, liveliness: 0.9, lookGain: 0.95 };
  }),

  def("listening", {
    label: "Listening",
    note: "Focused on the learner. Voice energy gently swells the whole round body; no waveform.",
    morph: 0.22, ease: "outSine", settle: 0.3, loop: 3.6, expression: "keen", station: "corner", blinkIn: false,
  }, (t, ctx) => {
    const v = clamp01(ctx.voice);
    const breathe = 0.004 * Math.sin(t * 1.7);
    return { body: { stretch: 0.99 - 0.01 * v, squash: 1.015 + 0.025 * v + breathe, taper: 0 }, eye: { h: E_H * (1.06 - 0.05 * doubt(ctx)) }, liveliness: 0.9, lookGain: 0.95 };
  }),

  def("thinking", {
    label: "Thinking",
    note: "Slow internal-looking compression. The body remains round and never becomes three dots.",
    morph: 0.34, ease: "inOutSine", settle: 0.34, loop: 3.4, expression: "narrow", station: "centre", blinkIn: true,
  }, (t, ctx) => {
    const s = Math.sin((t / 3.4) * Math.PI * 2);
    return { body: { stretch: 1.02 + 0.025 * s, squash: 0.985 - 0.018 * s, tilt: 1.4 * s, taper: 0, pinch: 0, ripple: 0 }, eye: { h: E_H * 0.62, split: E_SPLIT * 0.95 }, gazeX: -0.18 + 0.22 * s, gazeY: 0.2, liveliness: 0.36 * (0.75 + 0.25 * (1 - doubt(ctx))), lookGain: 0.12 };
  }),

  def("searching", {
    label: "Searching",
    note: "The gaze deliberately scans and two monochrome fragments reach outward through a limited arc.",
    morph: 0.28, ease: "outQuint", settle: 0.28, loop: 2.4, expression: "keen", station: "centre", blinkIn: false,
  }, (t) => {
    const phase = triangle(t / 2.4) * 2 - 1;
    return { body: { stretch: 1.015, squash: 0.995, tilt: 1.2 * phase, taper: 0 }, sat: { spread: 7.5, spin: -90 + 42 * phase, sweep: 0.88, scatter: 0.18, scale: 0.13, alpha: 0.72 }, eye: { h: E_H * 1.08 }, gazeX: 0.72 * phase, gazeY: -0.12, liveliness: 0.5, lookGain: 0.2 };
  }),

  def("reading", {
    label: "Reading",
    note: "The body is quiet; the eyes traverse a line, return, and move down.",
    morph: 0.28, ease: "outSine", settle: 0.28, loop: 3.45, expression: "narrow", station: "corner", blinkIn: false,
  }, (t) => {
    const line = 1.15;
    const p = (t % line) / line;
    const x = p < 0.82 ? -0.76 + 1.52 * (p / 0.82) : 0.76 - 1.52 * EASINGS.outQuint((p - 0.82) / 0.18);
    const row = Math.floor((t % (line * 3)) / line);
    return { body: { stretch: 1, squash: 1, taper: 0 }, eye: { h: E_H * 0.78, w: E_W * 1.04 }, gazeX: x, gazeY: -0.24 + row * 0.22, liveliness: 0.5, lookGain: 0.08 };
  }),

  def("teaching", {
    label: "Teaching",
    note: "Composed and deliberately quiet beside the lesson.",
    morph: 0.3, ease: "outSine", settle: 0.3, loop: 6.4, expression: "soft", station: "corner", blinkIn: false,
  }, (t, ctx) => ({ body: { scale: 1 + 0.004 * Math.sin((t / 6.4) * Math.PI * 2), taper: 0 }, eye: { h: E_H * (1 - 0.06 * doubt(ctx)) }, lift: -0.6, liveliness: 0.82, lookGain: 0.62 })),

  def("question", {
    label: "Question",
    note: "Curious tilt and eye asymmetry. The circle stays a circle.",
    morph: 0.22, ease: "outQuint", settle: 0.55, loop: null, expression: "wry", station: "corner", blinkIn: false,
  }, (t) => {
    const k = EASINGS.outQuint(clamp01(t / 0.45));
    return { body: { tilt: 5.5 * k, stretch: 0.99, squash: 1.01, taper: 0 }, eye: { asym: 7 * k, h: E_H * 1.05 }, gazeY: 0.28, liveliness: 0.88, lookGain: 0.9 };
  }),

  def("waiting", {
    label: "Awaiting answer",
    note: "Your turn. The body goes almost completely still and the gaze stays with the composer.",
    morph: 0.36, ease: "outSine", settle: 0.65, loop: null, expression: "neutral", station: "corner", blinkIn: false,
  }, () => ({ body: { stretch: 1, squash: 1, tilt: 0, taper: 0 }, eye: { h: E_H * 0.94 }, gazeY: 0.3, liveliness: 0.58, lookGain: 0.9 })),

  def("evaluating", {
    label: "Evaluating answer",
    note: "A short analytical draw-in and one eye scan.",
    morph: 0.12, ease: "outQuint", settle: 0.45, loop: null, expression: "narrow", station: "corner", blinkIn: false,
  }, (t) => ({ body: { stretch: 1.055, squash: 0.95, scale: 0.99, taper: 0 }, eye: { h: E_H * 0.5, split: E_SPLIT * 0.9 }, gazeX: -0.45 + 0.9 * clamp01(t / 0.42), liveliness: 0.28, lookGain: 0.45 })),

  def("correct", {
    label: "Correct",
    note: "A tiny hop and soft landing; fast enough not to interrupt the next question.",
    morph: 0.08, ease: "outQuint", settle: 0.78, loop: null, expression: "bright", station: "corner", blinkIn: false,
  }, (t) => mergePatch(jumpPatch(t, 0.32), { liveliness: 0.9, lookGain: 0.75 })),

  def("partial", {
    label: "Near correct",
    note: "A small asymmetric lean that says close without becoming a negative reaction.",
    morph: 0.18, ease: "outQuint", settle: 0.75, loop: null, expression: "soft", station: "corner", blinkIn: false,
  }, (t) => {
    const k = EASINGS.outQuint(clamp01(t / 0.5));
    return { body: { tilt: 3 * k, stretch: 1.015, squash: 0.99, taper: 0 }, eye: { asym: 4 * k, h: E_H * 1.02 }, liveliness: 0.82, lookGain: 0.8 };
  }),

  def("incorrect", {
    label: "Incorrect",
    note: "Concerned attention, never anger or disappointment: one controlled downward squash, then correction can take over.",
    morph: 0.2, ease: "inOutSine", settle: 0.7, loop: null, expression: "concerned", station: "corner", blinkIn: false,
  }, (t) => {
    const k = pulse(t / 0.7, 0.34);
    return { body: { stretch: 1 + 0.06 * k, squash: 1 - 0.045 * k, taper: 0 }, lift: 1.3 * k, eye: { h: E_H * (1 - 0.12 * k) }, liveliness: 0.65, lookGain: 0.72 };
  }),

  def("confusion", {
    label: "Misconception detected",
    note: "Nemesis stops moving and studies the learner; stillness is the signal.",
    morph: 0.4, ease: "inOutSine", settle: 0.65, loop: null, expression: "narrow", station: "corner", blinkIn: false,
  }, () => ({ body: { stretch: 1.01, squash: 0.99, tilt: -2, taper: 0 }, eye: { h: E_H * 0.56, split: E_SPLIT * 0.9, asym: 5 }, lift: -0.7, liveliness: 0.2, lookGain: 1 })),

  def("insight", {
    label: "Breakthrough",
    note: "A clear medium jump with the signature squishy landing.",
    morph: 0.12, ease: "outQuint", settle: 1, loop: null, expression: "bright", station: "corner", blinkIn: false,
  }, (t) => mergePatch(jumpPatch(t, 0.78), { eye: { h: E_H * 1.08 }, liveliness: 0.88, lookGain: 0.75 })),

  def("generating-visual", {
    label: "Generating visual",
    note: "The circle leans toward the Canvas while two monochrome fragments move outward and back.",
    morph: 0.28, ease: "outQuint", settle: 0.28, loop: 1.8, expression: "keen", station: "corner", blinkIn: false,
  }, (t) => {
    const q = triangle(t / 1.8);
    return { body: { tilt: -2.5, stretch: 1.015, squash: 0.99, taper: 0 }, sat: { spread: 4 + 3 * q, spin: -22, sweep: 1, scatter: 0.22, scale: 0.12, alpha: 0.68 }, gazeX: 0.68, gazeY: -0.12, liveliness: 0.58, lookGain: 0.3 };
  }),

  def("speaking", {
    label: "Speaking",
    note: "TTS drives a restrained whole-body envelope. No mouth and no lip sync.",
    morph: 0.18, ease: "outQuint", settle: 0.18, loop: 0.9, expression: "soft", station: "corner", blinkIn: false,
  }, (t, ctx) => {
    const carrier = 0.25 + 0.75 * clamp01(ctx.voice);
    const a = carrier * (0.5 + 0.5 * Math.sin(t * 7));
    return { body: { stretch: 1 - 0.018 * a, squash: 1 + 0.03 * a, taper: 0 }, eye: { h: E_H * 1.01 }, lift: -0.7 * a, liveliness: 0.82, lookGain: 0.78 };
  }),

  def("success", {
    label: "Milestone",
    note: "A confident larger jump, one landing, no confetti.",
    morph: 0.1, ease: "outQuint", settle: 1, loop: null, expression: "bright", station: "corner", blinkIn: false,
  }, (t) => mergePatch(jumpPatch(t, 0.95), { liveliness: 0.9, lookGain: 0.75 })),

  def("complete", {
    label: "Curriculum complete",
    note: "The largest signature jump, then a calm proud circular rest.",
    morph: 0.14, ease: "outQuint", settle: 1.15, loop: 8.5, expression: "soft", station: "corner", blinkIn: false,
  }, (t) => t < 1 ? mergePatch(jumpPatch(t, 1), { liveliness: 0.88, lookGain: 0.72 }) : ({ body: { stretch: 0.985, squash: 1.015, taper: 0 }, lift: -0.8, liveliness: 0.58, lookGain: 0.55 })),

  def("inactive", {
    label: "Sleepy idle",
    note: "Long idle: the round body sits a little lower and the eyes become heavy.",
    morph: 0.65, ease: "inOutSine", settle: 0.7, loop: 8.8, expression: "weary", station: "corner", blinkIn: true,
  }, (t) => ({ body: { stretch: 1.025, squash: 0.98, taper: 0 }, eye: { open: 0.48 }, lift: 1.4 + 0.25 * Math.sin(t * 0.7), liveliness: 0.14, lookGain: 0.18 })),

  def("greeting", {
    label: "Greeting / document received",
    note: "A small pleased hop; the same physical acknowledgement is used when something arrives.",
    morph: 0.1, ease: "outQuint", settle: 1, loop: null, expression: "bright", station: "corner", blinkIn: false,
  }, (t) => mergePatch(jumpPatch(t, 0.58), { liveliness: 0.95, lookGain: 1 })),

  def("nod", {
    label: "Nod",
    note: "One restrained dip to acknowledge the learner.",
    morph: 0.08, ease: "outQuint", settle: 0.42, loop: null, expression: "soft", station: "corner", blinkIn: false,
  }, (t) => {
    const k = pulse(t / 0.42, 0.42);
    return { body: { stretch: 1 + 0.035 * k, squash: 1 - 0.025 * k, taper: 0 }, lift: 2.4 * k, eye: { h: E_H * (1 - 0.14 * k) }, liveliness: 0.9, lookGain: 0.85 };
  }),

  def("ingesting", {
    label: "Ingesting documents",
    note: "Monochrome fragments travel inward and disappear into an intact round body.",
    morph: 0.3, ease: "outSine", settle: 0.3, loop: 1.9, expression: "keen", station: "centre", blinkIn: false,
  }, (t) => {
    const phase = (t % 1.9) / 1.9;
    const inward = EASINGS.outQuint(phase);
    const absorb = Math.sin(phase * Math.PI);
    return { body: { stretch: 1 + 0.018 * absorb, squash: 1 - 0.012 * absorb, taper: 0 }, sat: { spread: 11 * (1 - inward), spin: -48 + phase * 28, sweep: 0.72, scatter: 0.35, scale: 0.135 * (1 - phase * 0.55), alpha: Math.max(0, 0.82 * (1 - inward)) }, gazeY: 0.16, liveliness: 0.55, lookGain: 0.3 };
  }),

  def("writing", {
    label: "Transcribing / writing",
    note: "A small precise rhythm while text is being formed; distinct from thinking.",
    morph: 0.22, ease: "outSine", settle: 0.22, loop: 1.5, expression: "narrow", station: "corner", blinkIn: false,
  }, (t) => ({ body: { stretch: 1 + 0.014 * Math.sin(t * 4.2), squash: 1 - 0.01 * Math.sin(t * 4.2), taper: 0 }, gazeX: -0.28 + 0.52 * triangle(t / 1.5), gazeY: 0.18, liveliness: 0.46, lookGain: 0.14 })),

  def("alert", {
    label: "Alert",
    note: "One sharp rise and hold. No flash, colour change or repeated bounce.",
    morph: 0.1, ease: "outQuint", settle: 0.55, loop: null, expression: "wide", station: "corner", blinkIn: false,
  }, (t) => {
    const k = EASINGS.outQuint(clamp01(t / 0.22));
    return { body: { stretch: 0.985, squash: 1.03, taper: 0 }, lift: -3.2 * k, eye: { h: E_H * 1.08 }, liveliness: 0.68, lookGain: 1 };
  }),

  def("curious", {
    label: "Curious",
    note: "A slow small tilt and gaze shift; the body itself never chases the pointer.",
    morph: 0.2, ease: "outQuint", settle: 0.42, loop: 5.2, expression: "keen", station: "corner", blinkIn: false,
  }, (t) => ({ body: { tilt: -4 + 1.6 * Math.sin((t / 5.2) * Math.PI * 2), stretch: 0.995, squash: 1.005, taper: 0 }, eye: { h: E_H * 1.08 }, liveliness: 0.94, lookGain: 1 })),

  def("wink", {
    label: "Wink",
    note: "Rare idle flourish: one eye, half a second, almost no body movement.",
    morph: 0.08, ease: "outQuint", settle: 0.5, loop: null, expression: "wry", station: "corner", blinkIn: false,
  }, (t) => {
    const k = pulse(t / 0.46, 0.3);
    return { body: { tilt: 1.8 * k, taper: 0 }, eye: { wink: k, h: E_H * (1 + 0.04 * k) }, lift: -0.6 * k, liveliness: 0.9, lookGain: 0.9 };
  }),
];

export const STATES: Readonly<Record<MascotMode, StateDef>> = Object.freeze(
  Object.fromEntries(CATALOGUE.map((s) => [s.id, s])) as Record<MascotMode, StateDef>,
);

export const STATE_ORDER: readonly MascotMode[] = CATALOGUE.map((s) => s.id);

export const stateDuration = (id: MascotMode): number => {
  const s = STATES[id];
  return s.loop ?? Math.max(s.settle, s.morph) + 0.35;
};

/** Characteristic frames for the state board and reduced-motion hold. */
const STILL: Record<MascotMode, number> = {
  idle: 0,
  notice: 0.42,
  listening: 0.9,
  thinking: 0.82,
  searching: 0.55,
  reading: 0.4,
  teaching: 1.6,
  question: 0.5,
  waiting: 0.65,
  evaluating: 0.24,
  correct: 0.74,
  partial: 0.55,
  incorrect: 0.28,
  confusion: 0.6,
  insight: 0.72,
  "generating-visual": 0.7,
  speaking: 0.22,
  success: 0.72,
  complete: 1.08,
  inactive: 1.2,
  greeting: 0.72,
  nod: 0.18,
  ingesting: 0.55,
  writing: 0.36,
  alert: 0.3,
  curious: 0.9,
  wink: 0.15,
};

export const stillTime = (id: MascotMode): number => STILL[id];
