"use client";

// The character itself. A React client for the vendored engine in `lib/bloub`.
//
// 🔴 THE ENGINE IS NOT MINE AND IS NOT EDITED. `lib/bloub/*.ts` is vendored whole from
// jeremy-prt/bloub (MIT, see lib/bloub/LICENSE) because its pose model is spherical —
// eyes live on a sphere and are placed through a tangent frame, with every state's gaze
// written as measured yaw/pitch/roll. Translating that state table into a flat 2D
// system produces something that is not the same character. So the engine stays intact
// and this file is a renderer, nothing more.
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

import { useEffect, useId, useLayoutEffect, useRef } from "react";

import { NOTIF_BLUE } from "@/lib/bloub/decor";
import { BotEngine, type BotFrame } from "@/lib/bloub/engine";
import { EXPRESSION_BY_ID } from "@/lib/bloub/expressions";
import { TURN_TIME } from "@/lib/bloub/gaze";
import { clamp, easings } from "@/lib/bloub/math";
import { DEMI_VIEWBOX, RAYON } from "@/lib/bloub/repere";
import { mixHex } from "@/lib/bloub/skins";

import { CHARACTER_SHAPE, aimFor, arcStops, inkFor } from "@/lib/character/look";
import { browFrame, raisedBrow } from "@/lib/character/brow";
import { LENS_RING, LENS_RX, LENS_RY, SIGMA_BROW_EYE, SMIRK, annulusPath, type FaceId } from "@/lib/character/face";
import { capsulePath } from "@/lib/bloub/shape";
import { POSES, STATE_BY_ID, type StateId } from "@/lib/bloub/states";

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
  /**
   * The body colour, as an ACCENT id (owner 2026-08-20: "the color affects the accent of the
   * send button and also the blob").
   *
   * 🔴 ONE CONTROL, NOT TWO. The character used to carry its own twelve-colour palette beside
   * the app's accent picker, so a learner could set them to disagree and nothing would tell
   * them which one they had just changed. It reads the app's accent now; `"default"` means the
   * character stays ink, which is what the rest of the chrome does with the same choice.
   */
  color?: string;
  /** Customiser: resting expression. */
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
   * Run the brow waggle. Scene-clocked in the loop, so it slows with `speed` and pauses with
   * it — see lib/character/brow.ts; `browFrame` closes the brows before the window ends, so
   * the caller only says whether the gesture is wanted. Ignored on a still: no loop runs.
   */
  waggle?: boolean;
  /** A face from OUR layer (reading glasses, the sigma). Omitted is the plain rest face. */
  face?: FaceId | null;
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

