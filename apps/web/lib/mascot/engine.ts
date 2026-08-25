// The engine. No framework, no DOM, and no clock of its own.
//
// 🔴 `sample(t)` IS A PURE FUNCTION OF TIME. Ask for the same `t` twice, in any order,
// and you get the same frame. That single property is what makes all of this possible
// at once: pausing, scrubbing, running at a tenth speed, freezing twenty states at
// twenty different timestamps on one page, screenshotting a transition at 40%, and
// testing every state's geometry with no browser anywhere near it.
//
// The things that would quietly break it:
//
//  · accumulating anything per frame (a blink countdown, a phase angle, an eased value)
//  · `Math.random()` or `Date.now()` anywhere below this file
//  · `sample()` mutating its own state — "purging the stale previous state" looks free
//    and makes re-reading an earlier timestamp return a different frame
//
// The engine does hold state, but only INPUT state: which mode it was told to show and
// when, and where it was last told to look. Those are events from the outside world,
// not animation.

import { clamp01, EASINGS, lerp } from "./easing";
import {
  applyExpression,
  blendExpression,
  EXPRESSIONS,
  EYES_ALIKE,
  type ExpressionDef,
  type ExpressionId,
} from "./expressions";
import { BLINK_HALF, liveliness, maskBlink } from "./face";
import {
  BODY,
  EYE_TRAVEL_U,
  EYE_TRAVEL_V,
  SATELLITES,
  closedPath,
  eyeOnSphere,
  fitGaze,
  headIsRest,
  satellitePlacement,
  silhouette,
  type Head,
  type Point,
} from "./geometry";
import { NO_LOOK, type Look } from "./gaze";
import { blendPose, scalePose } from "./pose";
import { DEFAULT_CTX, STATES, stillTime, type StateCtx } from "./states";
import type { BeadRender, EyeRender, MascotFrame, MascotMode, Pose } from "./types";

/** Everything that shades a sample but is not the mode itself. */
export interface SampleOptions {
  readonly ctx?: StateCtx;
  readonly look?: Look;
  /**
   * Overrides the expression each state would wear by default. See expressions.ts on
   * why emotion is a separate axis from mode.
   */
  readonly expression?: ExpressionId;
  /**
   * An already-blended expression, for when one is morphing into another. The engine
   * fills this in; callers pass `expression` instead.
   */
  readonly expressionDef?: ExpressionDef;
  /** 0..1 — how far from `REST` the pose is allowed to travel. */
  readonly intensity?: number;
  /**
   * Hold the state's characteristic frame and stop all resting life.
   * See `STILL` in states.ts for why holding beats freezing.
   */
  readonly reduced?: boolean;
  /**
   * The clock the resting life reads. Defaults to the state's own local time; the
   * engine passes global time instead, so blinks do not restart on every state change.
   */
  readonly clock?: number;
  /**
   * 0..1, how present the character is. 0 scales it to nothing and fades it out.
   * Arriving and leaving are a dimension over every state, not two more states.
   */
  readonly presence?: number;
  /**
   * Forces the lid shut regardless of the blink schedule. The engine uses it to blink
   * across a state change that carries a big change of silhouette; see `blinkIn`.
   */
  readonly lidOverride?: number;
  /**
   * Overrides the pose's own `liveliness`, separately for eyes and body.
   *
   * 🔴 AN OVERRIDE, NOT A REPLACEMENT OF THE FIELD. States set `liveliness` as part of
   * their pose and must keep doing so — `confusion` stares deliberately, at 0. This is
   * for a caller that is authoring rather than playing back, and it is absent everywhere
   * in the product.
   */
  readonly motion?: { readonly eyes: number; readonly body: number };
  /**
   * Turn the head, placing the eyes on a sphere instead of flat on the silhouette.
   *
   * 🔴 ABSENT OR ALL-ZERO TAKES THE FLAT PATH, BIT FOR BIT. The spherical placement is a
   * separate branch rather than a generalisation that happens to reduce to the flat case,
   * because "happens to reduce" is a claim nobody can check and this one is checkable:
   * with no head, not one line of the sphere code runs. See `eyeOnSphere`.
   */
  readonly head?: Head;
}

