"use client";

// The character itself. A React client for the vendored engine in `@nemesis/shared/bloub`.
//
// 🔴 THE ENGINE IS NOT MINE AND IS NOT EDITED. `packages/shared/src/bloub/*.ts` is vendored
// whole from jeremy-prt/bloub (MIT, see that folder's LICENSE) because its pose model is
// spherical — eyes live on a sphere and are placed through a tangent frame, with every state's gaze
// written as measured yaw/pitch/roll. Translating that state table into a flat 2D
// system produces something that is not the same character. So the engine stays intact
// and this file is a renderer, nothing more.
//
// 🔴 IT MOVED OUT OF `apps/web/lib/` WHEN THE PHONE GOT A CHARACTER. Nothing about the
// engine or about this file's behaviour changed — same modules, same module identity, only
// the specifier moved — but there are now TWO renderers of it: this one, which writes SVG
// attributes on DOM nodes, and `apps/mobile/src/components/bloub/BloubBot.tsx`, which
// writes native props on react-native-svg nodes. That is not the duplication the
// "exactly ONE thing that turns the engine into pixels" guard forbids; it is one renderer
// per kind of node, and the guard now names both by path so a third still fails.
//
// 🔴 REACT RENDERS THE SKELETON ONCE; THE LOOP WRITES ATTRIBUTES. Sixty reconciliations
// a second for a decorative element is the kind of cost that shows up as jank in
// somebody else's component. `paint()` writes `d`, `transform` and `opacity` straight
// onto nodes held in refs, and React is not involved after mount.
//
// 🔴 THE DECOR IS A FIXED POOL, AND ITS SIZE IS MEASURED, NOT GUESSED. A frame carries a
// variable number of dots and arcs — and during a cross-fade it carries BOTH states'
// decor at once, which is the real worst case. `scripts/bloub-board.mts`'s sibling
// measurement drove all 240 ordered state pairs through their morphs: at most 5 dots
// (burst→thinking) and 10 arcs (orbit→play). The pool has headroom over both and
// `bloub-pool.test.ts` fails if a future state exceeds it, because the alternative is
// decor silently disappearing from one animation.

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { NOTIF_BLUE } from "@/lib/bloub/decor";
import { BotEngine, type BotFrame } from "@/lib/bloub/engine";
import { TURN_TIME, lookTarget } from "@/lib/bloub/gaze";
import { clamp, easings } from "@/lib/bloub/math";
import { DEMI_VIEWBOX, RAYON } from "@/lib/bloub/repere";
import { SHAPE_BY_ID, mixHex } from "@/lib/bloub/skins";
import { capsulePath } from "@/lib/bloub/shape";
import { POSES, STATE_BY_ID, type StateId } from "@/lib/bloub/states";

import { browFrame } from "@/lib/character/brow";
import { spinTour } from "@/lib/character/spin";
import { restingFace } from "@/lib/character/face";
import { ARC_POOL, ARC_STOPS as STOPS, DOT_POOL } from "@/lib/character/pool";

import "./bloub.css";

// Pool sizes live in `pool.ts` so the guard that keeps them honest can run without
// React or a DOM. Re-exported because callers reach for them through the renderer.
export { ARC_POOL, DOT_POOL } from "@/lib/character/pool";

const VB = DEMI_VIEWBOX;

/**
 * A dot is drawn as a path whether or not the engine gave it one.
 *
 * The engine emits two kinds — a plain disc (x, y, r) and a glyph with its own `d`
 * (the tear of the "!"). Upstream switches element type between `<circle>` and
 * `<path>`; a pooled renderer cannot, so a disc is expressed as a path here. Same
 * geometry, one pool instead of two.
 */
