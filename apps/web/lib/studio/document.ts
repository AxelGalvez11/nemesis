// The studio document — what the character studio is editing.
//
// 🔴 THE ENGINE IS NOT EDITED, AND THAT IS THE WHOLE DESIGN. `lib/mascot` stays a pure,
// frozen catalogue compiled into the app. This is a separate layer that produces the
// same shapes the engine already accepts as INPUT: an `ExpressionDef` for
// `sampleState({ expressionDef })`, and a `Pose` for `renderPose(pose)`. Both are
// existing public entry points. Nothing here reaches into the engine's internals, so a
// studio bug can never make the shipped character render differently.
//
// 🔴 IT IS A DOCUMENT, NOT A SETTINGS OBJECT. The studio edits many characters, each
// with its own expressions and animations, and the whole thing round-trips through JSON
// so it can be exported, backed up and handed to someone else. That means every field
// here has to survive `JSON.parse(JSON.stringify(x))` — no functions, no `Map`, no
// class instances, no `undefined` used to mean anything.
//
// 🔴 AND EVERY DOCUMENT THAT COMES BACK FROM STORAGE IS DISTRUSTED. `normaliseDoc` is
// not a formality: localStorage survives a deploy, so a document written by an older
// build of the studio will be read by a newer one, and a document a user hand-edited
// will be read by both. Anything unreadable is repaired toward the default rather than
// thrown away, because throwing away is how somebody loses an afternoon of faces.

import { EXPRESSIONS, type ExpressionDef, type ExpressionId } from "@/lib/mascot/expressions";
import type { EaseName } from "@/lib/mascot/easing";
import { SHAPE_ORDER, type ShapeId } from "@/lib/mascot/shapes";
import { STATE_ORDER } from "@/lib/mascot/states";
import type { MascotMode } from "@/lib/mascot/types";

import { bloubReferenceCharacter } from "./bloub-reference";
import { DEFAULT_EYE, DEFAULT_EYE_DARK, DEFAULT_INK, DEFAULT_INK_DARK } from "./ink";

/** Bumped only when a change cannot be repaired by `normaliseDoc`. */
export const DOC_VERSION = 1;

// ── The pieces ──────────────────────────────────────────────────────────────────

/**
 * One authored face.
 *
 * `def` is exactly the engine's `ExpressionDef` minus its two display strings, which is
 * what lets the stage render an in-progress edit through the real engine rather than
 * through a preview approximation of it. What you drag is what ships.
 *
 * 🔴 `mode` IS PART OF THE EXPRESSION HERE, THOUGH IT IS NOT IN THE ENGINE. In the
 * engine a face and a body are orthogonal on purpose — that is what stops the catalogue
 * squaring. But an author is not composing a matrix, they are making ONE picture, and a
 * face judged over the wrong body is judged wrong: `bright` over `slab` and `bright`
 * over `column` are not the same drawing. So a saved expression remembers the body it
 * was drawn against. The orthogonality survives because this is only the body it is
 * PREVIEWED on; the exported `ExpressionDef` still composes with all 27 states.
 */
export interface StudioExpression {
  readonly id: string;
  readonly name: string;
  /** The six numbers the engine multiplies and offsets the state's eyes by. */
  readonly h: number;
  readonly w: number;
  readonly rise: number;
  readonly tilt: number;
  readonly asym: number;
  readonly curve: number;
  /** The state whose body this face is previewed over. Not exported with the face. */
  readonly mode: MascotMode;
  /**
   * A silhouette this face insists on, overriding the character's.
   *
   * 🔴 SHAPE HAD TO BECOME PER-FACE, AND THE REFERENCE IS WHY. It began as a character
   * property, which is true of a character that always looks like itself — and false of
   * every reference worth transcribing. bloub is a circle at rest, an egg in `egg`, a
   * hexagon in `hexagon`, a bar in `exclaim`, a triangle in `play`. One shape per
   * character cannot say that, so the whole set came out wearing our superellipse.
   * Owner, 2026-08-25: *"why isn't it circular like bloub?"*
   *
   * `null` (the default) leaves the character's own body in charge.
   */
  readonly shape?: ShapeId | null;
  /** 0..1, how far toward `shape`. Ignored when `shape` is null. */
  readonly shapeMix?: number;
  /** Author's note. Becomes the engine's `note` on export. */
  readonly note: string;
}

