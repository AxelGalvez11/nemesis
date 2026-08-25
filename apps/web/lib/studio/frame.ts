// One place that turns an edit into a picture.
//
// 🔴 THE STUDIO HAS EXACTLY ONE PATH TO A FRAME, and every surface in it — the stage,
// the filmstrip thumbnails, the timeline scrubber, the exported PNG — goes down that
// path. The alternative is what always happens to design tools: the big preview uses the
// real engine and the little thumbnails use a cheaper approximation, they disagree by a
// few units, and an author spends an afternoon chasing a difference that is in the tool
// rather than in the character.
//
// 🔴 AND IT IS STILL THE PRODUCT'S ENGINE DOING THE WORK. `poseOf` and `renderPose` are
// the same two functions `sampleState` calls, in the same order, with the same options.
// What this adds between them is the character's body layer — and only as multipliers
// and offsets on the pose the state produced, never as replacements. A studio that
// replaced the pose would be previewing something the product cannot render.

import { poseOf, renderPose, type SampleOptions } from "@/lib/mascot/engine";
import type { ExpressionDef } from "@/lib/mascot/expressions";
import type { Look } from "@/lib/mascot/gaze";
import { blendRadii, SHAPES, type ShapeId } from "@/lib/mascot/shapes";
import type { MascotFrame, MascotMode, Pose } from "@/lib/mascot/types";

import { compoundProfile } from "@/lib/mascot/compound";

import {
  motionOf,
  toExpressionDef,
  type HeadPlan,
  type StudioBody,
  type StudioCharacter,
  type StudioExpression,
} from "./document";
import { sampleAnimation, type AnimationSample } from "./playback";

/**
 * The character's compound silhouette, or `undefined` when it has no parts.
 *
 * 🔴 MEMOISED ON THE PARTS THEMSELVES, because `compoundProfile` ray-marches 48
 * directions against every part and the stage asks for a frame sixty times a second. The
 * key is the parts' own values, so an edit invalidates it and nothing else does. One
 * entry is enough in practice — the studio draws one character at a time — but the
 * filmstrip draws every face of it, so the cache is keyed rather than a single slot.
 */
const assembledCache = new Map<string, readonly number[]>();

export function assembledBody(character: StudioCharacter): readonly number[] | undefined {
  if (character.parts.length === 0) return undefined;
  const key = `${character.partBlend}|${character.parts
    .map((p) => `${p.shape},${p.dx},${p.dy},${p.rx},${p.ry},${p.rotate}`)
    .join(";")}`;
  const hit = assembledCache.get(key);
  if (hit) return hit;
  const made = compoundProfile(character.parts, character.partBlend);
  // Bounded, because every drag of a part slider mints a new key and an unbounded map
  // here would grow for as long as the tab is open.
  if (assembledCache.size > 64) assembledCache.clear();
  assembledCache.set(key, made);
  return made;
}

/** Clamped where the engine's own geometry expects these to live. */
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Lays the character's body over the pose a state produced.
 *
 * `assembled` is the compound silhouette when the character has one — resolved by the
 * caller rather than here, because a ray-march per frame is far too much and the parts
 * only change when the character does.
 */
export function applyBody(pose: Pose, body: StudioBody, assembled?: readonly number[]): Pose {
  const b = pose.body;
  // 🔴 A COMPOUND BODY OUTRANKS THE CATALOGUE SHAPE RATHER THAN BLENDING WITH IT. Parts
  // ARE the silhouette once there are any — mixing them with a named shape underneath
  // produces a form that is neither, and no author could predict it. `shapeMix` still
  // governs how far the STATE's own outline is pulled toward whichever of the two is in
  // charge, so thinking still gathers and insight still resolves.
  const own = assembled ?? SHAPES[body.shape];
  const radii = body.shapeMix > 0 ? blendRadii(b.radii, own, body.shapeMix) : b.radii;
  return {
    ...pose,
    body: {
      ...b,
      radii,
      scale: b.scale * body.scale,
      stretch: b.stretch * body.stretch,
      squash: b.squash * body.squash,
      tilt: b.tilt + body.tilt,
      // 🔴 CLAMPED AFTER THE OFFSET, NOT BEFORE. `taper` past ±1 folds the silhouette
      // through itself and `pinch` past 1 closes the waist to a point — both of which
      // draw a shape that is not a creature, and neither of which is reachable by adding
      // a legal offset to a legal pose unless the sum is left unchecked.
      taper: clamp(b.taper + body.taper, -1, 1),
      pinch: clamp(b.pinch + body.pinch, 0, 1),
      ripple: clamp(b.ripple + body.ripple, 0, 1),
    },
  };
}

