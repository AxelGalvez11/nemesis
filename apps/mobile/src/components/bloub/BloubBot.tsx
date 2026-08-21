// The character, on the phone. A react-native-svg client for the vendored engine in
// `@nemesis/shared/bloub`.
//
// 🔴 THE ENGINE IS NOT MINE AND IS NOT EDITED. `packages/shared/src/bloub/*.ts` is vendored whole
// from jeremy-prt/bloub (MIT, see that folder's LICENSE) because its pose model is spherical — the
// eyes live on a sphere and are placed through a tangent frame, with every state's gaze written as
// measured yaw/pitch/roll. Flattening that state table into a 2D system produces something that is
// not the same character. So the engine stays intact and this file is a renderer, nothing more.
//
// 🔴 IT IS THE SECOND RENDERER, AND THAT IS ALLOWED EXACTLY ONCE. `apps/web/components/bloub/
// bloub-bot.tsx` is the first; it writes SVG attributes onto DOM nodes, this one writes native
// props onto RNSVG nodes, and neither can draw onto the other's tree. `packages/shared/src/
// character.test.ts` names both by path and fails on a third — the guard exists because a second
// DOM renderer once shipped by accident and the owner ended up with two overlapping mascots on one
// screen with nothing failing anywhere. Everything ABOVE the drawing — which animation plays for
// which activity, how fast it plays, how big the decor pool is — lives in `@nemesis/shared/
// character/*` so the two renderers cannot disagree about the character itself.
//
// 🔴 REACT RENDERS THE SKELETON ONCE; THE LOOP WRITES NATIVE PROPS. Same rule as web and for a
// sharper reason: sixty reconciliations a second on a phone, for a decoration floating over the
// composer, competes with the very thing it is decorating — parsing and rendering the reply. So
// React mounts a fixed skeleton (a mask, a body, two eyes, two circles, 8+8 dots, 12+12 arcs and
// 12 gradients) and after that `paint()` writes onto nodes held in refs. There is no `setState`
// anywhere in the loop. The in-repo precedent is `app/(tabs)/graph.tsx`, whose loop comment says
// the same thing in the same words: no setState, so React does not run.
//
// 🔴 NOT REANIMATED, AND THAT IS NOT AN OVERSIGHT. Reanimated would put this on the UI thread,
// which is where it belongs — but the engine is 3,200 lines of vendored code that must not be
// edited, so it cannot carry `'worklet'` directives and `sample(t)` cannot run on the UI runtime.
// Vendoring the engine and forking it to add worklets is the same decision as not vendoring it.
// So it runs on the JS thread, exactly as it does on web, and the mitigations are the two gates
// below rather than a thread move.
//
// 🔴 THE DECOR IS A FIXED POOL AND ITS SIZE IS MEASURED. A frame carries a variable number of dots
// and arcs, and during a cross-fade it carries BOTH states' decor at once — which is where the
// real worst case lives. The counts come from `@nemesis/shared/character/pool`, which is swept over
// all 225 ordered state pairs by `character.test.ts`. Unused pool members are PARKED, never
// unmounted, so the node count is constant for the component's lifetime.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Dimensions,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useFocusEffect } from "expo-router";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Mask,
  Path,
  Rect,
  Stop,
  type LinearGradientProps,
} from "react-native-svg";

import { NOTIF_BLUE } from "@nemesis/shared/bloub/decor";
import { BotEngine, type BotFrame } from "@nemesis/shared/bloub/engine";
import { TURN_TIME, type GazeScript } from "@nemesis/shared/bloub/gaze";
import { clamp, easings } from "@nemesis/shared/bloub/math";
import { DEMI_VIEWBOX, RAYON } from "@nemesis/shared/bloub/repere";
import { COLOR_BY_ID, SHAPE_BY_ID, mixHex } from "@nemesis/shared/bloub/skins";
import { POSES, STATE_BY_ID, type StateId } from "@nemesis/shared/bloub/states";
import { restingFace } from "@nemesis/shared/character/face";
import { centredLook, idleAim } from "@nemesis/shared/character/gaze";
import { ARC_POOL, ARC_STOPS as STOPS, DOT_POOL } from "@nemesis/shared/character/pool";

import { useTheme } from "@/theme/ThemeProvider";

import { argb, discPath, dotMatrix, parseMatrix } from "./bloub-frame";

// Pool sizes live in the shared package so the guard that keeps them honest can run in plain Node,
// without React, RNSVG or a device. Re-exported because callers reach for them through the
// renderer, exactly as they do on web.
export { ARC_POOL, DOT_POOL } from "@nemesis/shared/character/pool";

const VB = DEMI_VIEWBOX;

/** How often the wrapper's position on screen is re-measured while the loop runs, in ms. */
const BOX_MS = 120;