/** One step of an animation: hold this face for this long, arriving with this curve. */
export interface StudioStep {
  readonly expressionId: string;
  /** Seconds the face is held once it has arrived. */
  readonly hold: number;
  /** Seconds spent morphing INTO it from the step before. */
  readonly morph: number;
  readonly ease: EaseName;
  /**
   * Blink across the arrival, centred on the middle of the morph.
   *
   * 🔴 THIS IS A DISTINCT THING FROM THE ANIMATION'S BLINK SCHEDULE, and collapsing the
   * two loses the effect. The schedule is idle life — irregular, unrelated to what the
   * face is doing. This is punctuation: the eye shuts over a change of shape so the new
   * one reads as a decision rather than as a glitch, which only works because it is
   * placed exactly on the change. It is bloub's trick and the reference uses it on nine
   * of its fifteen states.
   */
  readonly blinkIn?: boolean;
}

export type PlaybackMode = "loop" | "once" | "pingpong";

/**
 * Blinking, as a schedule rather than as a step.
 *
 * 🔴 A BLINK IS NOT A FRAME IN THE TIMELINE, and modelling it as one is the mistake
 * that makes authored animations feel mechanical. A blink lands on top of whatever the
 * face is doing, at an interval that is deliberately irregular, and it has to be able to
 * land mid-morph. Kept as a schedule, it composes with every step for free.
 */
export interface BlinkPlan {
  /** Seconds after the animation starts before the first blink. */
  readonly first: number;
  /** Seconds between blinks — a range, sampled per blink. */
  readonly min: number;
  readonly max: number;
  /** Seconds for one close-and-open. */
  readonly dur: number;
}

export interface StudioAnimation {
  readonly id: string;
  readonly name: string;
  readonly steps: readonly StudioStep[];
  readonly playback: PlaybackMode;
  /** `null` means this animation does not blink at all. */
  readonly blink: BlinkPlan | null;
}

/**
 * The body an author can shape without writing a new `r(theta)`.
 *
 * 🔴 THE SILHOUETTE CATALOGUE IS NOT EDITABLE HERE, AND THAT IS DELIBERATE. A shape in
 * the engine is a closed-form function normalised to unit area — the property that lets
 * any two morph by plain interpolation with no path-morphing library. Exposing 48 raw
 * radii to a slider would let an author break that invariant in a way that looks fine
 * standing still and tears during a transition. What is exposed instead is safe by
 * construction: WHICH catalogue shape, and how far the character insists on it.
 *
 * 🔴 `shapeMix` IS ONE SLIDER DOING THE WORK OF A MODE SWITCH, on purpose. The obvious
 * design is a "pin my shape / follow the state" toggle, and it has a dead end at each
 * setting: pinned, the state's silhouette changes stop meaning anything and `insight`
 * stops resolving into a crystal; following, the character's own shape is never worn.
 * As a mix, 0 is the shipped behaviour, 1 is a character that always looks like itself,
 * and everything between is "recognisably me, still visibly thinking".
 *
 * 🔴 EVERY OTHER FIELD IS A MULTIPLIER OR AN OFFSET, NEVER AN ABSOLUTE — the same rule
 * expressions follow, for the same reason. The state has already decided how much the
 * body is gathering at the waist; a character that SET `pinch` outright would erase that
 * and every state would carry the same outline.
 */