function discPath(r: number): string {
  return `M ${-r} 0 a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
}

export interface BloubBotProps {
  /** Which animation is playing. */
  state?: StateId;
  /** Rendered size in px. The viewBox is square, so this is both width and height. */
  size?: number;
  /** Customiser: silhouette used by the resting states. */
  shape?: string;
  /**
   * An explicit body colour, as a CSS colour.
   *
   * 🔴 NORMALLY OMITTED, AND OMITTING IT IS THE ANSWER (owner 2026-08-21: "make the character
   * follow the accent color"). Left unset, the body is `--bloub-ink`, which is the app's accent
   * — see bloub.css. This used to be an id into a twelve-swatch palette with its own picker and
   * its own stored preference, which is how the product ended up with two colour settings that
   * could disagree with each other.
   *
   * What it survives for is the character lab, which exists to look at the character in colours
   * nobody has chosen. That is a developer surface exploring a value, not a second preference.
   */
  color?: string;
  /**
   * Which resting face to wear — an id from the vendored expression table.
   *
   * 🔴 RESOLVED THROUGH `restingFace`, AND THAT SOFTENS THE HEAD LEAN HERE TOO (owner 2026-08-20:
   * "change the mascot to be not so 'tilted'"). This IS a visible web change and it is intended
   * rather than collateral: `stations.ts` and `pool.ts` both argue that one opinion about the
   * character must not be forked per app, and the resting tilt is exactly such an opinion —
   * leaving web on the old -13 would be the second copy those headers exist to prevent. What
   * moves is the resting lean in `idle` and `swirl` (the two `baseFace` states) and in every
   * frozen board that renders the default `neutre`, from about 13° of visible eye-line tilt to
   * about 5°. Nothing else: no timing, no state pose, no other mood — `curieux` keeps its
   * deliberate -15 — no cursor tracking, and no edit to any vendored file.
   */
  expression?: string;
  /**
   * The page colour behind the character.
   *
   * Load-bearing, not cosmetic: the eyes are HOLES cut in the body, and the rings pass
   * behind it. Without an opaque backing in exactly the page's colour, an orbit ring
   * reappears inside the eyes.
   */
  paper?: string;
  /** The eyes follow the pointer. Off for frozen thumbnails, which have no loop. */
  track?: boolean;
  /**
   * Look HERE instead of at the pointer — client coordinates, or null for the pointer.
   *
   * The surface saying "attend to this": a diagram it just drew, the answer field, a
   * source panel. It goes through the same gaze rule the pointer does rather than a
   * second path, so an aim across the page and an aim at the cursor arrive with the
   * same weight and the same inertia. Requires `track`.
   */
  aimAt?: { x: number; y: number } | null;
  /**
   * Open the gaze with a full turn around the sphere before the eyes settle.
   *
   * 🔴 OFF BY DEFAULT, AND THAT IS A DEPARTURE FROM UPSTREAM. It is a lovely arrival —
   * the eyes really do pass behind the body and come back, because they live on a
   * sphere — but during it the character HAS NO FACE for 1.1 seconds. Upstream spends
   * that once, entering a settings view. A character parked above a composer would
   * spend it every time it appeared, and on a throttled tab (a background window, a
   * hidden pane) the scene clock barely advances, so the turn never completes and the
   * face simply never arrives. Worth it for a deliberate entrance; wrong as a default.
   */
  entrance?: boolean;
  /**
   * Called when the learner clicks the character.
   *
   * 🔴 GIVING THIS TURNS ON POINTER EVENTS, AND NOTHING ELSE DOES. The character is inert by
   * default because it floats over a composer, and something decorative that swallows a press
   * meant for the input is worse than no character. Only a surface that has somewhere for a
   * click to GO may switch that off, and it does so by having somewhere for it to go.
   */
  onPoke?: () => void;
  /**
   * Raise the eyebrows, twice, then take them away.
   *
   * 🔴 A BOOLEAN, NOT A DURATION OR A PHASE. The gesture's clock is the SCENE clock, so it
   * slows with `speed` and stops with it — a waggle driven by its own wall-clock timer would
   * keep going on a paused character and would run at full speed on a slowed one. The caller
   * says only whether the gesture is wanted; when it stops being wanted the brows are already
   * gone, because `browFrame` closes them before the window ends.
   *
   * Ignored on a still (`frozenAt`, or reduced motion): there is no loop to animate it.
   */
  waggle?: boolean;
  /**
   * Turn the character all the way round, once.
   *
   * 🔴 THE SAME MECHANISM THE ENTRANCE USES, NOT A SECOND ONE. `lookTarget` already carries a
   * full `SPIN` that fades to nothing as its `tour` runs 0 to 1; this simply drives that tour
   * from its own stamp, on its own curve (`lib/character/spin.ts`). So a spin is the arrival
   * gesture replayed on demand, and the body is no more touched by it than by the arrival.
   *
   * 🔴 A BOOLEAN ON THE SCENE CLOCK, exactly like `waggle` above and for the same reason: a turn
   * driven by its own wall-clock timer would keep going on a paused character and run at full
   * speed on a slowed one.
   *
   * Only the resting-face states are steerable, so a caller that wants this to be visible has to
   * be resting while it runs — see `Mascot.tsx`, which holds `idle` for the duration.
   */
  spin?: boolean;
  /** Freeze at this many seconds into the state. Reproducible; no loop is started. */
  frozenAt?: number;
  /** Playback rate. 0 pauses the scene clock. */
  speed?: number;
  /** Honour `prefers-reduced-motion` by holding a still frame. Defaults to honouring it. */
  reducedMotion?: boolean;
  /** Announce the character to assistive tech. Silent (decorative) unless given. */
  label?: string;
  className?: string;
}

/** Re-reads on an OS theme change, so the painted colours follow the page. */
function useOsTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setTheme(mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return theme;
}

export function BloubBot({
  state = "idle",
  size = 96,
  shape = "cercle",
  color,
  expression = "neutre",
  paper,
  track = false,
  aimAt = null,
  entrance = false,
  onPoke,
  waggle = false,
  spin = false,
  frozenAt,
  speed = 1,
  reducedMotion,
  label,
  className,
}: BloubBotProps) {
  const uid = useId().replace(/:/g, "");
  const maskId = `bloub-mask-${uid}`;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const maskBodyRef = useRef<SVGPathElement | null>(null);
  const paperBodyRef = useRef<SVGPathElement | null>(null);
  const inkRectRef = useRef<SVGRectElement | null>(null);
  const bodyGroupRef = useRef<SVGGElement | null>(null);
  const eyeRefs = useRef<(SVGPathElement | null)[]>([]);
  // One per eye, and they live in the MASK beside them — see `character/brow.ts` for why a
  // brow is a hole rather than a stroke laid on the face.
  const browRefs = useRef<(SVGPathElement | null)[]>([]);
  const notchRef = useRef<SVGCircleElement | null>(null);
  const notifRef = useRef<SVGCircleElement | null>(null);
  // 🔴 TWO DOT POOLS, NOT ONE MOVED BETWEEN LAYERS. The burst's particles pass BEHIND
  // the core while every other dot is in front, and SVG has no z-index — paint order is
  // document order, and CSS cannot change it. Reparenting nodes each frame would
  // invalidate the refs. So both positions exist and one of them is shown.
  const dotBackRefs = useRef<(SVGPathElement | null)[]>([]);
  const dotFrontRefs = useRef<(SVGPathElement | null)[]>([]);
  const backRefs = useRef<(SVGPathElement | null)[]>([]);
  const frontRefs = useRef<(SVGPathElement | null)[]>([]);
  const gradRefs = useRef<(SVGLinearGradientElement | null)[]>([]);
  const stopRefs = useRef<(SVGStopElement | null)[]>([]);

  const engineRef = useRef<BotEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new BotEngine(
      RAYON,
      state,
      SHAPE_BY_ID.get(shape)?.radii ?? null,
      restingFace(expression),
    );
  }

  // 🔴 THE THEME AND THE ACCENT ARE READ SO A FROZEN BOT REPAINTS WHEN THEY MOVE. Both colours
  // are CSS tokens resolved at paint time, and an animated bot picks a change up on its next
  // frame for free — but a `frozenAt` bot paints once, from an effect with a dependency list,
  // and nothing in that list moves when someone switches accent or theme. So the Settings
  // preview would sit in the previous colour until something else made it re-render. (That was
  // already true of `--bloub-paper` and a theme switch; the accent only made it visible.)
  // The app has a ThemeProvider with a user-settable accent; this site has neither —
  // it follows the OS, per the note in globals.css. All these values ever did was sit in
  // the paint effect's dependency list so a theme change re-reads the CSS tokens, so an
  // OS-level listener is the whole of what is needed here.
  const theme = useOsTheme();
  const accent = "";
  const live = useRef({ color: color ?? "", paper: paper ?? "", speed, track, aimAt, entrance });
  live.current = { color: color ?? "", paper: paper ?? "", speed, track, aimAt, entrance };

  /**
   * Writes one frame onto the DOM.
   *
   * Everything below is an attribute write on a node that already exists. Unused pool
   * members are parked at `display: none` rather than removed, so the node count is
   * constant for the lifetime of the component.
   */
  const paint = (frame: BotFrame, inkHex: string, paperHex: string, browAt: number | null) => {
    maskBodyRef.current?.setAttribute("d", frame.bodyPath);
    paperBodyRef.current?.setAttribute("d", frame.bodyPath);
    paperBodyRef.current?.setAttribute("fill", paperHex);
    inkRectRef.current?.setAttribute("fill", inkHex);
    bodyGroupRef.current?.setAttribute("opacity", String(frame.bodyAlpha));

    // 🔴 THE BROW IS RESOLVED ONCE, NOT PER EYE. Both brows are the same shape at the same
    // height — a waggle raises them together — so building the path twice would be two calls
    // to `capsulePath` a frame for one string.
    const brow = browAt === null ? null : browFrame(browAt);
    const browPath = brow ? capsulePath(brow.w * RAYON, brow.h * RAYON) : "";

    for (let i = 0; i < 2; i += 1) {
      const node = eyeRefs.current[i];
      const browNode = browRefs.current[i];
      const eye = frame.eyes[i];
      if (browNode) {
        // 🔴 NO EYE MEANS NO BROW, AND THAT FALLS OUT OF THE SAME TEST. An eye is dropped from
        // the frame once it has gone round the back of the sphere (`depth <= 0.02`); a brow
        // that outlived it would hang unattached over the body's edge. It also covers every
        // faceless state — the "!" and the burst set `eyeAlpha` to 0 — without naming any.
        if (!eye || !brow) {
          browNode.style.display = "none";
        } else {
          browNode.style.display = "";
          browNode.setAttribute("d", browPath);
          // Placed THROUGH the eye's own matrix, then lifted in the eye's local frame. That is
          // the whole trick: the tangent frame, the head's roll and the foreshortening are all
          // already in that matrix, so the brow inherits them instead of re-deriving them.
          browNode.setAttribute("transform", `${eye.matrix} translate(0,${(brow.dy * RAYON).toFixed(2)})`);
          browNode.setAttribute("opacity", String(eye.alpha));
        }
      }
      if (!node) continue;
      if (!eye) {
        node.style.display = "none";
        continue;
      }
      node.style.display = "";
      node.setAttribute("d", eye.d);
      node.setAttribute("transform", eye.matrix);
      node.setAttribute("opacity", String(eye.alpha));
    }

    const notch = notchRef.current;
    if (notch) {
      if (frame.notch) {
        notch.style.display = "";
        notch.setAttribute("cx", String(frame.notch.x));
        notch.setAttribute("cy", String(frame.notch.y));
        notch.setAttribute("r", String(frame.notch.r));
      } else {
        notch.style.display = "none";
      }
    }

    const notif = notifRef.current;
    if (notif) {
      if (frame.notif) {
        notif.style.display = "";
        notif.setAttribute("cx", String(frame.notif.x));
        notif.setAttribute("cy", String(frame.notif.y));
        notif.setAttribute("r", String(frame.notif.r));
      } else {
        notif.style.display = "none";
      }
    }

    const dotPool = frame.dotsBehind ? dotBackRefs.current : dotFrontRefs.current;
    const idlePool = frame.dotsBehind ? dotFrontRefs.current : dotBackRefs.current;
    for (let i = 0; i < DOT_POOL; i += 1) {
      const parked = idlePool[i];
      if (parked) parked.style.display = "none";
      const node = dotPool[i];
      if (!node) continue;
      const d = frame.dots[i];
      if (!d) {
        node.style.display = "none";
        continue;
      }
      node.style.display = "";
      // A glyph dot carries its own path in body-radius units, so it is scaled;
      // a disc is built at its own radius and only translated.
      node.setAttribute("d", d.d ?? discPath(d.r));
      node.setAttribute(
        "transform",
        d.d
          ? `translate(${d.x} ${d.y}) rotate(${d.rot ?? 0}) scale(${RAYON})`
          : `translate(${d.x} ${d.y})`,
      );
      node.setAttribute("opacity", String(d.opacity));
      node.setAttribute(
        "fill",
        d.color ?? (d.depth === undefined ? inkHex : mixHex(paperHex, inkHex, d.depth)),
      );
    }

    for (let i = 0; i < ARC_POOL; i += 1) {
      const back = backRefs.current[i];
      const front = frontRefs.current[i];
      const arc = frame.arcs[i];
      if (!back || !front) continue;
      if (!arc) {
        back.style.display = "none";
        front.style.display = "none";
        continue;
      }
      back.style.display = "";
      front.style.display = "";
      back.setAttribute("d", arc.back);
      front.setAttribute("d", arc.front);
      back.setAttribute("stroke-width", String(arc.width));
      front.setAttribute("stroke-width", String(arc.width));
      back.setAttribute("opacity", String(arc.opacity));
      front.setAttribute("opacity", String(arc.opacity));
      const grad = gradRefs.current[i];
      if (grad) {
        grad.setAttribute("x1", String(arc.grad.x1));
        grad.setAttribute("y1", String(arc.grad.y1));
        grad.setAttribute("x2", String(arc.grad.x2));
        grad.setAttribute("y2", String(arc.grad.y2));
        for (let s = 0; s < STOPS; s += 1) {
          const stop = stopRefs.current[i * STOPS + s];
          const colour = arc.grad.stops[s] ?? arc.grad.stops[arc.grad.stops.length - 1];
          if (stop && colour) stop.setAttribute("stop-color", colour);
        }
      }
    }
  };

  // ── The customiser reaches the engine through timestamped setters ─────────────
  //
  // Never by mutating something the sampler reads: the engine's whole contract is that
  // `sample(t)` is a pure function of time, and a value read live would break replay,
  // pausing and the frozen boards all at once. Both setters morph rather than jump.
  const clockRef = useRef(0);
  /**
   * Scene-clock instant the current waggle was asked for, or null when none is running.
   *
   * 🔴 A REF SET DURING RENDER, NOT AN EFFECT, BECAUSE THE FIRST FRAME MATTERS. An effect runs
   * after the browser has already had a chance to paint, so the frame between the click and the
   * effect would draw `elapsed = 0` — full-height brows at zero width — one frame late and, on a
   * slow commit, visibly so. Reading the previous value in the same expression keeps this a pure
   * derivation rather than a second source of truth.
   */
  const waggleFromRef = useRef<number | null>(null);
  const waggledRef = useRef(false);
  if (waggle !== waggledRef.current) {
    waggledRef.current = waggle;
    waggleFromRef.current = waggle ? clockRef.current : null;
  }
  /** Scene-clock instant the current turn was asked for, or null when none is running. Stamped
   *  during render for the same first-frame reason as the waggle above. */
  const spinFromRef = useRef<number | null>(null);
  const spunRef = useRef(false);
  if (spin !== spunRef.current) {
    spunRef.current = spin;
    spinFromRef.current = spin ? clockRef.current : null;
  }
  /**
   * 🔴 THE GAZE'S BOOKKEEPING OUTLIVES THE LOOP, AND THAT IS THE WHOLE POINT.
   *
   * Aiming opens with a full turn around the sphere — the eyes pass behind the body and
   * come back — which is right ONCE, when the character first takes notice. These lived
   * inside the animation effect at first, so every change of animation re-created them
   * and re-ran the turn: switching from idle to thinking sent the eyes round the back
   * for 1.1s, every time, and it read as the face falling off.
   *
   * `state` is read through a ref for the same reason: putting it in the effect's
   * dependencies is what restarted the loop in the first place.
   */
  const aimingRef = useRef(false);
  const turnSinceRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    engineRef.current?.setShape(SHAPE_BY_ID.get(shape)?.radii ?? null, clockRef.current);
  }, [shape]);
  useEffect(() => {
    engineRef.current?.setExpression(restingFace(expression), clockRef.current);
  }, [expression]);
  useEffect(() => {
    engineRef.current?.setState(state, clockRef.current);
  }, [state]);

  // ── Paint ────────────────────────────────────────────────────────────────────
  //
  // Layout effects, not effects: the first frame has to be on screen before the browser
  // paints, or the character shows for one frame as an empty box.
  //
  // Two of them, and the split is deliberate. A STILL costs one paint and must repaint
  // whenever anything about it changes; the LOOP must survive those changes untouched,
  // because restarting it restarts the gaze's entry turn. Folding them into one effect
  // is what sent the eyes around the back of the sphere on every change of animation.
  const reduced =
    reducedMotion ??
    (typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) ??
    false;
  const still = frozenAt !== undefined || reduced;

  const resolvedPaper = () =>
    live.current.paper ||
    (typeof window !== "undefined"
      ? getComputedStyle(svgRef.current ?? document.documentElement)
          .getPropertyValue("--bloub-paper")
          .trim()
      : "") ||
    "#f9f9f9";

  /**
   * The body colour: the `color` prop when one was given, otherwise `--bloub-ink` — which is
   * the app's accent. Read from the DOM at paint time, exactly like the paper above and for
   * the same reason: the token moves when someone changes accent or theme, and the animation
   * loop must not have to re-subscribe to notice.
   *
   * The fallback is the light theme's own `--ui-action`, matching `resolvedPaper`'s light
   * `#f9f9f9` — the pair a renderer with no stylesheet at all should draw.
   */
  const resolvedInk = () =>
    live.current.color ||
    (typeof window !== "undefined"
      ? getComputedStyle(svgRef.current ?? document.documentElement)
          .getPropertyValue("--bloub-ink")
          .trim()
      : "") ||
    "#37614a";

  useLayoutEffect(() => {
    if (!still) return;
    const engine = engineRef.current;
    if (!engine) return;
    // 🔴 HELD AT ITS CHARACTERISTIC INSTANT, NOT FROZEN AT ZERO. Every animation
    // publishes the moment it reads best (`POSES`), and holding that is what keeps
    // `thinking` legible as three dots rather than as a ball caught before it split.
    paint(engine.sample(frozenAt ?? POSES[state] ?? 1), resolvedInk(), resolvedPaper(), null);
    // Redrawn whenever the look changes, since nothing else will redraw it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, frozenAt, state, shape, color, expression, paper, accent, theme]);

  useLayoutEffect(() => {
    if (still) return;
    const engine = engineRef.current;
    if (!engine) return;

    let raf = 0;
    let last = 0;

    const onPointerMove = (event: PointerEvent) => {
      // A finger leaves no cursor behind. Keeping the last touch point would freeze
      // the gaze on wherever the learner last tapped, which reads as a stuck element.
      if (event.pointerType === "touch") return;
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const onPointerLeave = () => {
      pointerRef.current = null;
    };

    const release = () => {
      if (!aimingRef.current) return;
      engine.setLook(null, clockRef.current, TURN_TIME);
      aimingRef.current = false;
    };

    const aim = () => {
      // Only the resting-face states are steerable. Everywhere else the gaze pose IS
      // the measured animation — the orbit sends the eyes round the sphere — and
      // laying a follow on top of it would smear both.
      if (!STATE_BY_ID.get(stateRef.current)?.baseFace) {
        release();
        return;
      }
      // An explicit target outranks the cursor; with neither, `pointer` stays null and
      // the head keeps its resting drift, which is what keeps it alive on a touch
      // device where no pointer exists at all.
      //
      // 🔴 A BROW WAGGLE OUTRANKS BOTH, BECAUSE IT IS AIMED AT SOMEBODY. You do not waggle
      // your eyebrows at the far corner of the room, and this is the one gesture where the
      // face itself is the message — so the character turns to front while it runs, which is
      // what `at = null` means here.
      //
      // 🔴 AND THE GEOMETRY NEEDS IT, WHICH IS THE HALF THAT WOULD BE EASY TO DELETE AS
      // FLOURISH. Measured against the engine across the full range of steered gazes: with
      // the head front the brows reach 0.94 of the body radius, comfortably inside it, and
      // with the head turned hard they reach 1.07 — outside, where a brow stops being a brow
      // and becomes a notch bitten out of the silhouette. There is simply no room above the
      // outer eye once it has slid toward the edge. Facing front is what makes the room.
      const at = waggleFromRef.current !== null ? null : (live.current.aimAt ?? pointerRef.current);
      const box = svgRef.current?.getBoundingClientRect();
      // 🔴 A ZERO-SIZED BOX IS REFUSED, and this is not defensive noise. The
      // normalisation below would be 0/0, and the engine KEEPS its last target: a
      // single NaN would settle in and the character would never look anywhere again.
      // A hidden browser pane returns exactly these zeros.
      if (!box || box.width === 0 || box.height === 0) return;
      if (!aimingRef.current) turnSinceRef.current = clockRef.current;
      const halfW = Math.max(1, window.innerWidth / 2);
      const halfH = Math.max(1, window.innerHeight / 2);
      engine.setLook(
        lookTarget({
          nx: at ? clamp((at.x - (box.left + box.width / 2)) / halfW, -1, 1) : 0,
          ny: at ? clamp((at.y - (box.top + box.height / 2)) / halfH, -1, 1) : 0,
          // 🔴 A REQUESTED TURN OUTRANKS THE ARRIVAL'S, and it has to: they are the same
          // `tour` channel, so without this the entrance's long-finished `1` would hold the
          // spin at "already over". When it ends, `turnSinceRef` is far enough in the past that
          // the arrival expression is 1 too, so handing back is not a jump.
          tour:
            spinFromRef.current !== null
              ? spinTour(clockRef.current - spinFromRef.current)
              : live.current.entrance
                ? easings.easeOutQuint(clamp((clockRef.current - turnSinceRef.current) / TURN_TIME))
                : 1,
          pointer: at !== null,
        }),
        clockRef.current,
      );
      aimingRef.current = true;
    };

    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      // Bounded delta: a tab that was hidden and comes back must not jump forward by
      // however long it was away — rAF is suspended for that whole time.
      const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0;
      last = ms;
      clockRef.current += dt * live.current.speed;
      if (live.current.track) aim();
      else release();
      // 🔴 THE WAGGLE'S CLOCK IS THE SCENE'S, MEASURED FROM WHEN IT WAS ASKED FOR. Stamping the
      // start in the effect that watches the prop would put it on a different timebase from the
      // one the gesture is drawn against, and the two drift apart the moment `speed` is not 1.
      const from = waggleFromRef.current;
      paint(
        engine.sample(clockRef.current),
        resolvedInk(),
        resolvedPaper(),
        from === null ? null : clockRef.current - from,
      );
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [still]);

  return (
    <svg
      ref={svgRef}
      className={["bloub", onPoke ? "bloub-pokeable" : "", className].filter(Boolean).join(" ")}
      onClick={onPoke}
      width={size}
      height={size}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        {/* 🔴 THE EYES ARE HOLES, NOT WHITE SHAPES LAID ON TOP. That is what makes them
            clip themselves against the silhouette when they slide toward its edge. */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <path ref={maskBodyRef} d="" fill="#fff" />
          {[0, 1].map((i) => (
            <path
              key={i}
              ref={(el) => {
                eyeRefs.current[i] = el;
              }}
              d=""
              fill="#000"
            />
          ))}
          {/* The brows, cut the same way and parked until a waggle asks for them. */}
          {[0, 1].map((i) => (
            <path
              key={`brow-${i}`}
              ref={(el) => {
                browRefs.current[i] = el;
              }}
              d=""
              fill="#000"
              style={{ display: "none" }}
            />
          ))}
          <circle ref={notchRef} cx={0} cy={0} r={0} fill="#000" style={{ display: "none" }} />
        </mask>
        {Array.from({ length: ARC_POOL }, (_, i) => (
          <linearGradient
            key={i}
            id={`${uid}-arc-${i}`}
            ref={(el) => {
              gradRefs.current[i] = el;
            }}
            gradientUnits="userSpaceOnUse"
          >
            {Array.from({ length: STOPS }, (_, s) => (
              <stop
                key={s}
                ref={(el) => {
                  stopRefs.current[i * STOPS + s] = el;
                }}
                offset={s / (STOPS - 1)}
                stopColor="transparent"
              />
            ))}
          </linearGradient>
        ))}
      </defs>

      {/* Back halves of the orbits, drawn first so the body occludes them. */}
      <g fill="none" strokeLinecap="round">
        {Array.from({ length: ARC_POOL }, (_, i) => (
          <path
            key={i}
            ref={(el) => {
              backRefs.current[i] = el;
            }}
            d=""
            stroke={`url(#${uid}-arc-${i})`}
            style={{ display: "none" }}
          />
        ))}
      </g>

      {/* The burst's particles: behind the core, so the body occludes them. */}
      <g>
        {Array.from({ length: DOT_POOL }, (_, i) => (
          <path
            key={i}
            ref={(el) => {
              dotBackRefs.current[i] = el;
            }}
            d=""
            style={{ display: "none" }}
          />
        ))}
      </g>

      <g ref={bodyGroupRef}>
        {/* Opaque backing in the page's own colour. Without it the rings that pass
            behind the body show through the eye holes. */}
        <path ref={paperBodyRef} d="" />
        <g mask={`url(#${maskId})`}>
          <rect ref={inkRectRef} x={-VB} y={-VB} width={VB * 2} height={VB * 2} />
        </g>
      </g>

      {/* Every other dot — the thinking trio, the tear of the "!" — sits in front. */}
      <g>
        {Array.from({ length: DOT_POOL }, (_, i) => (
          <path
            key={i}
            ref={(el) => {
              dotFrontRefs.current[i] = el;
            }}
            d=""
            style={{ display: "none" }}
          />
        ))}
      </g>

      <circle ref={notifRef} cx={0} cy={0} r={0} fill={NOTIF_BLUE} style={{ display: "none" }} />

      <g fill="none" strokeLinecap="round">
        {Array.from({ length: ARC_POOL }, (_, i) => (
          <path
            key={i}
            ref={(el) => {
              frontRefs.current[i] = el;
            }}
            d=""
            stroke={`url(#${uid}-arc-${i})`}
            style={{ display: "none" }}
          />
        ))}
      </g>
    </svg>
  );
}