const DEG = Math.PI / 180;

/**
 * Turns a complete pose into a frame.
 *
 * Pure. This is where gaze mixing, the blink and the containment fit happen, because all
 * three need the pose AT THIS INSTANT — a caller that tried to pre-compute them would be
 * reading the pose's arrival value while a morph was still running, and the eyes would
 * jump on every state change.
 */
export function renderPose(pose: Pose, opts: SampleOptions = {}, t = 0): MascotFrame {
  const look = opts.look ?? NO_LOOK;
  const reduced = opts.reduced ?? false;
  const clockNow = reduced ? 0 : (opts.clock ?? t);
  const eyeLife = reduced ? 0 : (opts.motion?.eyes ?? pose.liveliness);
  const bodyLife = reduced ? 0 : (opts.motion?.body ?? pose.liveliness);
  const live = liveliness(clockNow, eyeLife, bodyLife);

  const b = pose.body;
  const cx = BODY.cx + b.dx;
  const cy = BODY.cy + b.dy + pose.lift + live.shift;
  // 🔴 PRESENCE MULTIPLIES, IT DOES NOT REPLACE. Arriving has to work from any state
  // and mid-transition, so it is a factor over whatever the pose already decided rather
  // than a pose of its own that would fight the one being blended.
  const presence = clamp01(opts.presence ?? 1);
  // 🔴 LINEAR IN `presence`, AND THE EASING LIVES IN THE CALLER. Front-loading the curve
  // here (an `outQuint`, which is right for almost everything else in this engine) puts
  // two thirds of the growth into the first fifth of the ramp, and the character reads
  // as POPPING in rather than arriving. The component eases presence over time; this
  // only has to be continuous.
  const grow = 0.06 + 0.94 * presence;
  const rx = BODY.rx * b.scale * b.stretch * grow;
  const ry = BODY.ry * b.scale * b.squash * grow * live.breath;

  // ── The silhouette ────────────────────────────────────────────────────────────
  const pts: Point[] = silhouette(b, undefined, rx, ry);
  const d = closedPath(pts);

  const cos = Math.cos(b.tilt * DEG);
  const sin = Math.sin(b.tilt * DEG);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const eat = (px: number, py: number) => {
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  };
  for (const p of pts) eat(cx + p.x * cos - p.y * sin, cy + p.x * sin + p.y * cos);

  // 🔴 THE EXTERNAL TARGET REPLACES THE POSE'S BIAS IN ABSOLUTE TERMS, AND DRIFT IS
  // ADDED AFTERWARDS. Mixing drift in first would let `command` cancel it, so a mascot
  // given a target would go rigid — including on touch devices, where a resting target
  // is the permanent condition.
  const command = clamp01(look.mix * pose.lookGain);
  const gx = lerp(pose.gazeX, look.x, command) + live.dx * (1 - command);
  const gy = lerp(pose.gazeY, look.y, command) + live.dy * (1 - command);

  // ── The face ──────────────────────────────────────────────────────────────────
  const eye = pose.eye;
  const lid = opts.lidOverride === undefined ? live.lid : Math.min(live.lid, opts.lidOverride);
  const halfH = eye.h * eye.open * lid;
  const offU = gx * EYE_TRAVEL_U;
  const offV = gy * EYE_TRAVEL_V;
  // The waist takes room away exactly where the eyes live, so the fit has to know about
  // it — otherwise a gaze that is safe on the resting body clips through a pinched one.
  const limit = 0.8 - 0.22 * b.pinch;
  // 🔴 THE FIT IS COMPUTED FOR THE LARGER EYE, NOT FOR THE SHARED ONE. With a per-eye
  // tweak in play the two eyes no longer have the same extents, and `fitGaze` returns a
  // single scale for both — so feeding it `eye.w` alone would size the containment to a
  // narrow left eye and let a wide right one push its corner straight through the
  // silhouette. Taking the maximum makes the fit safe for whichever eye is bigger and
  // merely conservative for the other, which is the error worth having. With no tweak
  // both terms are 1 and this is exactly the previous behaviour.
  const widest = eye.w * Math.max(eye.left?.w ?? 1, eye.right?.w ?? 1);
  const tallest = eye.h * Math.max(eye.left?.h ?? 1, eye.right?.h ?? 1);
  const fit = fitGaze(
    eye.split,
    eye.rise + Math.max(eye.left?.rise ?? 0, eye.right?.rise ?? 0),
    offU,
    offV,
    widest,
    Math.max(halfH * Math.max(eye.left?.h ?? 1, eye.right?.h ?? 1), tallest * 0.5),
    limit,
  );
  const u = offU * fit;
  const v = offV * fit;

  // 🔴 THE BOW IS DRAWN BY COVERING THE EYE, NOT BY BENDING IT. An arched eye is
  // concave, r(theta) cannot be concave, and cross-fading a tall slot into a wide arch
  // passes through a plus sign on the way. So a shape in the body's own ink slides in
  // from below (or above) and eats part of the eye, leaving a crescent. At curve zero it
  // sits entirely clear, which is why a neutral face costs nothing and every blend into
  // and out of an expression is continuous.
  const curveMag = Math.min(1, Math.abs(eye.curve));
  const curveDir = eye.curve >= 0 ? 1 : -1;

  const head: Head = opts.head ?? { yaw: 0, pitch: 0, roll: 0 };
  const flat = headIsRest(opts.head);

  const eyes = ([-1, 1] as const).map((side): EyeRender => {
    // A wink shuts ONE eye. The right one, always — a wink that changed sides would read
    // as a twitch rather than as a gesture.
    const shut = side > 0 ? 1 - clamp01(eye.wink) : 1;
    // 🔴 THE PER-EYE TWEAK IS APPLIED HERE AND NOWHERE EARLIER, because this is the only
    // point at which `side` exists. Merging it into the shared numbers upstream would
    // have to pick one eye's values for both. Absent on both sides — which is every
    // shipped face — this resolves to the identity and costs one property read.
    const only = (side < 0 ? eye.left : eye.right) ?? EYES_ALIKE;
    // The asymmetry is a tilt AND a small height difference. A tilt alone is invisible
    // at 3px; the pair being visibly uneven is what survives the size.
    const eh = Math.max(halfH * only.h * shut * (1 + 0.02 * eye.asym * side) * ry, 0.35);
    const ew = eye.w * only.w * rx;
    // 🔴 THE BOW IS SIZED OFF THE OPEN EYE, NOT THE BLINKING ONE. Tying it to `eh` meant
    // a blink — which takes the eye's height to nothing in 75ms — flung the bow ten mark
    // units and back every few seconds. Invisible, because the bow is clear of a shut
    // eye either way, and a real defect: it is motion nobody asked for, and it buried a
    // genuine shape-morph regression in the noise when the frames were measured.
    const ehOpen = Math.max(eye.h * only.h * eye.open * shut * (1 + 0.02 * eye.asym * side) * ry, 0.35);
    // Circular, and sized off the eye's WIDTH rather than its height: what makes the
    // leftover sliver read as an arch is the cutter's curvature across the eye, and a
    // cutter much wider than the eye presents an almost flat edge to it.
    const lidR = ew * 1.28;

    // Where the eye sits on the face, as plain offsets in body-radius units.
    const ex = eye.split * side + u;
    const ey = eye.rise + only.rise + v;

    // ── The head, when there is one ────────────────────────────────────────────
    //
    // The flat offsets are read back as a point on the sphere — an orthographic
    // projection sends a longitude to `sin(lon)`, so the inverse is `asin` — and the
    // tangent frame then supplies both the foreshortening and the turn. Clamped inside
    // the poles because `asin` is undefined past 1, and an eye is never placed there.
    if (!flat) {
      const unit = (n: number) => Math.min(0.985, Math.max(-0.985, n));
      const s = eyeOnSphere(Math.asin(unit(ex)) / DEG, -Math.asin(unit(ey)) / DEG, head);
      return {
        cx: s.x * rx,
        cy: s.y * ry,
        rx: ew * s.sx,
        ry: eh * s.sy,
        tilt: eye.tilt + only.tilt + eye.asym * side + s.tilt,
        // 🔴 THE BOW IS FORESHORTENED WITH THE EYE IT CUTS. Leaving `lidCy` alone lets a
        // turned head keep a full-size cutter over a narrowed eye, which eats the whole
        // thing and the character appears to shut one eye as it looks away.
        lidCy:
          curveDir *
          (ehOpen * s.sy + lidR * s.sy - curveMag * (ehOpen * s.sy * 1.18 + lidR * s.sy * 0.42)),
        lidRx: lidR * s.sx,
        lidRy: lidR * s.sy,
      };
    }

    return {
      cx: ex * rx,
      cy: ey * ry,
      rx: ew,
      ry: eh,
      tilt: eye.tilt + only.tilt + eye.asym * side,
      // Offset along the eye's OWN axis, so a tilted eye keeps its bow square to itself.
      lidCy: curveDir * (ehOpen + lidR - curveMag * (ehOpen * 1.18 + lidR * 0.42)),
      lidRx: lidR,
      lidRy: lidR,
    };
  }) as [EyeRender, EyeRender];

  // ── The fragments ─────────────────────────────────────────────────────────────
  const sp = pose.sat;
  const satellites: BeadRender[] = [];
  const satRx = BODY.rx * b.scale * sp.scale;
  const satRy = BODY.ry * b.scale * sp.scale;
  for (let i = 0; i < SATELLITES; i++) {
    const place = satellitePlacement(i, sp.spin, sp.spread, sp.scatter, sp.sweep, rx, ry);
    const px = cx + place.x * cos - place.y * sin;
    const py = cy + place.x * sin + place.y * cos;
    // Each fragment turns with where it is, so the pair visibly rotates rather than
    // sliding round like beads on a wire.
    const tilt = b.tilt + place.angle * 0.4;
    satellites.push({ cx: px, cy: py, rx: satRx, ry: satRy, tilt, alpha: sp.alpha });
    if (sp.alpha > 0.001) {
      const hw = Math.hypot(satRx * Math.cos(tilt * DEG), satRy * Math.sin(tilt * DEG));
      const hh = Math.hypot(satRx * Math.sin(tilt * DEG), satRy * Math.cos(tilt * DEG));
      eat(px - hw, py - hh);
      eat(px + hw, py + hh);
    }
  }

  return {
    body: { cx, cy, tilt: b.tilt, d, rx, ry, alpha: b.alpha },
    bounds: { x0, y0, x1, y1 },
    eyes,
    satellites,
    glow: pose.glow,
    bodyAlpha: pose.bodyAlpha * presence,
  };
}