export interface StudioBody {
  /** The character's own silhouette. */
  readonly shape: ShapeId;
  /** 0 = the state drives the outline entirely; 1 = always `shape`. */
  readonly shapeMix: number;
  /** Multipliers on what the state produced. */
  readonly scale: number;
  readonly stretch: number;
  readonly squash: number;
  /** Degrees, added to the state's tilt. */
  readonly tilt: number;
  /** Added to the state's own outline deformation. See `BodyPose` for what each does. */
  readonly taper: number;
  readonly pinch: number;
  readonly ripple: number;
}

export interface StudioCharacter {
  readonly id: string;
  readonly name: string;
  /** Body colour in light mode, and its dark-mode counterpart. */
  readonly ink: string;
  readonly inkDark: string;
  /** The colour cut out of the body for the eyes. */
  readonly eye: string;
  readonly eyeDark: string;
  readonly body: StudioBody;
  /**
   * What the eyes are cut as.
   *
   * 🔴 A CHARACTER PROPERTY, NOT A PER-FACE ONE, because it is identity rather than
   * expression — bloub's eyes are capsules in every state it has, and Nemesis's are its
   * own silhouette in every state. A character whose eye shape changed between faces
   * would read as two characters.
   */
  readonly eyeShape: "blob" | "capsule";
  readonly expressions: readonly StudioExpression[];
  readonly animations: readonly StudioAnimation[];
}

export interface StudioDoc {
  readonly version: number;
  readonly characters: readonly StudioCharacter[];
  /** Id of the character being edited. Always present in `characters`. */
  readonly selected: string;
}

// ── Ids ─────────────────────────────────────────────────────────────────────────

/**
 * 🔴 NOT `crypto.randomUUID()`, AND NOT BECAUSE OF BROWSER SUPPORT. Ids land in an
 * exported document that a person reads and hand-edits, and a 36-character hex string
 * makes an animation's `steps` unreadable. This is short, sorted-by-creation, and
 * collision-safe within a document because it consults the document.
 */
export function freshId(prefix: string, taken: Iterable<string>): string {
  const seen = new Set(taken);
  for (let n = 1; ; n++) {
    const id = `${prefix}-${n}`;
    if (!seen.has(id)) return id;
  }
}

// ── Defaults ────────────────────────────────────────────────────────────────────

/**
 * The nine engine expressions, as editable studio rows.
 *
 * 🔴 THE STUDIO OPENS ON THE REAL CATALOGUE, NOT ON A BLANK PAGE. An author given nine
 * working faces to pull apart gets somewhere; an author given six sliders at zero has to
 * discover what the sliders mean first. These are the shipped values, read from the
 * engine at module load, so the studio cannot drift out of step with what the product
 * actually renders.
 */
export function seedExpressions(): StudioExpression[] {
  return (Object.keys(EXPRESSIONS) as ExpressionId[]).map((id) => {
    const e = EXPRESSIONS[id];
    return {
      id,
      name: e.label,
      h: e.h,
      w: e.w,
      rise: e.rise,
      tilt: e.tilt,
      asym: e.asym,
      curve: e.curve,
      mode: "idle" as MascotMode,
      shape: null,
      shapeMix: 0,
      note: e.note,
    };
  });
}

export { DEFAULT_EYE, DEFAULT_EYE_DARK, DEFAULT_INK, DEFAULT_INK_DARK } from "./ink";

export const DEFAULT_BODY: StudioBody = {
  shape: "blob",
  shapeMix: 0,
  scale: 1,
  stretch: 1,
  squash: 1,
  tilt: 0,
  taper: 0,
  pinch: 0,
  ripple: 0,
};

export function newCharacter(name: string, id: string): StudioCharacter {
  const expressions = seedExpressions();
  return {
    id,
    name,
    ink: DEFAULT_INK,
    inkDark: DEFAULT_INK_DARK,
    eye: DEFAULT_EYE,
    eyeDark: DEFAULT_EYE_DARK,
    body: DEFAULT_BODY,
    eyeShape: "blob",
    expressions,
    animations: [
      {
        id: "anim-1",
        name: "Greeting",
        steps: [
          { expressionId: "neutral", hold: 1.4, morph: 0.45, ease: "outQuint" },
          { expressionId: "bright", hold: 1.8, morph: 0.5, ease: "outQuint" },
          { expressionId: "soft", hold: 1.6, morph: 0.6, ease: "outQuint" },
        ],
        playback: "loop",
        blink: { first: 2.1, min: 2.8, max: 5, dur: 0.26 },
      },
    ],
  };
}

