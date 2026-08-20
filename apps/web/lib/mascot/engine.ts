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
import { liveliness } from "./face";
import {
  BODY,
  EYE_TRAVEL_U,
  EYE_TRAVEL_V,
  SATELLITES,
  closedPath,
  fitGaze,
  satellitePlacement,
  silhouette,
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
  const live = liveliness(reduced ? 0 : (opts.clock ?? t), reduced ? 0 : pose.liveliness);

  const b = pose.body;
  const cx = BODY.cx + b.dx;
  const cy = BODY.cy + b.dy + pose.lift + live.shift;
  const rx = BODY.rx * b.scale * b.stretch;
  const ry = BODY.ry * b.scale * b.squash;

  // ── The silhouette ────────────────────────────────────────────────────────────
  const pts: Point[] = silhouette(b);
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
  const halfH = eye.h * eye.open * live.lid;
  const offU = gx * EYE_TRAVEL_U;
  const offV = gy * EYE_TRAVEL_V;
  // The waist takes room away exactly where the eyes live, so the fit has to know about
  // it — otherwise a gaze that is safe on the resting body clips through a pinched one.
  const limit = 0.8 - 0.22 * b.pinch;
  const fit = fitGaze(eye.split, eye.rise, offU, offV, eye.w, Math.max(halfH, eye.h * 0.5), limit);
  const u = offU * fit;
  const v = offV * fit;

  const eyes = ([-1, 1] as const).map((side): EyeRender => {
    // The asymmetry is a tilt AND a small height difference. A tilt alone is invisible
    // at 3px; the pair being visibly uneven is what survives the size.
    const eh = Math.max(halfH * (1 + 0.02 * eye.asym * side) * ry, 0.35);
    const ew = eye.w * rx;
    return {
      cx: (eye.split * side + u) * rx,
      cy: (eye.rise + v) * ry,
      rx: ew,
      ry: eh,
      tilt: eye.tilt + eye.asym * side,
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
    bodyAlpha: pose.bodyAlpha,
  };
}

/** The pose of one state at its own local time, with intensity applied. */
export function poseOf(mode: MascotMode, localT: number, opts: SampleOptions = {}): Pose {
  const state = STATES[mode];
  const t = opts.reduced ? stillTime(mode) : Math.max(0, localT);
  const raw = state.pose(t, opts.ctx ?? DEFAULT_CTX);
  return scalePose(raw, opts.intensity ?? 1);
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
    this.prev = this.mode;
    this.prevAt = this.modeAt;
    this.mode = mode;
    this.modeAt = at;
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
    this.modeAt = at;
    this.prevAt = at;
  }

  /** The blended pose at `t`. Reads only; never mutates. */
  composePose(t: number, opts: SampleOptions = {}): Pose {
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
    const merged: SampleOptions = { ...opts, look: opts.look ?? this.look };
    return renderPose(this.composePose(t, merged), merged, merged.clock ?? t);
  }
}
