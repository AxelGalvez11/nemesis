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
// React mounts a fixed skeleton (a mask, a body, two eyes, two brows, two circles, 8+8 dots, 12+12
// arcs and 12 gradients) and after that `paint()` writes onto nodes held in refs. There is no
// `setState` anywhere in the loop. The in-repo precedent is `app/(tabs)/graph.tsx`, whose loop comment says
// the same thing in the same words: no setState, so React does not run.
//
// 🔴 THE ENGINE IS NOT ON REANIMATED, AND THAT IS NOT AN OVERSIGHT. Reanimated would put the
// per-frame work on the UI thread, which is where it belongs — but the engine is 3,200 lines of
// vendored code that must not be edited, so it cannot carry `'worklet'` directives and `sample(t)`
// cannot run on the UI runtime. Vendoring the engine and forking it to add worklets is the same
// decision as not vendoring it. So the loop runs on the JS thread, exactly as it does on web, and
// the mitigations are the two gates below rather than a thread move.
//
// 🔴 THE FILE DOES IMPORT REANIMATED NOW, FOR EXACTLY ONE THING, AND THE PARAGRAPH ABOVE STILL
// HOLDS (owner 2026-08-21: "the character still does not jump"). The hop is a transform on a
// wrapper view — two shared values, no engine sampling, nothing vendored — so it is precisely the
// case the objection above does not cover: there is no `sample(t)` to worklet-ise, because the
// engine is not involved in it at all. Nothing about the pose, the face, the decor or the gaze
// moved onto the UI thread, and if a future change tries to take the engine there, the argument
// above is the one it has to answer. See `motion` and the `── The hop ──` block.
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
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
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
import { capsulePath } from "@nemesis/shared/bloub/shape";
import { COLOR_BY_ID, SHAPE_BY_ID, mixHex } from "@nemesis/shared/bloub/skins";
import { POSES, STATE_BY_ID, type StateId } from "@nemesis/shared/bloub/states";
import { browFrame } from "@nemesis/shared/character/brow";
import { restingFace } from "@nemesis/shared/character/face";
import { centredLook, idleAim } from "@nemesis/shared/character/gaze";
import {
  JUMP_EASE,
  JUMP_KEYFRAMES,
  JUMP_MS,
  waggleLook,
  type PokeMotion,
} from "@nemesis/shared/character/poke";
import { ARC_POOL, ARC_STOPS as STOPS, DOT_POOL } from "@nemesis/shared/character/pool";

import { useTheme } from "@/theme/ThemeProvider";

import { argb, discPath, dotMatrix, liftMatrix, parseMatrix } from "./bloub-frame";

// Pool sizes live in the shared package so the guard that keeps them honest can run in plain Node,
// without React, RNSVG or a device. Re-exported because callers reach for them through the
// renderer, exactly as they do on web.
export { ARC_POOL, DOT_POOL } from "@nemesis/shared/character/pool";

const VB = DEMI_VIEWBOX;

/** How often the wrapper's position on screen is re-measured while the loop runs, in ms. */
const BOX_MS = 120;