/**
 * A fresh studio: the shipped character, and the reference beside it.
 *
 * 🔴 BOTH, NOT ONE. "Nemesis" is the nine faces the product actually renders, so an edit
 * there is an edit to something real. "Bloub reference" is the measured transcription of
 * jeremy-prt/bloub — fifteen states at their own timings — which is what you compare
 * against when you want to know whether a face you just made is as good as the reference.
 * A studio holding only the first has nothing to judge by; one holding only the second
 * has nothing to ship.
 *
 */
export function newDoc(): StudioDoc {
  const first = newCharacter("Nemesis", "char-1");
  const reference = bloubReferenceCharacter("char-2");
  return { version: DOC_VERSION, characters: [first, reference], selected: first.id };
}

// ── Repair ──────────────────────────────────────────────────────────────────────

const num = (v: unknown, fallback: number, lo: number, hi: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

const str = (v: unknown, fallback: string): string =>
  typeof v === "string" && v.length > 0 ? v : fallback;

/** A hex colour, or the fallback. Anything else would end up in a `style` attribute. */
const colour = (v: unknown, fallback: string): string =>
  typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback;

const shapeId = (v: unknown, fallback: ShapeId): ShapeId =>
  typeof v === "string" && (SHAPE_ORDER as readonly string[]).includes(v) ? (v as ShapeId) : fallback;

const mode = (v: unknown): MascotMode =>
  typeof v === "string" && (STATE_ORDER as readonly string[]).includes(v) ? (v as MascotMode) : "idle";

/**
 * The bounds every authored number is held inside.
 *
 * 🔴 THESE ARE THE SLIDER RANGES AND THE REPAIR CLAMPS AT ONCE, from one table, because
 * having two tables is how a document that a slider cannot produce gets written by
 * import and then silently clipped on the next edit. Widths are generous — the point of
 * a studio is to find out what is too far — but finite: `h: 0` is a closed eye that no
 * blink can reopen, and a `scale` of 40 paints a body the viewBox cannot hold.
 */
export const LIMITS = {
  h: { min: 0.05, max: 2.5, step: 0.01 },
  // 🔴 3, NOT 2.5, AND THE REFERENCE IS WHY. bloub's `notify` eye is 0.505 wide against a
  // resting 0.186 — a multiplier of 2.72 — so a ceiling of 2.5 silently clipped the one
  // state whose whole read is a very wide, short eye. A limit that cannot express the
  // reference is not a safety rail, it is a missing feature.
  w: { min: 0.3, max: 3, step: 0.01 },
  rise: { min: -0.35, max: 0.35, step: 0.005 },
  tilt: { min: -35, max: 35, step: 0.5 },
  asym: { min: -40, max: 40, step: 0.5 },
  curve: { min: -1, max: 1, step: 0.01 },
  scale: { min: 0.3, max: 2, step: 0.01 },
  stretch: { min: 0.4, max: 1.8, step: 0.01 },
  squash: { min: 0.4, max: 1.8, step: 0.01 },
  bodyTilt: { min: -30, max: 30, step: 0.5 },
  shapeMix: { min: 0, max: 1, step: 0.01 },
  // Offsets, so the ranges are half-width: the state has already spent part of the
  // budget and a full-width offset on top of it turns the outline inside out.
  taper: { min: -0.6, max: 0.6, step: 0.01 },
  pinch: { min: -0.5, max: 0.5, step: 0.01 },
  ripple: { min: -0.5, max: 0.5, step: 0.01 },
  hold: { min: 0.1, max: 20, step: 0.1 },
  morph: { min: 0, max: 5, step: 0.05 },
  blinkFirst: { min: 0, max: 20, step: 0.1 },
  blinkGap: { min: 0.4, max: 30, step: 0.1 },
  blinkDur: { min: 0.06, max: 1.5, step: 0.01 },
} as const;

export type LimitKey = keyof typeof LIMITS;

const clampTo = (key: LimitKey, v: unknown, fallback: number): number =>
  num(v, fallback, LIMITS[key].min, LIMITS[key].max);

function repairExpression(raw: unknown, id: string): StudioExpression {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    id,
    name: str(o.name, "Untitled"),
    h: clampTo("h", o.h, 1),
    w: clampTo("w", o.w, 1),
    rise: clampTo("rise", o.rise, 0),
    tilt: clampTo("tilt", o.tilt, 0),
    asym: clampTo("asym", o.asym, 0),
    curve: clampTo("curve", o.curve, 0),
    mode: mode(o.mode),
    // `null` is the meaningful default here, so an unrecognised value must land on null
    // rather than on a shape — a face that silently acquired a silhouette would override
    // the character's body for reasons nobody chose.
    shape: o.shape == null ? null : shapeId(o.shape, "blob"),
    shapeMix: o.shape == null ? 0 : clampTo("shapeMix", o.shapeMix, 1),
    note: typeof o.note === "string" ? o.note : "",
  };
}