/**
 * 🔴 `gradient` IS A REAL NATIVE PROP OF RNSVGLinearGradient AND IS MISSING FROM THE PUBLIC TYPES.
 *
 * It has to be written directly because `<Stop>` cannot be written at all: RNSVG's Stop renders
 * `null` and its `setNativeProps` calls `parent.forceUpdate()` — a React re-render, which is the
 * one thing this whole file exists to avoid. So the twelve gradients get the flat
 * `[offset, argb, offset, argb, offset, argb]` array that `extractGradient` builds at mount, and
 * the `<Stop>` children below exist only so that array is present before the first frame.
 *
 * This type mirrors react-native-svg/src/lib/extract/extractGradient.ts at 15.15.4 — named here
 * because that is the file a version bump would change out from under it.
 */
type LinearGradientNativeWrite = LinearGradientProps & { gradient: number[] };

/** See `bodyGroupRef` below: the narrowest possible view of a node that only ever takes opacity. */
type OpacityNode = { setNativeProps: (props: { opacity: number }) => void };

export interface BloubBotProps {
  /** Which animation is playing. */
  state?: StateId;
  /** Rendered size in px. The viewBox is square, so this is both width and height. */
  size?: number;
  /** Customiser: silhouette used by the resting states. */
  shape?: string;
  /** Customiser: body colour. */
  color?: string;
  /**
   * Which resting face to wear — an id from the vendored expression table.
   *
   * 🔴 IT IS RESOLVED THROUGH `restingFace`, NOT THROUGH THE VENDORED MAP, AND THAT IS WHERE THE
   * HEAD LEAN IS SOFTENED (owner 2026-08-20: "change the mascot to be not so 'tilted'"). The
   * resting pose's `roll: -13` is a measured constant inside vendored code that eight states
   * inherit; re-tuning it there would leak into all of them and would make re-vendoring a merge
   * instead of a copy. `@nemesis/shared/character/face` retunes only the entry whose roll IS the
   * resting pose's, leaves the other fifteen moods alone, and hands back a stable reference so
   * `setExpression`'s identity check still short-circuits. Its header carries the numbers.
   *
   * It also carries the poke's `colere` and `surpris` — see `use-poke.ts`: one owner per channel,
   * or the tilt fix and the angry gesture overwrite each other every render.
   */
  expression?: string;
  /**
   * The colour behind the character.
   *
   * Load-bearing, not cosmetic: the eyes are HOLES cut in the body, and the rings pass behind it.
   * Without an opaque backing in exactly the surface's own colour, an orbit ring reappears inside
   * the eyes. On web this is a CSS custom property; here it is a prop, defaulting to the theme's
   * page colour, because RN has no cascade to read it out of.
   */
  paper?: string;
  /**
   * Look HERE — window coordinates, or null to let the character look around on its own.
   *
   * 🔴 THERE IS NO POINTER TO FALL BACK TO, WHICH IS WHY WEB'S `track` IS NOT HERE. The web loop
   * already refuses `pointerType === "touch"` — a finger leaves no cursor behind, and keeping the
   * last touch point freezes the gaze on wherever the learner last tapped, which reads as a stuck
   * element. So the phone keeps only the deliberate half: a surface saying "attend to this". It
   * goes through the same cone, the same catch-up and the same entry turn the cursor does on
   * web, so an aim arrives with the same weight and the same inertia on both — with one stated
   * difference: the phone reads that cone through `centredLook`, which cancels the vendored
   * `TURN` toward a settings side panel this app does not have. See `steer` below.
   *
   * 🔴 AND `null` IS NO LONGER "STAND STILL" (owner 2026-08-20: "the mascot should be looking
   * around not just staring away to the right"). It used to be, and that WAS the complaint: with
   * nothing aimed, the loop released the look every frame, so the head sat at the resting pose's
   * `yaw: 28.49, pitch: 28.62` — up and to the right — with only the drift moving it. The idle
   * look-around in the loop below now fills that gap, so this prop's job narrowed to what its
   * name says: a target OUTRANKS the wandering, it does not enable a gaze that was otherwise off.
   */
  aimAt?: { x: number; y: number } | null;
  /**
   * A SCRIPTED look, evaluated every frame with the seconds elapsed since it was given, or null
   * for the ordinary steering. It outranks both `aimAt` and the idle wandering while it is set.
   *
   * 🔴 THIS EXISTS FOR ONE GESTURE, AND WITHOUT IT THAT GESTURE SHIPS LOOKING BROKEN WHILE EVERY
   * TEST STAYS GREEN (owner 2026-08-20: "spin around"). Measured on the real engine, the `swirl`
   * state ALONE moves the inner eye 55px on a 100px-radius body — the same as ordinary idle
   * wander — and never sends an eye behind the sphere: its pose is three rings laid over the
   * resting face, and the rotation in upstream's settings entrance comes from the LOOK, not from
   * the state. Driving the vendored `tourLook` script instead, the inner eye travels 184px and
   * passes behind the body for about half a second. That is a spin.
   *
   * 🔴 IT IS A SCRIPT, NOT AN ANIMATION WRITTEN HERE. Same rule the idle wandering follows: what
   * this file may do is hand the engine a target every frame. `@nemesis/shared/bloub/gaze`'s
   * `GazeScript` type exists for exactly this and its contract is that a script ENDS at `mix: 0`,
   * so there is never anything to release and no last slide of the eyes when it finishes.
   *
   * 🔴 AND IT KEEPS `aimingRef` SET, so handing the gaze back to the steering afterwards does not
   * fire a second entry turn. The engine's own catch-up (`LOOK_MORPH`, 0.24s) smooths the script
   * exactly as it smooths a cursor, which for a 2.7s rotation is a lag of about a frame and a
   * half — invisible, and it converges because the script lands where it started.
   */
  gaze?: GazeScript | null;
  /**
   * Open the gaze with a full turn around the sphere before the eyes settle.
   *
   * 🔴 OFF BY DEFAULT, AND THAT IS A DEPARTURE FROM UPSTREAM — doubly so here. It is a lovely
   * arrival, because the eyes really do pass behind the body and come back, but during it the
   * character HAS NO FACE for 1.1 seconds. Upstream spends that once, entering a settings view. A
   * character parked above a composer would spend it on every appearance, and on a phone the loop
   * does not merely throttle when the app leaves the foreground, it stops — so the turn never
   * completes and the face simply never arrives.
   *
   * 🔴 AND IT REACHES SOMETHING NOW THAT IT DID NOT BEFORE. The turn only plays when the gaze
   * takes hold, and until the idle look-around existed the phone's gaze never took hold at all —
   * so passing this did nothing here. It now plays on mount, and again each time a wait ends and
   * the character goes back to looking around, which is the same shape web has had all along.
   * Still nothing passes it; a caller that starts should expect the turn at both moments.
   */
  entrance?: boolean;
  /**
   * Called when the learner presses the character.
   *
   * 🔴 GIVING THIS TURNS ON TOUCH, AND NOTHING ELSE DOES. The character floats over a composer, and
   * something decorative that swallows a press meant for the input is worse than no character.
   * Only a surface that has somewhere for a press to GO may switch that off, and it does so by
   * having somewhere for it to go.
   */
  onPoke?: () => void;
  /** Freeze at this many seconds into the state. Reproducible; no loop is started. */
  frozenAt?: number;
  /** Playback rate. 0 pauses the scene clock. Pass `speedOf(state)`. */
  speed?: number;
  /** Hold a still frame. Defaults to honouring the system's reduce-motion setting. */
  reducedMotion?: boolean;
  /** Announce the character to assistive tech. Decorative (and hidden) unless given. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export function BloubBot({
  state = "idle",
  size = 96,
  shape = "cercle",
  color,
  expression = "neutre",
  paper,
  aimAt = null,
  gaze = null,
  entrance = false,
  onPoke,
  frozenAt,
  speed = 1,
  reducedMotion,
  label,
  style,
}: BloubBotProps) {
  const { colors, resolvedMode } = useTheme();
  // RNSVG resolves `url(#id)` through a process-wide registry, so two mounted characters must not
  // share ids. useId gives that; the punctuation it contains is not legal in a fragment reference.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const maskId = `bloub-mask-${uid}`;

  const wrapRef = useRef<View | null>(null);
  const maskBodyRef = useRef<Path | null>(null);
  const paperBodyRef = useRef<Path | null>(null);
  const inkRectRef = useRef<Rect | null>(null);
  // 🔴 HELD AT THE SHAPE OF THE ONE WRITE IT TAKES, BECAUSE OF AN RNSVG TYPING WART. `G<P>` infers
  // P from its JSX props, so a `<G ref={…}>` ends up with `ref` baked into its OWN setNativeProps
  // signature and every write to it is then required to pass a ref. Only `opacity` is ever written
  // to this group — the body's cross-fade alpha — so the ref is held at exactly that shape.
  const bodyGroupRef = useRef<OpacityNode | null>(null);
  const eyeRefs = useRef<(Path | null)[]>([]);
  const notchRef = useRef<Circle | null>(null);
  const notifRef = useRef<Circle | null>(null);
  // 🔴 TWO DOT POOLS, NOT ONE MOVED BETWEEN LAYERS. The burst's particles pass BEHIND the core
  // while every other dot is in front, and paint order is document order — there is no z-index in
  // SVG and none in RNSVG either. Reparenting nodes each frame would invalidate the refs. So both
  // positions exist and one of them is drawn.
  const dotBackRefs = useRef<(Path | null)[]>([]);
  const dotFrontRefs = useRef<(Path | null)[]>([]);
  const backRefs = useRef<(Path | null)[]>([]);
  const frontRefs = useRef<(Path | null)[]>([]);
  const gradRefs = useRef<(LinearGradient | null)[]>([]);

  const engineRef = useRef<BotEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new BotEngine(
      RAYON,
      state,
      SHAPE_BY_ID.get(shape)?.radii ?? null,
      restingFace(expression),
    );
  }

  // 🔴 THE PAPER COLOUR IS RESOLVED ONCE PER RENDER, NOT PER FRAME. Web reads a CSS custom
  // property with getComputedStyle every frame; there is no equivalent here and there should not
  // be one. It lands in the same live ref as everything else the loop reads, so the loop never
  // re-subscribes to a prop change.
  // 🔴 THE DEFAULT INK FOLLOWS THE THEME, BECAUSE THE PHONE HAS NO SKIN PICKER. On the web the
  // character's colour is a device preference the learner sets (`theme-provider.tsx` carries
  // `bloubColor`), so its default of "encre" — a near-black at #0a0a0c — is only ever a starting
  // point somebody can change. The phone has no such setting, so that default was final here, and
  // on the dark theme it drew a near-black character on a #0e0e0e background: present, animating,
  // and effectively invisible (observed on device). "creme" is the same palette's near-white, so
  // dark mode gets ink that reads and light mode keeps the original. An explicit `color` prop
  // still wins, so a future picker needs no change here.
  const ink = COLOR_BY_ID.get(color ?? (resolvedMode === "dark" ? "creme" : "encre"))?.hex ?? "#0a0a0c";
  const paperHex = paper ?? colors.bg;
  const live = useRef({ ink, paper: paperHex, speed, aimAt, entrance });
  live.current = { ink, paper: paperHex, speed, aimAt, entrance };

  /**
   * Writes one frame onto the native tree.
   *
   * Every line below is a native-prop write on a node that already exists.
   *
   * 🔴 PARKED WITH `{ d: "", opacity: 0 }`, NOT WITH `display`. Web parks an unused pool member at
   * `style.display = "none"`. RNSVG's `display` IS a real native prop but it is absent from the
   * `setNativeProps` prop type (compile-checked under this app's exact compiler options), so it
   * cannot be written this way without lying to the type system. An empty path rasterises nothing,
   * which is cheaper than a hidden one anyway.
   *
   * 🔴 AND EVERY WRITE IS A FRESH OBJECT LITERAL. `Shape.setNativeProps` MUTATES the object it is
   * given — it replaces `fill`/`stroke` in place with the output of `extractBrush` — so a reused
   * scratch object would be poisoned after its first use.
   */
  const paint = (frame: BotFrame, inkHex: string, paperFill: string) => {
    maskBodyRef.current?.setNativeProps({ d: frame.bodyPath });
    paperBodyRef.current?.setNativeProps({ d: frame.bodyPath, fill: paperFill });
    inkRectRef.current?.setNativeProps({ fill: inkHex });
    // G.setNativeProps only injects a matrix when transform props are present, so passing opacity
    // alone leaves the group's transform untouched.
    bodyGroupRef.current?.setNativeProps({ opacity: frame.bodyAlpha });

    for (let i = 0; i < 2; i += 1) {
      const node = eyeRefs.current[i];
      const eye = frame.eyes[i];
      if (!node) continue;
      if (!eye) {
        node.setNativeProps({ d: "", opacity: 0 });
        continue;
      }
      // 🔴 THE ENGINE'S EYE TRANSFORM IS AN SVG STRING AND HAS TO BE PARSED. See
      // `bloub-frame.ts`: nothing in RNSVG parses `matrix(...)` arriving through setNativeProps.
      node.setNativeProps({ d: eye.d, matrix: parseMatrix(eye.matrix), opacity: eye.alpha });
    }

    const notch = notchRef.current;
    if (notch) {
      if (frame.notch) {
        notch.setNativeProps({ cx: frame.notch.x, cy: frame.notch.y, r: frame.notch.r });
      } else {
        // A circle has no `d` to empty, so it is parked at radius zero.
        notch.setNativeProps({ r: 0 });
      }
    }

    const notif = notifRef.current;
    if (notif) {
      if (frame.notif) {
        notif.setNativeProps({ cx: frame.notif.x, cy: frame.notif.y, r: frame.notif.r });
      } else {
        notif.setNativeProps({ r: 0 });
      }
    }

    const dotPool = frame.dotsBehind ? dotBackRefs.current : dotFrontRefs.current;
    const idlePool = frame.dotsBehind ? dotFrontRefs.current : dotBackRefs.current;
    for (let i = 0; i < DOT_POOL; i += 1) {
      idlePool[i]?.setNativeProps({ d: "", opacity: 0 });
      const node = dotPool[i];
      if (!node) continue;
      const dot = frame.dots[i];
      if (!dot) {
        node.setNativeProps({ d: "", opacity: 0 });
        continue;
      }
      node.setNativeProps({
        // A glyph dot carries its own path in body-radius units, so it is rotated and scaled; a
        // disc is built at its own radius and only translated. Both end up as one matrix.
        d: dot.d ?? discPath(dot.r),
        matrix: dotMatrix(dot, RAYON),
        opacity: dot.opacity,
        fill: dot.color ?? (dot.depth === undefined ? inkHex : mixHex(paperFill, inkHex, dot.depth)),
      });
    }

    for (let i = 0; i < ARC_POOL; i += 1) {
      const back = backRefs.current[i];
      const front = frontRefs.current[i];
      const arc = frame.arcs[i];
      if (!back || !front) continue;
      if (!arc) {
        back.setNativeProps({ d: "", opacity: 0 });
        front.setNativeProps({ d: "", opacity: 0 });
        continue;
      }
      // strokeWidth, camelCase: this is a native prop name, not an SVG attribute name.
      back.setNativeProps({ d: arc.back, strokeWidth: arc.width, opacity: arc.opacity });
      front.setNativeProps({ d: arc.front, strokeWidth: arc.width, opacity: arc.opacity });
      const grad = gradRefs.current[i];
      if (!grad) continue;
      const stops = arc.grad.stops;
      const last = stops[stops.length - 1] ?? "#000000";
      const gradient: number[] = [];
      for (let s = 0; s < STOPS; s += 1) {
        gradient.push(s / (STOPS - 1), argb(stops[s] ?? last));
      }
      const write: LinearGradientNativeWrite = {
        x1: arc.grad.x1,
        y1: arc.grad.y1,
        x2: arc.grad.x2,
        y2: arc.grad.y2,
        gradient,
      };
      grad.setNativeProps(write);
    }
  };