/**
 * The pose of one state at its own local time, with intensity and expression applied.
 *
 * 🔴 THE EXPRESSION IS APPLIED HERE, PER STATE, NOT ONCE AT THE END. Two states in a
 * transition usually wear different expressions — `incorrect` is concerned, the
 * `thinking` it becomes is narrow — and applying the face after the bodies had already
 * been blended would snap the eyes at the moment the mode flipped. Applied per state,
 * the ordinary pose blend carries the expression across with everything else, free.
 */
export function poseOf(mode: MascotMode, localT: number, opts: SampleOptions = {}): Pose {
  const state = STATES[mode];
  const t = opts.reduced ? stillTime(mode) : Math.max(0, localT);
  const raw = state.pose(t, opts.ctx ?? DEFAULT_CTX);
  const intensity = opts.intensity ?? 1;
  const scaled = scalePose(raw, intensity);
  // 🔴 INTENSITY DAMPS THE FACE AS WELL AS THE BODY. "Turn the character down" has to
  // mean the whole character: a plain resting blob wearing a narrowed, sceptical face is
  // not quieter, it is a different and slightly odd creature. At 0 the pose is `REST` and
  // the expression is `neutral`, which is exactly the mark standing still.
  const wanted = EXPRESSIONS[opts.expression ?? state.expression];
  const expr =
    opts.expressionDef ??
    (intensity >= 1 ? wanted : blendExpression(EXPRESSIONS.neutral, wanted, clamp01(intensity)));
  return { ...scaled, eye: applyExpression(scaled.eye, expr) };
}