function repairBody(raw: unknown): StudioBody {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    shape: shapeId(o.shape, DEFAULT_BODY.shape),
    shapeMix: clampTo("shapeMix", o.shapeMix, 0),
    scale: clampTo("scale", o.scale, 1),
    stretch: clampTo("stretch", o.stretch, 1),
    squash: clampTo("squash", o.squash, 1),
    tilt: clampTo("bodyTilt", o.tilt, 0),
    taper: clampTo("taper", o.taper, 0),
    pinch: clampTo("pinch", o.pinch, 0),
    ripple: clampTo("ripple", o.ripple, 0),
  };
}

function repairAnimation(raw: unknown, id: string, expressionIds: Set<string>): StudioAnimation {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rawSteps = Array.isArray(o.steps) ? o.steps : [];
  // 🔴 A STEP POINTING AT A DELETED FACE IS DROPPED, NOT REPAIRED TO A DEFAULT. Silently
  // rewriting it to `neutral` produces an animation that plays without error and is not
  // the one the author made, which is worse than one that is visibly shorter.
  const steps: StudioStep[] = [];
  for (const s of rawSteps) {
    const so = (s ?? {}) as Record<string, unknown>;
    const ref = typeof so.expressionId === "string" ? so.expressionId : "";
    if (!expressionIds.has(ref)) continue;
    steps.push({
      expressionId: ref,
      hold: clampTo("hold", so.hold, 1.5),
      morph: clampTo("morph", so.morph, 0.45),
      ease: typeof so.ease === "string" ? (so.ease as EaseName) : "outQuint",
      blinkIn: so.blinkIn === true,
    });
  }
  const playback: PlaybackMode =
    o.playback === "once" || o.playback === "pingpong" ? o.playback : "loop";

  let blink: BlinkPlan | null = null;
  if (o.blink != null && typeof o.blink === "object") {
    const b = o.blink as Record<string, unknown>;
    const min = clampTo("blinkGap", b.min, 2.8);
    // Held in order rather than rejected — a swapped pair is a typo, not a corruption.
    const max = Math.max(min, clampTo("blinkGap", b.max, 5));
    blink = { first: clampTo("blinkFirst", b.first, 2.1), min, max, dur: clampTo("blinkDur", b.dur, 0.26) };
  }
  return { id, name: str(o.name, "Untitled"), steps, playback, blink };
}