  // ── The customiser reaches the engine through timestamped setters ─────────────
  //
  // Never by mutating something the sampler reads: the engine's whole contract is that `sample(t)`
  // is a pure function of time, and a value read live would break replay, pausing and the frozen
  // boards all at once. Both setters morph rather than jump.
  const clockRef = useRef(0);
  /**
   * 🔴 THE GAZE'S BOOKKEEPING OUTLIVES THE LOOP, AND THAT IS THE WHOLE POINT.
   *
   * Aiming opens with a full turn around the sphere — the eyes pass behind the body and come back
   * — which is right ONCE, when the character first takes notice. On web these lived inside the
   * animation effect at first, so every change of animation re-created them and re-ran the turn:
   * switching from idle to thinking sent the eyes round the back for 1.1s, every time, and it read
   * as the face falling off. `state` is read through a ref for the same reason — putting it in the
   * effect's dependencies is what restarted the loop in the first place.
   */
  const aimingRef = useRef(false);
  const turnSinceRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  /**
   * The scripted look, and the scene time it was handed over.
   *
   * A script carries its own clock — it is evaluated with seconds since it began — so the moment
   * it arrives has to be recorded, and it cannot be recorded in the loop: the loop only sees the
   * ref's value, not the render that changed it. An effect is the one place that runs exactly
   * once per change of the prop. It is a ref rather than a dependency of the loop effect for the
   * reason the whole file repeats: restarting the loop restarts the gaze's entry turn.
   */
  const gazeRef = useRef<{ script: GazeScript | null; since: number }>({ script: null, since: 0 });
  useEffect(() => {
    gazeRef.current = { script: gaze, since: clockRef.current };
  }, [gaze]);