/**
 * One state, one timestamp, one frame — with no engine and no history.
 *
 * This is the door the state board and the freeze controls use. Without it, showing
 * twenty states at once would need twenty engines, and "freeze this state at 0.4s" would
 * have to fight the engine's transition bookkeeping to get there.
 */
export function sampleState(mode: MascotMode, localT: number, opts: SampleOptions = {}): MascotFrame {
  return renderPose(poseOf(mode, localT, opts), opts, opts.clock ?? localT);
}

/**
 * Drives one mascot through a sequence of states.
 *
 * The only thing it adds over `sampleState` is CONTINUITY: what to show while one state
 * is becoming another, including when that happens halfway through a previous
 * transition.
 */
export class MascotEngine {
  private mode: MascotMode;
  private prev: MascotMode | null = null;
  private modeAt = 0;
  private prevAt = 0;
  /**
   * The composite pose at the moment a state change landed INSIDE a running transition,
   * frozen so the next blend starts from what was actually on screen.
   *
   * 🔴 ONLY WHEN A FADE IS ALREADY RUNNING. Blending from the outgoing state's FULL pose
   * instead of the partly-blended frame is a visible jump — several times the movement a
   * well-spaced change produces. But freezing on every change would stop the outgoing
   * state's own animation dead for the whole fade, which is worse in the common case,
   * where the state being left IS the displayed frame.
   */
  private frozen: Pose | null = null;
  private look: Look = NO_LOOK;
  /**
   * Centres of blinks the character was told to make, in engine time.
   *
   * 🔴 A FORCED BLINK BELONGS TO THE MOMENT IT STARTED, NOT TO THE CURRENT STATE. The
   * first version asked "does the state I am in now want a blink on the way in", which
   * is fine until a second state change lands while that blink is still running: the
   * question starts answering no, the override disappears, and the eye snaps from
   * half-shut back to open in one frame. Chained changes are exactly when it happened.
   *
   * A list, because two changes close together are two blinks and the lid should take
   * the lower of them. Pruned in `setState` only — entries outside their window return 1
   * from `maskBlink`, so dropping them cannot change any sample, and `sample` itself
   * stays a pure read.
   */
  private blinks: number[] = [];
  private expr: ExpressionId | null = null;
  private exprFrom: ExpressionDef | null = null;
  private exprAt = -10;