function repairCharacter(raw: unknown, id: string): StudioCharacter {
  const o = (raw ?? {}) as Record<string, unknown>;
  const rawExpressions = Array.isArray(o.expressions) ? o.expressions : [];
  // 🔴 A CHARACTER WITH NO FACES IS NOT A CHARACTER. Every downstream surface — the
  // filmstrip, the timeline, the stage's current face — assumes at least one, and the
  // repair is where that assumption is made true rather than at each of those sites.
  const expressions: StudioExpression[] =
    rawExpressions.length > 0
      ? rawExpressions.map((e, i) => {
          const eo = (e ?? {}) as Record<string, unknown>;
          return repairExpression(e, str(eo.id, `expr-${i + 1}`));
        })
      : seedExpressions();

  // Duplicate ids would make selection ambiguous and animation steps resolve to whichever
  // came first. Renamed rather than dropped: the face itself is still wanted.
  const seenIds = new Set<string>();
  const uniqueExpressions = expressions.map((e) => {
    if (!seenIds.has(e.id)) {
      seenIds.add(e.id);
      return e;
    }
    const id = freshId("expr", seenIds);
    seenIds.add(id);
    return { ...e, id };
  });

  const rawAnimations = Array.isArray(o.animations) ? o.animations : [];
  const animIds = new Set<string>();
  const animations = rawAnimations.map((a, i) => {
    const ao = (a ?? {}) as Record<string, unknown>;
    let aid = str(ao.id, `anim-${i + 1}`);
    if (animIds.has(aid)) aid = freshId("anim", animIds);
    animIds.add(aid);
    return repairAnimation(a, aid, seenIds);
  });

  return {
    id,
    name: str(o.name, "Untitled"),
    ink: colour(o.ink, DEFAULT_INK),
    inkDark: colour(o.inkDark, DEFAULT_INK_DARK),
    eye: colour(o.eye, DEFAULT_EYE),
    eyeDark: colour(o.eyeDark, DEFAULT_EYE_DARK),
    body: repairBody(o.body),
    eyeShape: o.eyeShape === "capsule" ? "capsule" : "blob",
    expressions: uniqueExpressions,
    animations,
  };
}

/**
 * Turns anything at all into a usable document.
 *
 * Never throws and never returns an empty document: an unreadable input becomes the
 * default rather than a blank studio, because the studio's own storage is the thing most
 * likely to hand it garbage and a blank studio reads as "your work is gone".
 */
export function normaliseDoc(raw: unknown): StudioDoc {
  if (raw == null || typeof raw !== "object") return newDoc();
  const o = raw as Record<string, unknown>;
  const rawChars = Array.isArray(o.characters) ? o.characters : [];
  if (rawChars.length === 0) return newDoc();

  const ids = new Set<string>();
  const characters = rawChars.map((c, i) => {
    const co = (c ?? {}) as Record<string, unknown>;
    let id = str(co.id, `char-${i + 1}`);
    if (ids.has(id)) id = freshId("char", ids);
    ids.add(id);
    return repairCharacter(c, id);
  });

  const selected =
    typeof o.selected === "string" && ids.has(o.selected) ? o.selected : characters[0]!.id;
  return { version: DOC_VERSION, characters, selected };
}

// ── Reading the document ────────────────────────────────────────────────────────

export function characterOf(doc: StudioDoc): StudioCharacter {
  return doc.characters.find((c) => c.id === doc.selected) ?? doc.characters[0]!;
}

/** The studio row as the engine's own type, ready for `sampleState({ expressionDef })`. */
export function toExpressionDef(e: StudioExpression): ExpressionDef {
  return { label: e.name, note: e.note, h: e.h, w: e.w, rise: e.rise, tilt: e.tilt, asym: e.asym, curve: e.curve };
}

/** Seconds for one full pass of an animation, morphs included. */
export function animationDuration(anim: StudioAnimation): number {
  const one = anim.steps.reduce((sum, s) => sum + s.morph + s.hold, 0);
  return anim.playback === "pingpong" ? one * 2 : one;
}