export interface StudioFrameOptions {
  /** Seconds. Drives both the state's animation and the resting life. */
  readonly t: number;
  /** The state whose body is worn. */
  readonly mode: MascotMode;
  /** The face. Already blended, if an animation is mid-morph. */
  readonly def: ExpressionDef;
  /** Lid closure from an animation's blink plan, or `undefined` to let the engine blink. */
  readonly lid?: number;
  readonly look?: Look | null;
  readonly reduced?: boolean;
  readonly intensity?: number;
  /**
   * A silhouette this frame insists on, overriding the character's own.
   *
   * Set from the face being shown — see `StudioExpression.shape`. It exists so a
   * reference set can be a circle at rest and an egg in `egg`, which one shape per
   * character cannot express.
   */
  readonly shape?: ShapeId | null;
  readonly shapeMix?: number;
  /** Ambient movement, as the two liveliness amounts. See `motionOf`. */
  readonly motion?: { readonly eyes: number; readonly body: number };
  /** How the head is turned. All zero takes the engine's flat path. */
  readonly head?: HeadPlan;
}

/** The frame for one authored face at one instant. */
export function studioFrame(character: StudioCharacter, opts: StudioFrameOptions): MascotFrame {
  const sample: SampleOptions = {
    expressionDef: opts.def,
    look: opts.look ?? undefined,
    reduced: opts.reduced,
    intensity: opts.intensity,
    clock: opts.t,
    ...(opts.lid === undefined ? null : { lidOverride: opts.lid }),
    ...(opts.motion === undefined ? null : { motion: opts.motion }),
    ...(opts.head === undefined ? null : { head: opts.head }),
  };
  // A face's own silhouette outranks the character's. Merged here rather than in
  // `applyBody` so that function stays a plain "lay this body over that pose".
  const body =
    opts.shape != null
      ? { ...character.body, shape: opts.shape, shapeMix: opts.shapeMix ?? 1 }
      : character.body;
  const pose = applyBody(poseOf(opts.mode, opts.t, sample), body, assembledBody(character));
  return renderPose(pose, sample, opts.t);
}

/** The frame for a single saved face, held still or living at `t`. */
export function expressionFrame(
  character: StudioCharacter,
  expression: StudioExpression,
  t: number,
  extra: Partial<StudioFrameOptions> = {},
): MascotFrame {
  return studioFrame(character, {
    t,
    mode: expression.mode,
    def: toExpressionDef(expression),
    shape: expression.shape ?? null,
    shapeMix: expression.shapeMix,
    motion: motionOf(expression),
    head: expression.head,
    ...extra,
  });
}

export interface PlayingFrame {
  readonly frame: MascotFrame;
  readonly sample: AnimationSample;
}

/**
 * The frame for a playing animation at `t`.
 *
 * The body comes from the step's face rather than from the animation, because `mode` is
 * a property of the face in this document — see the note on `StudioExpression`. A step
 * that changes face therefore also changes body, which is what an author who set them
 * together expects to see.
 */
export function animationFrame(
  character: StudioCharacter,
  animationId: string,
  t: number,
  extra: Partial<StudioFrameOptions> = {},
): PlayingFrame | null {
  const anim = character.animations.find((a) => a.id === animationId);
  if (!anim) return null;
  const sample = sampleAnimation(anim, character.expressions, t);
  const step = sample.step >= 0 ? anim.steps[sample.step] : undefined;
  const face = step ? character.expressions.find((e) => e.id === step.expressionId) : undefined;
  const frame = studioFrame(character, {
    t,
    mode: face?.mode ?? "idle",
    def: sample.def,
    lid: sample.lid,
    shape: face?.shape ?? null,
    shapeMix: face?.shapeMix,
    motion: face ? motionOf(face) : undefined,
    head: face?.head,
    ...extra,
  });
  return { frame, sample };
}

/** The two ink colours for a character in the theme currently on screen. */
export function inkFor(character: StudioCharacter, dark: boolean): { ink: string; eye: string } {
  return dark
    ? { ink: character.inkDark, eye: character.eyeDark }
    : { ink: character.ink, eye: character.eye };
}

/** Which face an animation is showing at `t`, for anything that needs it outside a frame. */
export function faceAt(
  character: StudioCharacter,
  animationId: string,
  t: number,
): StudioExpression | undefined {
  const anim = character.animations.find((a) => a.id === animationId);
  if (!anim) return undefined;
  const sample = sampleAnimation(anim, character.expressions, t);
  const step = sample.step >= 0 ? anim.steps[sample.step] : undefined;
  return step ? character.expressions.find((e) => e.id === step.expressionId) : undefined;
}