const styles = StyleSheet.create({
  /**
   * The layer the hop moves, between the layout box and the character.
   *
   * 🔴 `transformOrigin` AT THE FEET IS LOAD-BEARING, NOT A FLOURISH. It is web's
   * `transform-origin: 50% 100%`, and its stylesheet gives the reason: squash reads as weight only
   * if the body flattens AGAINST the floor. About its middle the character shrinks symmetrically
   * and reads as being resized rather than as landing on something. RN has supported this style
   * since 0.76 and it needs no plugin.
   *
   * 🔴 IT FILLS THE WRAPPER RATHER THAN WRAPPING THE `<Svg>` ALONE, SO THE PRESS TARGET HOPS WITH
   * THE CHARACTER. Web's hop wrapper contains the whole clickable character; a phone version that
   * left the Pressable behind would leave a learner tapping a square of empty space while the
   * character is in the air above it.
   */
  hop: { height: "100%", transformOrigin: "50% 100%", width: "100%" },
});

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
   * It also carries the poke's `colere` — see `use-poke.ts`: one owner per channel, or the tilt fix
   * and the angry gesture overwrite each other every render. The brow waggle used to be a second
   * expression on this channel and is not one any more; it is drawn as mask geometry now, and
   * arrives through `gaze`.
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
   * 🔴 IT WAS BUILT FOR A GESTURE THAT NO LONGER EXISTS, AND THE MEASUREMENT IS KEPT BECAUSE IT IS
   * WHY THE CHANNEL IS SHAPED THIS WAY (owner 2026-08-20: "spin around"; removed 2026-08-21:
   * "remove the colorful swirls around the mascot"). Measured on the real engine, the `swirl`
   * state ALONE moves the inner eye 55px on a 100px-radius body — the same as ordinary idle
   * wander — and never sends an eye behind the sphere: its pose is three rings laid over the
   * resting face, and the rotation in upstream's settings entrance comes from the LOOK, not from
   * the state. Driving the vendored `tourLook` script instead, the inner eye travelled 184px and
   * passed behind the body for about half a second. That was the spin, and it was the only way to
   * build one — which is exactly why a "spin" cannot be rebuilt without the swirls coming with it.
   * `@nemesis/shared/character/poke` holds the removal record. TODAY THIS CHANNEL HAS ONE USER:
   * the brow waggle, below.
   *
   * 🔴 IT IS A SCRIPT, NOT AN ANIMATION WRITTEN HERE. Same rule the idle wandering follows: what
   * this file may do is hand the engine a target every frame. `@nemesis/shared/bloub/gaze`'s
   * `GazeScript` type exists for exactly this and its contract is that a script ENDS at `mix: 0`,
   * so there is never anything to release and no last slide of the eyes when it finishes.
   *
   * 🔴 AND IT KEEPS `aimingRef` SET, so handing the gaze back to the steering afterwards does not
   * fire a second entry turn. The engine's own catch-up (`LOOK_MORPH`, 0.24s) smooths the script
   * exactly as it smooths a cursor, which over a gesture of a second or more is a lag of about a
   * frame and a half — invisible, and it converges because the script lands where it started.
   *
   * 🔴 THE GESTURE IT CARRIES IS THE BROW WAGGLE, AND THIS CHANNEL CARRIES IT WHOLE. `waggleLook`
   * turns the character to face front for the length of the gesture — a waggle is aimed at
   * somebody — and the loop reads that same script, by identity, as the instruction to cut two
   * brows into the mask, on the script's own clock. See the `script === waggleLook` branch in
   * `tick` for why the signal is the script rather than a flag beside it, and
   * `@nemesis/shared/character/poke` for the measurements behind the bearing.
   */
  gaze?: GazeScript | null;
  /**
   * A movement of the WHOLE CHARACTER for the current beat, or null. Today the only one is the hop.
   *
   * 🔴 IT IS A TRANSFORM ON THIS COMPONENT'S OWN WRAPPER, NOT A POSE, AND THAT IS THE ONLY PLACE
   * IT COULD BE (owner 2026-08-20 "he should jump", again 2026-08-21 "the character still does not
   * jump"). The vendored pose table describes a face on a sphere — where the eyes sit, how wide
   * they open, what the silhouette is. Leaving the ground is the whole body moving through space,
   * which that model has no vocabulary for and does not need one for: a jump is a transform on the
   * element the character is drawn in. So the engine stays unedited and keeps being the single
   * opinion about the face, exactly as `apps/web/components/bloub/bloub.css` argues for the same
   * hop on the same character.
   *
   * 🔴 AND THAT MAKES IT THE DOCUMENTED EXCEPTION TO "NO HAND-ROLLED ANIMATION BESIDE THE ENGINE",
   * WHICH IS WORTH SAYING OUT LOUD RATHER THAN LEAVING A READER TO THINK THE RULE WAS BROKEN.
   * `@nemesis/shared/character/poke` states the rule — a beat is a pose plus a duration, never a
   * curve — because a second animator driving the FACE would compete with `StateDef.morph` and
   * `BotEngine.SHAPE_MORPH`, which are measured. The hop drives no face. It moves the box the face
   * is inside, one layer outside everything the engine owns, in the same place `character/gaze.ts`
   * puts a look target and `character/brow.ts` puts a brow. Measured: during a hop the eye centre
   * moves 0.6 viewBox units per frame — the ordinary idle wander — because there is no channel
   * through which the transform could reach the engine at all.
   *
   * 🔴 IT IS A PROP RATHER THAN SOMETHING THIS FILE DERIVES FROM `onPoke`, because which gesture a
   * tap draws is `@nemesis/shared/character/poke`'s opinion and this file is a renderer. Web makes
   * the same split: `usePoke` returns `motion`, and the call site puts the class on.
   */
  motion?: PokeMotion;
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
  motion = null,
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
  // One per eye, and they live in the MASK beside them — `@nemesis/shared/character/brow` carries
  // the argument for why a brow is a hole cut in the body rather than a stroke laid on the face.
  const browRefs = useRef<(Path | null)[]>([]);
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
  const paint = (frame: BotFrame, inkHex: string, paperFill: string, browAt: number | null) => {
    maskBodyRef.current?.setNativeProps({ d: frame.bodyPath });
    paperBodyRef.current?.setNativeProps({ d: frame.bodyPath, fill: paperFill });
    inkRectRef.current?.setNativeProps({ fill: inkHex });
    // G.setNativeProps only injects a matrix when transform props are present, so passing opacity
    // alone leaves the group's transform untouched.
    bodyGroupRef.current?.setNativeProps({ opacity: frame.bodyAlpha });

    // 🔴 THE BROW IS RESOLVED ONCE, NOT PER EYE. Both brows are the same capsule at the same
    // height — a waggle raises them together — so building the path twice would be two calls to
    // `capsulePath` a frame for one string. `browAt` is null except during a waggle, and
    // `browFrame` itself returns null at both ends of that window, so the ordinary case costs one
    // comparison. Same split web's `bloub-bot.tsx` makes, for the same reason.
    const brow = browAt === null ? null : browFrame(browAt);
    const browPath = brow ? capsulePath(brow.w * RAYON, brow.h * RAYON) : "";

    for (let i = 0; i < 2; i += 1) {
      const node = eyeRefs.current[i];
      const browNode = browRefs.current[i];
      const eye = frame.eyes[i];
      // 🔴 THE ENGINE'S EYE TRANSFORM IS AN SVG STRING AND HAS TO BE PARSED. See
      // `bloub-frame.ts`: nothing in RNSVG parses `matrix(...)` arriving through setNativeProps.
      // Parsed ONCE per eye and shared with the brow, which is built from the same six numbers.
      const matrix = eye ? parseMatrix(eye.matrix) : null;
      if (browNode) {
        // 🔴 NO EYE MEANS NO BROW, AND THAT FALLS OUT OF THE SAME TEST. An eye is dropped from
        // the frame once it has gone round the back of the sphere (`engine.ts`: `depth <= 0.02`),
        // and a brow that outlived it would hang unattached over the body's edge. The `alpha` it
        // copies covers the other half without naming a state: driven through the real engine,
        // `thinking`, `alert`, `exclaim`, `sleep`, `burst` and `comet` each reach an instant with
        // no face at all, and a brow floating over a faceless body is the same bug seen twice.
        if (!eye || !matrix || !brow) {
          browNode.setNativeProps({ d: "", opacity: 0 });
        } else {
          browNode.setNativeProps({
            d: browPath,
            // Placed THROUGH the eye's own matrix, then lifted in the eye's local frame. That is
            // the whole trick: the tangent frame, the head's roll and the foreshortening are all
            // already in that matrix, so the brow inherits them instead of re-deriving them.
            matrix: liftMatrix(matrix, brow.dy * RAYON),
            opacity: eye.alpha,
          });
        }
      }
      if (!node) continue;
      if (!eye || !matrix) {
        node.setNativeProps({ d: "", opacity: 0 });
        continue;
      }
      node.setNativeProps({ d: eye.d, matrix, opacity: eye.alpha });
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

  // ── The hop ──────────────────────────────────────────────────────────────────
  //
  // 🔴 IT IS THE ONLY THING IN THIS FILE THAT IS NOT DRIVEN BY THE ENGINE, AND IT SAYS SO HERE
  // RATHER THAN LEAVING A READER TO CATCH IT. Everything else below samples `BotEngine` and writes
  // the result onto native nodes; this drives two Reanimated shared values and never touches the
  // engine at all. That is the whole reason a jump can exist without editing vendored code — see
  // the `motion` prop's note, and `@nemesis/shared/character/poke`, which states the "a beat is a
  // pose plus a duration, never a curve" rule and names this as its one exception.
  //
  // 🔴 THE KEYFRAMES ARE WEB'S, TO THE PERCENTAGE, AND THEY COME FROM THE SHARED TABLE SO THEY CAN
  // BE PINNED THERE. `apps/web/components/bloub/bloub.css` holds `@keyframes bloub-jump`; nothing
  // here can read CSS, so the same shape lives in `@nemesis/shared/character/poke` as numbers and
  // `character.test.ts` parses that stylesheet and asserts the two agree. Retyping a curve by eye
  // is how the two characters end up hopping differently with nothing failing.
  //
  // 🔴 ONE `withTiming` PER KEYFRAME INTERVAL, NOT ONE ACROSS THE WHOLE HOP, BECAUSE THAT IS WHAT
  // CSS DOES. An `animation-timing-function` on a CSS animation is applied to EVERY segment
  // between adjacent keyframes, so web's hop is six eased segments. Easing the whole 620ms once
  // would pass through the same six positions at the same six instants and travel between them
  // differently — a difference nobody can point at and everybody can see.
  //
  // 🔴 TWO SHARED VALUES RATHER THAN ONE PROGRESS VALUE AND AN `interpolate`. CSS interpolates the
  // two components of `translateY(...) scaleY(...)` independently under one eased progress, which
  // is exactly two sequences with identical durations and identical easings. A single progress
  // value would need a lookup table of its own on the UI thread to get back to the same numbers,
  // and would be one more place for the two curves to disagree.
  //
  // 🔴 `y` IS SCALED BY `size` BECAUSE WEB'S IS A PERCENTAGE OF THE ELEMENT'S OWN HEIGHT. The
  // character is 52pt in the dock and 112pt on the landing; a hop written in points would be a
  // twitch on one and a leap on the other.
  const hopY = useSharedValue(0);
  const hopScaleY = useSharedValue(1);

  useEffect(() => {
    // 🔴 REMOVED UNDER REDUCED MOTION, NOT SHORTENED, AND THAT DIFFERS FROM THE CANVAS FADE AND
    // FROM WEB'S DOCK TRAVEL ON PURPOSE. `bloub.css` makes the same call in the same words: the
    // dock's corner→centre journey is only made quicker, because WHERE the character stands is
    // the message — it says the system has taken the floor. A hop carries no such information. It
    // is a reply to a tap, and the wink and the brow waggle in the same bag still answer one, so
    // a learner who has asked for less motion loses nothing they needed. `still` also covers
    // `frozenAt`, where there is no loop and a mid-air character would simply be stuck.
    if (motion !== "jump" || still) {
      // 🔴 CANCEL, THEN RETURN TO THE GROUND IN ONE FRAME. This is the path a gesture cut mid-air
      // takes — `usePoke` hands back `motion: null` the moment the next gesture starts, or the
      // instant a wait takes the floor — and it is web's behaviour rather than a compromise:
      // removing `.bloub-jump` removes the animation and the element snaps back. Easing it out
      // would be a landing curve nobody asked for, played over a tap that has already been
      // answered. Without the `cancelAnimation` the old sequence would keep writing over these
      // assignments and the character would finish a hop it had been told to abandon.
      cancelAnimation(hopY);
      cancelAnimation(hopScaleY);
      hopY.value = 0;
      hopScaleY.value = 1;
      return;
    }
    const ease = Easing.bezier(JUMP_EASE[0], JUMP_EASE[1], JUMP_EASE[2], JUMP_EASE[3]);
    /** Milliseconds of the segment that ENDS at keyframe `i + 1`. */
    const span = (i: number) => (JUMP_KEYFRAMES[i + 1]!.at - JUMP_KEYFRAMES[i]!.at) * JUMP_MS;
    const steps = JUMP_KEYFRAMES.slice(1);
    // Start from the ground every time, so a hop that follows a cancelled one begins at 0 rather
    // than wherever the last one was abandoned.
    hopY.value = 0;
    hopScaleY.value = 1;
    hopY.value = withSequence(
      ...steps.map((k, i) => withTiming(k.y * size, { duration: span(i), easing: ease })),
    );
    hopScaleY.value = withSequence(
      ...steps.map((k, i) => withTiming(k.scaleY, { duration: span(i), easing: ease })),
    );
    // 🔴 NO CLEANUP FUNCTION, BECAUSE THE BRANCH ABOVE IS THE CLEANUP. It runs whenever `motion`
    // leaves `"jump"` or `still` becomes true, which are the only two ways a hop ends early, and
    // it is the same code path either way. A cleanup returned from here would be a THIRD copy of
    // the same two assignments, and the one that runs on unmount is unnecessary: the shared values
    // and the animation die with the component.
    //
    // `size` is in the dependency list because the hop's height is derived from it. Changing it
    // mid-hop restarts the hop at the new size, which is the only sensible answer and is also
    // unreachable today — both call sites pass a constant (52 in `CanvasDock`, 112 on the landing).
  }, [motion, still, size, hopY, hopScaleY]);

  const hopStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hopY.value }, { scaleY: hopScaleY.value }],
  }));

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
    // 🔴 NO BROWS ON A STILL, AND THAT IS THE SAME CALL WEB MAKES. A waggle is two lifts across
    // 0.9s of scene clock and a still has no clock at all, so the only thing a frozen board could
    // draw is one arbitrary instant of a gesture nobody asked it for — a character with permanent
    // eyebrows, which `character/brow.ts` is explicit is a different creature rather than a
    // gesture. Reduced motion lands here too, which is the right answer for the same reason.
    paint(engine.sample(frozenAt ?? POSES[state] ?? 1), live.current.ink, live.current.paper, null);
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
      // How far into a brow waggle this frame is, or null when there is no waggle. See the
      // `script === waggleLook` branch below for why it is derived from the gaze rather than from
      // a channel of its own.
      let browAt: number | null = null;
      if (!STATE_BY_ID.get(stateRef.current)?.baseFace) {
        release();
      } else {
        const script = gazeRef.current.script;
        const at = live.current.aimAt;
        if (script) {
          // 🔴 A SCRIPTED LOOK OUTRANKS EVERYTHING, because the only thing that sets one is a
          // gesture the learner just asked for by tapping. It is evaluated on the SCENE clock, so
          // it slows with the animation it belongs to, and the poke's own hold is divided by the
          // same rate — the two stay the same length whatever `SPEED` becomes. (The example that
          // used to stand here was the removed spin: `swirl` at 0.55, so 1.5s of rotation took
          // 2.7s of real time. Every surviving gesture runs at 1 today, so the division is a
          // no-op — see `held` in `@nemesis/shared/character/poke`, which keeps it as a guard.)
          // `aimingRef` stays set so handing back to the steering fires no second entry turn.
          const elapsed = clockRef.current - gazeRef.current.since;
          engine.setLook(script(elapsed), clockRef.current);
          aimingRef.current = true;
          // 🔴 THE BROWS ARE DRAWN EXACTLY WHILE THE WAGGLE'S OWN LOOK SCRIPT IS DRIVING THE GAZE,
          // AND THAT IS THE SIGNAL RATHER THAN A SEPARATE FLAG. A beat carries a state id, an
          // expression id, a look script and a duration; the first two are vendored vocabularies
          // that cannot say "grow brows", so the script is the one thing a gesture hands this loop
          // per frame. It is also the right clock: the brow's phase and the head's bearing are one
          // gesture, and reading them off two clocks is how they drift. `waggleLook` therefore
          // MEANS the brow waggle — a future gesture that merely wants the character to face front
          // must not reuse it, and `character.test.ts` pins that from the other side.
          //
          // 🔴 AND IT IS THE SCENE CLOCK, NOT A WALL CLOCK. `browFrame`'s window is in scene
          // seconds, so the gesture slows with `speed` and stops with it. A waggle on its own
          // timer would keep running on a paused character and would finish early on a slowed one,
          // and on this app it would also keep running while the tab is unfocused or the app is in
          // the background, where this loop is stopped outright.
          //
          // 🔴 THE ONE COST OF `gazeRef` BEING AN EFFECT RATHER THAN A RENDER-TIME REF IS PAID
          // HERE, AND IT IS PAID IN NOTHING. `bloub-bot.tsx` stamps its waggle's start DURING
          // render, because an effect can land a frame after the browser has painted and web draws
          // `elapsed = 0` in that frame. Here `since` is stamped by the same effect that picks the
          // script up, so a late effect moves BOTH and `elapsed` still starts at zero — and
          // `browFrame(0)` is null by construction (its reveal is zero-width at both ends), so the
          // frame that would have shown a full-height brow at no width does not exist. Replayed at
          // 60fps: the first frame that draws anything is elapsed 0.0167 at 4.45px of width, the
          // last is 0.883 at the same 4.45px, and both are about 0.7pt on the 52pt dock.
          if (script === waggleLook) browAt = elapsed;
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
      paint(engine.sample(clockRef.current), live.current.ink, live.current.paper, browAt);
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
      {/* 🔴 THE HOP IS ITS OWN LAYER, INSIDE THE ONE THAT IS MEASURED — the same arrangement web
          uses, for a reason that survives the move to RN. `wrapRef` is what `measureInWindow`
          reads every 120ms to normalise a look target, and the character's RESTING position is
          what a gaze should be computed from; putting the hop's transform on that same view would
          make the gaze read a box that is 66% of a body height too high for a third of a second.
          The outer view also owns the caller's `style`, the pointer rules and the accessibility
          decision, none of which should move when the character jumps.

          🔴 AND IT IS NOT KEYED, WHICH IT MUST NOT BE. Re-mounting to restart the animation is the
          obvious trick and it would take the whole renderer down with it — the engine, its clock,
          the pooled nodes and the gaze's entry turn all live in this subtree, so every second poke
          would restart the character rather than move it. It does not need the trick: `usePoke`
          returns `motion: null` between gestures and the bag never draws the same gesture twice
          running, so the effect above always sees a real null → "jump" transition. Web's dock
          carries this same warning about the same mistake. */}
      <Animated.View style={[styles.hop, hopStyle]}>
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
              {/* The brows, cut out of the same mask and parked until a waggle asks for them. They
                  are mounted with the rest of the skeleton and never unmounted, so the node count
                  stays constant — the same rule the decor pools follow. */}
              {[0, 1].map((i) => (
                <Path
                  key={`brow-${i}`}
                  ref={(el) => {
                    browRefs.current[i] = el;
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
      </Animated.View>
    </View>
  );
}