export function BloubBot({
  state = "idle",
  size = 96,
  color = "default",
  expression = "neutre",
  waggle = false,
  face = null,
  paper,
  track = false,
  aimAt = null,
  entrance = false,
  onPoke,
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
  // Our face layer: brows, lenses, mouth. Holes in the SAME mask as the eyes, placed
  // through the eye matrices — see lib/character/brow.ts for why a feature is a hole
  // rather than a stroke laid on the face. Parked at display:none like every pool node.
  const browRefs = useRef<(SVGPathElement | null)[]>([]);
  const lensRefs = useRef<(SVGPathElement | null)[]>([]);
  const mouthRef = useRef<SVGPathElement | null>(null);
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
      CHARACTER_SHAPE,
      EXPRESSION_BY_ID.get(expression) ?? null,
    );
  }

  // Resolved once per render and read by the loop, so the loop never re-subscribes.
  const ink = inkFor(color, typeof document !== "undefined" ? document.documentElement.dataset.theme : undefined);
  const live = useRef({ ink, paper: paper ?? "", speed, track, aimAt, entrance, face });
  live.current = { ink, paper: paper ?? "", speed, track, aimAt, entrance, face };

  /**
   * Writes one frame onto the DOM.
   *
   * Everything below is an attribute write on a node that already exists. Unused pool
   * members are parked at `display: none` rather than removed, so the node count is
   * constant for the lifetime of the component.
   */
  const paint = (frame: BotFrame, inkHex: string, paperHex: string, browAt: number | null, faceId: FaceId | null) => {
    maskBodyRef.current?.setAttribute("d", frame.bodyPath);
    paperBodyRef.current?.setAttribute("d", frame.bodyPath);
    paperBodyRef.current?.setAttribute("fill", paperHex);
    inkRectRef.current?.setAttribute("fill", inkHex);
    bodyGroupRef.current?.setAttribute("opacity", String(frame.bodyAlpha));

    // 🔴 THE BROW IS RESOLVED ONCE, NOT PER EYE — one `capsulePath` per frame. A waggle
    // raises both together; the sigma holds ONE at the waggle's own top, so the two can
    // never drift apart (see raisedBrow in lib/character/brow.ts).
    const sigma = faceId === "sigma";
    const brow = browAt !== null ? browFrame(browAt) : sigma ? raisedBrow() : null;
    const browPath = brow ? capsulePath(brow.w * RAYON, brow.h * RAYON) : "";
    const lensPath = faceId === "reading" ? annulusPath(LENS_RX * RAYON, LENS_RY * RAYON, LENS_RING * RAYON) : "";

    for (let i = 0; i < 2; i += 1) {
      const node = eyeRefs.current[i];
      const eye = frame.eyes[i];
      const browNode = browRefs.current[i];
      if (browNode) {
        // 🔴 NO EYE MEANS NO BROW. An eye is dropped from the frame once it has gone round
        // the back of the sphere; a brow that outlived it would hang unattached over the
        // body's edge. It also covers every faceless state without naming any. The sigma
        // wears its single brow on SIGMA_BROW_EYE only — the asymmetry IS the face.
        const wanted = brow && eye && (browAt !== null || (sigma && i === SIGMA_BROW_EYE));
        if (!wanted) {
          browNode.style.display = "none";
        } else {
          browNode.style.display = "";
          browNode.setAttribute("d", browPath);
          // Placed THROUGH the eye's own matrix, then lifted in the eye's local frame: the
          // tangent frame, the head's roll and the foreshortening all come along for free.
          browNode.setAttribute("transform", `${eye.matrix} translate(0,${(brow.dy * RAYON).toFixed(2)})`);
          browNode.setAttribute("opacity", String(eye.alpha));
        }
      }
      const lensNode = lensRefs.current[i];
      if (lensNode) {
        if (!eye || faceId !== "reading") {
          lensNode.style.display = "none";
        } else {
          lensNode.style.display = "";
          lensNode.setAttribute("d", lensPath);
          lensNode.setAttribute("transform", eye.matrix);
          lensNode.setAttribute("opacity", String(eye.alpha));
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

    // The smirk rides the SAME eye the sigma brow does, offset down the face in that eye's
    // local frame — anywhere else and it would detach the moment the head rolled.
    const mouth = mouthRef.current;
    if (mouth) {
      const anchorEye = frame.eyes[SIGMA_BROW_EYE];
      if (!sigma || !anchorEye) {
        mouth.style.display = "none";
      } else {
        mouth.style.display = "";
        mouth.setAttribute("d", capsulePath(SMIRK.w * RAYON, SMIRK.h * RAYON));
        mouth.setAttribute(
          "transform",
          `${anchorEye.matrix} translate(${(SMIRK.dx * RAYON).toFixed(2)},${(SMIRK.dy * RAYON).toFixed(2)}) rotate(${SMIRK.rot})`,
        );
        mouth.setAttribute("opacity", String(anchorEye.alpha));
      }
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
      // 🔴 INK, AND THE COLOURED VERSION OF THIS LASTED ONE ROUND (owner 2026-08-21: *"remove the
      // 'colorful pulsing'"*). The dots were tinted through the app's accents while the character
      // was thinking; what the owner wanted was the WORDS moving, not the mark changing colour.
      // The character stays one ink in every state, which is what the file header has always said.
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
        // 🔴 THE SEED'S HUES ARE IGNORED, NOT REMOVED (owner 2026-08-21: *"remove the colorful
        // swirls from the mascot"*). `lib/bloub/decor.ts` is vendored and must stay a plain copy,
        // so `arc.grad.stops` still arrives as a rainbow and this product declines to paint it.
        // See `arcStops` for why the FADE along the stroke survives when the colour does not.
        const stops = arcStops(inkHex, paperHex, STOPS);
        for (let s = 0; s < STOPS; s += 1) {
          const stop = stopRefs.current[i * STOPS + s];
          const colour = stops[s] ?? inkHex;
          if (stop) stop.setAttribute("stop-color", colour);
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
  // The waggle's clock is the SCENE's, measured from when it was asked for — a wall-clock
  // timer would keep waggling on a paused character and race on a slowed one. Stamped at
  // render, like the engine's own timestamped setters.
  const waggleFromRef = useRef<number | null>(null);
  const waggledRef = useRef(false);
  if (waggle !== waggledRef.current) {
    waggledRef.current = waggle;
    waggleFromRef.current = waggle ? clockRef.current : null;
  }
  const aimingRef = useRef(false);
  const turnSinceRef = useRef(0);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    engineRef.current?.setExpression(EXPRESSION_BY_ID.get(expression) ?? null, clockRef.current);
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

  useLayoutEffect(() => {
    if (!still) return;
    const engine = engineRef.current;
    if (!engine) return;
    // 🔴 HELD AT ITS CHARACTERISTIC INSTANT, NOT FROZEN AT ZERO. Every animation
    // publishes the moment it reads best (`POSES`), and holding that is what keeps
    // `thinking` legible as three dots rather than as a ball caught before it split.
    paint(engine.sample(frozenAt ?? POSES[state] ?? 1), live.current.ink, resolvedPaper(), null, face);
    // Redrawn whenever the look changes, since nothing else will redraw it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, frozenAt, state, color, expression, paper, face]);

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
      const at = waggleFromRef.current !== null || live.current.face === "sigma" ? null : (live.current.aimAt ?? pointerRef.current);
      const box = svgRef.current?.getBoundingClientRect();
      // 🔴 A ZERO-SIZED BOX IS REFUSED, and this is not defensive noise. The
      // normalisation below would be 0/0, and the engine KEEPS its last target: a
      // single NaN would settle in and the character would never look anywhere again.
      // A hidden browser pane returns exactly these zeros.
      if (!box || box.width === 0 || box.height === 0) return;
      if (!aimingRef.current) turnSinceRef.current = clockRef.current;
      const halfW = Math.max(1, window.innerWidth / 2);
      const halfH = Math.max(1, window.innerHeight / 2);
      const aimed = aimFor(
        at ? clamp((at.x - (box.left + box.width / 2)) / halfW, -1, 1) : 0,
        at ? clamp((at.y - (box.top + box.height / 2)) / halfH, -1, 1) : 0,
        at !== null,
      );
      engine.setLook(
        {
          ...aimed,
          // The entrance turn is the ONLY thing that still wants a spin, and it fades to zero.
          spin: live.current.entrance
            ? 360 * (1 - easings.easeOutQuint(clamp((clockRef.current - turnSinceRef.current) / TURN_TIME)))
            : 0,
        },
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
      const from = waggleFromRef.current;
      paint(
        engine.sample(clockRef.current),
        live.current.ink,
        resolvedPaper(),
        from === null ? null : clockRef.current - from,
        live.current.face,
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
          {/* Our face layer: brows, lenses, mouth — holes like the eyes, parked until worn. */}
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
          {[0, 1].map((i) => (
            <path
              key={`lens-${i}`}
              ref={(el) => {
                lensRefs.current[i] = el;
              }}
              d=""
              fill="#000"
              fillRule="evenodd"
              style={{ display: "none" }}
            />
          ))}
          <path ref={mouthRef} d="" fill="#000" style={{ display: "none" }} />
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