  /**
   * How long an expression takes to replace another.
   *
   * Shorter than most body morphs on purpose: a face that changes as slowly as a body
   * reads as sedated, and a face that changes instantly reads as a swap of assets.
   */
  static readonly EXPRESSION_MORPH = 0.26;

  constructor(initial: MascotMode = "idle", at = 0) {
    this.mode = initial;
    this.modeAt = at;
  }

  get current(): MascotMode {
    return this.mode;
  }

  /** How far the transition into the current state has run at `t`. 1 = finished. */
  transitionAt(t: number): number {
    if (!this.prev) return 1;
    const morph = STATES[this.mode].morph;
    return morph <= 0 ? 1 : clamp01((t - this.modeAt) / morph);
  }

  setState(mode: MascotMode, at: number, opts: SampleOptions = {}): void {
    if (mode === this.mode) return;
    this.frozen = this.transitionAt(at) < 1 ? this.composePose(at, opts) : null;
    const next = STATES[mode];
    if (next.blinkIn && !opts.reduced) {
      // The floor keeps the whole blink inside the change that asked for it: a short
      // morph would otherwise put its opening frames BEFORE the state changed, where
      // nothing was overriding the lid yet.
      this.blinks.push(at + Math.max(BLINK_HALF, next.morph * 0.34));
      this.blinks = this.blinks.filter((b) => b > at - BLINK_HALF * 2).slice(-4);
    }
    this.prev = this.mode;
    this.prevAt = this.modeAt;
    this.mode = mode;
    this.modeAt = at;
  }