  useEffect(() => {
    engineRef.current?.setShape(SHAPE_BY_ID.get(shape)?.radii ?? null, clockRef.current);
  }, [shape]);
  useEffect(() => {
    engineRef.current?.setExpression(restingFace(expression), clockRef.current);
  }, [expression]);
  useEffect(() => {
    engineRef.current?.setState(state, clockRef.current);
  }, [state]);

  // ── Reduced motion ───────────────────────────────────────────────────────────
  //
  // The RN twin of web's `matchMedia("(prefers-reduced-motion: reduce)")`. Same still branch, same
  // characteristic instant. This is the only piece of state in the component, and it changes when
  // the learner changes a system setting, not sixty times a second.
  const [systemReduced, setSystemReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setSystemReduced(on);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => {
      setSystemReduced(on);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  const reduced = reducedMotion ?? systemReduced;
  const still = frozenAt !== undefined || reduced;

  // ── Paint ────────────────────────────────────────────────────────────────────
  //
  // Two effects, and the split is deliberate — it is the same split web makes, for the same reason.
  // A STILL costs one paint and must repaint whenever anything about the look changes; the LOOP
  // must survive those changes untouched, because restarting it restarts the gaze's entry turn.
  // Folding them into one effect is what sent the eyes around the back of the sphere on every
  // change of animation.
  useLayoutEffect(() => {
    if (!still) return;
    const engine = engineRef.current;
    if (!engine) return;
    // 🔴 HELD AT ITS CHARACTERISTIC INSTANT, NOT FROZEN AT ZERO. Every animation publishes the
    // moment it reads best (`POSES`), and holding that is what keeps `thinking` legible as three
    // dots rather than as a ball caught before it split.
    paint(engine.sample(frozenAt ?? POSES[state] ?? 1), live.current.ink, live.current.paper);
    // Redrawn whenever the look changes, since nothing else will redraw it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, frozenAt, state, shape, color, expression, paperHex]);

  // ── The gates ────────────────────────────────────────────────────────────────
  //
  // 🔴 NEW HERE, NOT PORTED — AND NOT OPTIONAL. Expo Router keeps tab screens MOUNTED when you
  // switch tabs, so without a focus gate this loop would keep sampling the engine and writing
  // across the bridge while the learner reads their Library. The AppState gate is the same
  // argument one level out: rAF does not merely throttle when the app backgrounds. `graph.tsx`
  // carries both gates for exactly these two reasons.
  //
  // They are refs and indirection rather than effect dependencies BECAUSE of the split above: if
  // focus or foregrounding were in the loop effect's dependency array, every tab switch would tear
  // the loop down and rebuild it, and rebuilding it re-runs the gaze's entry turn.
  const gate = useRef({ focused: true, active: AppState.currentState !== "background" });
  const kick = useRef<() => void>(() => {});
  const halt = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    if (still) return;
    const engine = engineRef.current;
    if (!engine) return;

    let rafId: number | null = null;
    let last = 0;
    // Where the character is on screen, and how big the screen is. Both feed the gaze.
    let box = { x: 0, y: 0, w: 0, h: 0 };
    let halfW = 1;
    let halfH = 1;

    // 🔴 MEASURED ON A TIMER, NEVER PER FRAME. This is `lib/mascot/attention.ts`'s rule, ported:
    // a layout read sixty times a second for a decorative gaze is exactly the kind of cost that
    // never shows up in a profile as "the mascot" but does show up as jank. 120ms is far finer
    // than the eye's own settling time.
    const measure = () => {
      wrapRef.current?.measureInWindow((x, y, w, h) => {
        box = { x, y, w, h };
      });
      const win = Dimensions.get("window");
      halfW = Math.max(1, win.width / 2);
      halfH = Math.max(1, win.height / 2);
    };

    const release = () => {
      if (!aimingRef.current) return;
      engine.setLook(null, clockRef.current, TURN_TIME);
      aimingRef.current = false;
    };

    /**
     * One target into the engine, in `lookTarget`'s own normalised units.
     *
     * 🔴 BOTH WAYS OF LOOKING GO THROUGH HERE, AND THAT IS THE WHOLE SHAPE OF THE FIX. A
     * deliberate aim and the idle wandering differ in exactly one thing — where the two numbers
     * come from — so they share the cone, the entry turn, the catch-up and the state gate. Giving
     * the wandering its own path is how a mascot ends up with two gaze systems that disagree at
     * the moment one hands over to the other.
     *
     * `pointer` is passed through rather than hard-coded because `lookTarget` reads it as "a
     * pointer is KNOWN" and answers with `wander: pointer ? 0 : 1` — it kills the engine's resting
     * drift when something real is being followed, so the head holds its target instead of hunting
     * for it. The phone has no pointer, so the wandering says `false` and keeps the drift, which
     * is what `gaze.ts` promises for arrival by keyboard or touch. Hard-coding `true` here (as
     * this file did when `aimAt` was the only caller) would freeze a static target dead.
     *
     * 🔴 AND IT IS `centredLook`, NOT `lookTarget` (owner 2026-08-20: "make sure it doesnt just
     * look around to the left"). The vendored cone is `-TURN + nx * YAW_MAX` with TURN 26 and
     * YAW_MAX 16, so it spans -42° to -10° and is never positive — upstream's bot turns toward
     * the settings side panel it stands beside, and our character stands alone. No `nx` centres
     * it; that would need 1.625, outside the ±1 clamped just below. `centredLook` adds `TURN`
     * back, which cancels that term exactly and leaves everything else the engine's.
     *
     * 🔴 THE SWAP IS HERE, INSIDE `steer`, AND NOT IN A HELPER THAT REPLACES THE `idleAim` CALL.
     * `character.test.ts` reads this file's TEXT for `idleAim(` and for `steer(nx, ny, false)` —
     * the guards that caught the phone never entering the engine's look mode at all. Routing the
     * re-centring through `steer` keeps both honest and gives any future `aimAt` the same cone.
     */
    const steer = (nx: number, ny: number, pointer: boolean) => {
      if (!aimingRef.current) turnSinceRef.current = clockRef.current;
      engine.setLook(
        centredLook({
          nx,
          ny,
          tour: live.current.entrance
            ? easings.easeOutQuint(clamp((clockRef.current - turnSinceRef.current) / TURN_TIME))
            : 1,
          pointer,
        }),
        clockRef.current,
      );
      aimingRef.current = true;
    };

    const aim = (at: { x: number; y: number }) => {
      // 🔴 A ZERO-SIZED BOX IS REFUSED, and this is not defensive noise. The normalisation below
      // would be 0/0, and the engine KEEPS its last target: a single NaN would settle in and the
      // character would never look anywhere again — which is the trap `BotEngine.setLook`'s own
      // guard describes. `measureInWindow` returns exactly these zeros before the first layout.
      //
      // Only this branch needs the guard: the wandering below is normalised already and never
      // divides by a measurement, which is also why it works on the very first frame.
      if (box.w === 0 || box.h === 0) return;
      steer(
        clamp((at.x - (box.x + box.w / 2)) / halfW, -1, 1),
        clamp((at.y - (box.y + box.h / 2)) / halfH, -1, 1),
        true,
      );
    };

    const tick = (ms: number) => {
      rafId = requestAnimationFrame(tick);
      // 🔴 BOUNDED DELTA, and it matters more here than on web, not less. rAF is suspended
      // wholesale while the app is away; an unbounded delta would jump the scene clock forward by
      // however long that was, so the character would return mid-explosion.
      const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0;
      last = ms;
      clockRef.current += dt * live.current.speed;
      // Only the resting-face states are steerable, and the gate sits HERE rather than inside
      // `aim` so the wandering is held to it too. Everywhere else the gaze pose IS the measured
      // animation — the orbit sends the eyes round the sphere — and laying a follow on top of it
      // would smear both. It is also why the wandering never fights a wait: `thinking`, `orbit`,
      // `comet`, `burst`, `wide` and `notify` all release, and the character goes back to looking
      // around the moment it is idle again.
      if (!STATE_BY_ID.get(stateRef.current)?.baseFace) {
        release();
      } else {
        const script = gazeRef.current.script;
        const at = live.current.aimAt;
        if (script) {
          // 🔴 A SCRIPTED LOOK OUTRANKS EVERYTHING, because the only thing that sets one is a
          // gesture the learner just asked for by tapping. It is evaluated on the SCENE clock, so
          // it slows with the animation it belongs to — the spin plays at `swirl`'s 0.55 and its
          // 1.5s of rotation take 2.7s of real time, which is exactly what the poke holds it for.
          // `aimingRef` stays set so handing back to the steering fires no second entry turn.
          engine.setLook(script(clockRef.current - gazeRef.current.since), clockRef.current);
          aimingRef.current = true;
        } else if (at) {
          // A surface that named a target outranks the character's own curiosity.
          aim(at);
        } else {
          // 🔴 THE IDLE LOOK-AROUND, AND IT IS A TARGET RATHER THAN AN ANIMATION. `idleAim` hands
          // back the same two normalised numbers a cursor would, sampled from the scene clock, so
          // everything about how the head gets there stays the engine's. See
          // `@nemesis/shared/character/gaze` for why it is not written in this file.
          const { nx, ny } = idleAim(clockRef.current);
          steer(nx, ny, false);
        }
      }
      paint(engine.sample(clockRef.current), live.current.ink, live.current.paper);
    };

    const start = () => {
      if (rafId !== null) return;
      if (!gate.current.focused || !gate.current.active) return;
      // The first frame after a resume contributes no delta, so the scene clock never inherits the
      // gap even if the bound above were ever raised.
      last = 0;
      rafId = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (rafId === null) return;
      cancelAnimationFrame(rafId);
      rafId = null;
    };

    kick.current = start;
    halt.current = stop;

    measure();
    const boxTimer = setInterval(measure, BOX_MS);
    const sub = AppState.addEventListener("change", (next) => {
      gate.current.active = next === "active";
      if (gate.current.active) start();
      else stop();
    });

    start();
    return () => {
      stop();
      clearInterval(boxTimer);
      sub.remove();
      kick.current = () => {};
      halt.current = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);

  // Declared AFTER the loop effect so `kick`/`halt` are already wired when focus first fires.
  // Requires a navigator ancestor, which every screen this renders on has.
  useFocusEffect(
    useCallback(() => {
      gate.current.focused = true;
      kick.current();
      return () => {
        gate.current.focused = false;
        halt.current();
      };
    }, []),
  );

  return (
    <View
      ref={wrapRef}
      style={[{ height: size, width: size }, style]}
      // 🔴 THE CHARACTER MUST NOT SWALLOW A PRESS MEANT FOR THE COMPOSER. Web's rule is
      // `.bloub { pointer-events: none }` with `.bloub-pokeable { pointer-events: auto }`; this is
      // the same rule. `box-none` lets the Pressable below take a press while the wrapper itself
      // stays transparent to touch — and the press is on a plain rectangle, NOT on RNSVG hit
      // testing, because the silhouette morphs every frame and the ink layer is masked.
      pointerEvents={onPoke ? "box-none" : "none"}
      accessibilityRole={label ? "image" : undefined}
      accessibilityLabel={label}
      // 🔴 HIDDEN FROM ASSISTIVE TECH ONLY WHEN THERE IS GENUINELY NOTHING HERE, AND THAT USED TO
      // BE MEASURED THE WRONG WAY (owner 2026-08-21). These two props hide the WHOLE SUBTREE —
      // `accessibilityElementsHidden` on iOS, `importantForAccessibility="no-hide-descendants"` on
      // Android — and they were keyed on `label` alone. Every pokeable character in the app passes
      // `onPoke` and no `label` (`CanvasDock` and the landing greeter in `app/(tabs)/learn.tsx`
      // both do), so the Pressable below, with its `accessibilityRole="button"` and its name, was
      // sitting inside a subtree the screen reader had been told to skip. VoiceOver never reached
      // it: the tap gestures the owner asked for were built, shipped, and unreachable to anyone
      // driving the phone by voice — which is the same class of failure as `CanvasDock`'s
      // hard-coded `pointerEvents="none"`, one layer further in and invisible to a sighted test.
      //
      // Decorative means BOTH: no name of its own AND nothing to press. Given either, the subtree
      // stays in the tree. It is not enough to drop these props only when `label` is given —
      // `label` is what makes the character an announced image, and a dock that announces itself
      // as an image on every screen is noise; what it needs is to expose the BUTTON underneath.
      accessibilityElementsHidden={label || onPoke ? undefined : true}
      importantForAccessibility={label || onPoke ? undefined : "no-hide-descendants"}
    >
      <Svg width={size} height={size} viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}>
        <Defs>
          {/* 🔴 THE EYES ARE HOLES, NOT WHITE SHAPES LAID ON TOP. That is what makes them clip
              themselves against the silhouette when they slide toward its edge. RNSVG defaults
              maskType to luminance, matching SVG, and derives maskContentUnits from maskUnits —
              landing on userSpaceOnUse, which is what these viewBox coordinates need. */}
          <Mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={-VB}
            y={-VB}
            width={VB * 2}
            height={VB * 2}
          >
            <Path
              ref={(el) => {
                maskBodyRef.current = el;
              }}
              d=""
              fill="#fff"
            />
            {[0, 1].map((i) => (
              <Path
                key={i}
                ref={(el) => {
                  eyeRefs.current[i] = el;
                }}
                d=""
                fill="#000"
              />
            ))}
            <Circle
              ref={(el) => {
                notchRef.current = el;
              }}
              cx={0}
              cy={0}
              r={0}
              fill="#000"
            />
          </Mask>
          {Array.from({ length: ARC_POOL }, (_, i) => (
            <LinearGradient
              key={i}
              id={`${uid}-arc-${i}`}
              ref={(el) => {
                gradRefs.current[i] = el;
              }}
              gradientUnits="userSpaceOnUse"
            >
              {/* Present so `extractGradient` builds the flat array at mount; never written to
                  afterwards — see LinearGradientNativeWrite above. LinearGradient's children type
                  is ReactElement[], so a lone child would be a type error; this is a map. */}
              {Array.from({ length: STOPS }, (_, s) => (
                <Stop key={s} offset={s / (STOPS - 1)} stopColor="transparent" />
              ))}
            </LinearGradient>
          ))}
        </Defs>

        {/* Back halves of the orbits, drawn first so the body occludes them. */}
        <G>
          {Array.from({ length: ARC_POOL }, (_, i) => (
            <Path
              key={i}
              ref={(el) => {
                backRefs.current[i] = el;
              }}
              d=""
              fill="none"
              strokeLinecap="round"
              stroke={`url(#${uid}-arc-${i})`}
            />
          ))}
        </G>

        {/* The burst's particles: behind the core, so the body occludes them. */}
        <G>
          {Array.from({ length: DOT_POOL }, (_, i) => (
            <Path
              key={i}
              ref={(el) => {
                dotBackRefs.current[i] = el;
              }}
              d=""
            />
          ))}
        </G>

        <G
          ref={(el) => {
            bodyGroupRef.current = el as unknown as OpacityNode | null;
          }}
        >
          {/* Opaque backing in the surface's own colour. Without it the rings that pass behind the
              body show through the eye holes. */}
          <Path
            ref={(el) => {
              paperBodyRef.current = el;
            }}
            d=""
            fill={paperHex}
          />
          <G mask={`url(#${maskId})`}>
            <Rect
              ref={(el) => {
                inkRectRef.current = el;
              }}
              x={-VB}
              y={-VB}
              width={VB * 2}
              height={VB * 2}
              fill={ink}
            />
          </G>
        </G>

        {/* Every other dot — the thinking trio, the tear of the "!" — sits in front. */}
        <G>
          {Array.from({ length: DOT_POOL }, (_, i) => (
            <Path
              key={i}
              ref={(el) => {
                dotFrontRefs.current[i] = el;
              }}
              d=""
            />
          ))}
        </G>

        <Circle
          ref={(el) => {
            notifRef.current = el;
          }}
          cx={0}
          cy={0}
          r={0}
          fill={NOTIF_BLUE}
        />

        <G>
          {Array.from({ length: ARC_POOL }, (_, i) => (
            <Path
              key={i}
              ref={(el) => {
                frontRefs.current[i] = el;
              }}
              d=""
              fill="none"
              strokeLinecap="round"
              stroke={`url(#${uid}-arc-${i})`}
            />
          ))}
        </G>
      </Svg>

      {onPoke ? (
        /*
         * 🔴 THE PRESS AREA IS THE DRAWN SQUARE, AND IT IS MEASURED RATHER THAN ASSUMED (owner
         * 2026-08-21). `absoluteFill` inside a `size × size` wrapper makes the target exactly
         * `size`, so the two pokeable characters in the app are 52pt (`CanvasDock.DOCK_SIZE`) and
         * 112pt (the landing greeter). Both clear Apple's 44pt minimum, so nothing here is short
         * and nothing here is padded.
         *
         * 🔴 NO `hitSlop`, AND THAT IS THE DECISION RATHER THAN AN OMISSION. Adding one to
         * guarantee 44pt for some future caller was considered and rejected: `hitSlop` grows the
         * target OUTSIDE the drawn square, and this character floats over the composer, so the
         * slop would land on the text input — reinstating the exact failure the wrapper's
         * `pointer-events` note exists to prevent, except intermittently and only near the edges.
         * A character too small to press is a caller passing a `size` under 44, and the honest fix
         * for that is a bigger character, not an invisible one.
         */
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onPoke}
          accessibilityRole="button"
          // The name a screen reader reads. `label` when the caller gave the character one,
          // otherwise the product's name — never "" and never the empty default, because an
          // unnamed button is announced as "button" and there is no way to guess what it does.
          accessibilityLabel={label ?? "Nemesis"}
        />
      ) : null}
    </View>
  );
}