  /**
   * Overrides the expression the current state would wear. `null` hands it back.
   *
   * The morph starts from whatever face is on screen right now, so setting an override
   * mid-transition does not jump — same rule, and same reason, as the frozen pose.
   */
  setExpression(expression: ExpressionId | null, at: number, opts: SampleOptions = {}): void {
    if (expression === this.expr) return;
    this.exprFrom = this.effectiveExpression(at, opts) ?? EXPRESSIONS[STATES[this.mode].expression];
    this.expr = expression;
    this.exprAt = at;
  }

  /** The blended expression at `t`, or null to let each state use its own default. */
  private effectiveExpression(t: number, opts: SampleOptions): ExpressionDef | null {
    if (!this.expr) {
      // Returning to "no override" still has to fade, or the face snaps back.
      if (!this.exprFrom) return null;
      const k = clamp01((t - this.exprAt) / MascotEngine.EXPRESSION_MORPH);
      if (k >= 1) return null;
      return blendExpression(this.exprFrom, EXPRESSIONS[STATES[this.mode].expression], k);
    }
    const to = EXPRESSIONS[this.expr];
    if (!this.exprFrom) return to;
    const k = clamp01((t - this.exprAt) / MascotEngine.EXPRESSION_MORPH);
    return k >= 1 ? to : blendExpression(this.exprFrom, to, k);
  }

  setLook(look: Look): void {
    if (!Number.isFinite(look.x) || !Number.isFinite(look.y) || !Number.isFinite(look.mix)) return;
    this.look = look;
  }

  /** Reset to a state with no transition — used when a component mounts. */
  reset(mode: MascotMode, at: number): void {
    this.mode = mode;
    this.prev = null;
    this.frozen = null;
    this.blinks = [];
    this.modeAt = at;
    this.prevAt = at;
  }

  /** The blended pose at `t`. Reads only; never mutates. */
  composePose(t: number, opts: SampleOptions = {}): Pose {
    const expressionDef = opts.expressionDef ?? this.effectiveExpression(t, opts) ?? undefined;
    const withExpr: SampleOptions = expressionDef ? { ...opts, expressionDef } : opts;
    opts = withExpr;
    const to = poseOf(this.mode, t - this.modeAt, opts);
    if (!this.prev) return to;
    const state = STATES[this.mode];
    // Reduced motion shortens transitions rather than removing them: a hard cut between
    // two held frames is a flash, which is exactly what the preference is trying to
    // avoid.
    const morph = opts.reduced ? state.morph * 0.45 : state.morph;
    const k = morph <= 0 ? 1 : clamp01((t - this.modeAt) / morph);
    if (k >= 1) return to;
    const from = this.frozen ?? poseOf(this.prev, t - this.prevAt, opts);
    return blendPose(from, to, EASINGS[state.ease](k));
  }

  sample(t: number, opts: SampleOptions = {}): MascotFrame {
    // Blink across a change of silhouette, so the eye is shut over the least readable
    // part of it and opens on a form that has essentially arrived. Which changes ask for
    // one is `blinkIn` in states.ts; when they were asked is `this.blinks`.
    let lidOverride: number | undefined;
    for (const centre of this.blinks) {
      const lid = maskBlink(t - centre);
      if (lidOverride === undefined || lid < lidOverride) lidOverride = lid;
    }
    if (lidOverride === 1) lidOverride = undefined;
    const merged: SampleOptions = {
      ...opts,
      look: opts.look ?? this.look,
      ...(lidOverride === undefined ? null : { lidOverride }),
    };
    return renderPose(this.composePose(t, merged), merged, merged.clock ?? t);
  }
}
