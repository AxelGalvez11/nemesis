"use client";

// The mascot, on screen.
//
// THIS FILE DRAWS AND NOTHING ELSE. Every decision about what the character does lives
// in `lib/mascot`, which has no React in it and no DOM — so the same engine answers the
// state board, the tests and the timeline scrubber, and there is exactly one place where
// "what does thinking look like" is decided.
//
// 🔴 REACT RENDERS THE STRUCTURE ONCE; THE ENGINE DRIVES ATTRIBUTES.
//
// Sixty setState calls a second would re-run the component, diff a tree of SVG nodes and
// hand the result to the reconciler, every frame, for a picture that is entirely
// described by one path string and about a dozen numbers. So the elements are created
// once and the frame is written straight onto them through refs. That is also what keeps
// this off the layout path: nothing here changes an element's size or position in the
// document, only the contents of a fixed-size SVG box.
//
// 🔴 THE BOX IS FIXED, AND `size` IS THE HEIGHT OF THE BODY, NOT OF THE ELEMENT. `VIEW`
// is padded for the widest excursion any state makes (see geometry.ts), so the element
// is about half again as tall as the resting body and the difference is inert padding it
// gestures into. `MARK_SCALE` converts.
//
// 🔴 FLAT. One ink, one eye colour, no gradient, no gloss, no shadow. The mascot sits
// beside dense reading material, and a rendered-looking object next to a paragraph
// competes with the paragraph.

import { useEffect, useId, useMemo, useRef } from "react";

import {
  MARK_SCALE,
  MascotEngine,
  PointerGaze,
  SATELLITES,
  UNIT_BLOB,
  VIEW,
  focusLook,
  mergeLook,
  sampleState,
  type Look,
  type MascotFrame,
  type MascotState,
} from "@/lib/mascot";

export interface NemesisMascotProps {
  /** What Nemesis is doing. Defaults to idling. */
  state?: MascotState;
  /** Rendered height of the RESTING BODY, in px. Width follows the body's ratio. */
  size?: number;
  /** Let the pointer pull the gaze. Off for decorative instances and for the board. */
  track?: boolean;
  /** Playback rate. 1 is real time; the lab uses this, the product should not. */
  speed?: number;
  paused?: boolean;
  /**
   * Render exactly this local time within `state.mode` and stop — no engine, no
   * transition, no requestAnimationFrame. This is how the state board shows twenty
   * states at once and how a transition gets screenshotted at 40%.
   */
  frozenAt?: number | null;
  /**
   * Paint exactly this frame and stop. Outranks everything else.
   *
   * The transition filmstrip needs frames from a running engine at chosen instants —
   * something `frozenAt` cannot express, because a transition is two states at once.
   * Sampling belongs to whoever is asking; this is just the brush.
   */
  frame?: MascotFrame | null;
  /**
   * Aim the gaze directly, bypassing `focus` and the pointer. The lab's gaze sliders use
   * it; the product should use `focus` and let the character behave.
   */
  look?: Look | null;
  /**
   * The clock the resting life reads while frozen. Defaults to 0, which is between
   * blinks. Give it a value only to inspect a blink or a drift at a chosen instant.
   */
  frozenClock?: number | null;
  /** `undefined` follows the OS preference; the lab overrides it to compare. */
  reducedMotion?: boolean;
  /** Give this only when the mascot carries meaning on its own. */
  label?: string;
  className?: string;
}

const IDLE_STATE: MascotState = { mode: "idle" };

/** Two decimals is well under a device pixel at any size the mascot is used at. */
const n = (v: number): string => (Math.round(v * 100) / 100).toString();

export function NemesisMascot({
  state = IDLE_STATE,
  size = 44,
  track = false,
  speed = 1,
  paused = false,
  frozenAt = null,
  frame = null,
  look: lookOverride = null,
  frozenClock = null,
  reducedMotion,
  label,
  className,
}: NemesisMascotProps) {
  // 🔴 UNIQUE PER INSTANCE. Two mascots on one page sharing a clip-path id means the
  // second silently clips with the first one's shape, and if the first ever unmounts
  // both lose their eyes. The state board puts twenty on one page, so this is not a
  // theoretical trap here — it is the first thing that would break.
  const uid = useId().replace(/:/g, "");
  const clipId = useMemo(() => `${uid}-clip`, [uid]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const rootRef = useRef<SVGGElement | null>(null);
  const bodyGRef = useRef<SVGGElement | null>(null);
  const bodyRef = useRef<SVGPathElement | null>(null);
  const clipRef = useRef<SVGPathElement | null>(null);
  const glowRef = useRef<SVGPathElement | null>(null);
  const satRefs = useRef<(SVGPathElement | null)[]>(Array(SATELLITES).fill(null));
  const eyeRefs = useRef<(SVGPathElement | null)[]>([null, null]);

  const clockRef = useRef(0);
  const latest = useRef({ state, speed, paused, track, reducedMotion, lookOverride });
  latest.current = { state, speed, paused, track, reducedMotion, lookOverride };

  /** Writes one frame onto the DOM. The only function that touches elements. */
  const paint = (f: MascotFrame) => {
    const place = `translate(${n(f.body.cx)} ${n(f.body.cy)}) rotate(${n(f.body.tilt)})`;
    bodyGRef.current?.setAttribute("transform", place);
    bodyRef.current?.setAttribute("d", f.body.d);
    clipRef.current?.setAttribute("d", f.body.d);
    if (glowRef.current) {
      glowRef.current.setAttribute("d", f.body.d);
      glowRef.current.setAttribute("transform", `scale(${n(1 + 0.17 * f.glow)})`);
      glowRef.current.setAttribute("opacity", n(f.glow * 0.24));
    }
    for (let i = 0; i < SATELLITES; i++) {
      const el = satRefs.current[i];
      const s = f.satellites[i];
      if (!el || !s) continue;
      el.setAttribute(
        "transform",
        `translate(${n(s.cx)} ${n(s.cy)}) rotate(${n(s.tilt)}) scale(${n(s.rx)} ${n(s.ry)})`,
      );
      el.setAttribute("opacity", n(s.alpha));
    }
    for (let i = 0; i < 2; i++) {
      const el = eyeRefs.current[i];
      const e = f.eyes[i];
      if (!el || !e) continue;
      // The eye is the body's own unit silhouette, scaled to a tall narrow slot. One
      // transform per eye per frame, and the self-similarity is structural rather than
      // something a future edit has to remember to preserve.
      el.setAttribute(
        "transform",
        `translate(${n(e.cx)} ${n(e.cy)}) rotate(${n(e.tilt)}) scale(${n(e.rx)} ${n(e.ry)})`,
      );
    }
    rootRef.current?.setAttribute("opacity", n(f.bodyAlpha * f.body.alpha));
  };

  // ── The explicit-frame path: someone else did the sampling ────────────────────
  useEffect(() => {
    if (frame) paint(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  // ── The frozen path: one state, one timestamp, no clock ───────────────────────
  useEffect(() => {
    if (frame || frozenAt == null) return;
    paint(
      sampleState(state.mode, frozenAt, {
        intensity: state.intensity,
        ctx: { confidence: state.confidence ?? 1, voice: state.voiceActivity ?? 0 },
        look: lookOverride ?? focusLook(state.focus ?? "none"),
        reduced: reducedMotion,
        // 🔴 THE LIVENESS CLOCK IS ZERO, NOT `frozenAt`. Blinks are drawn from the
        // clock, so a board of twenty frozen states caught some of them mid-blink —
        // `teaching` came out as two dashes, which is a portrait of a character with
        // its eyes shut rather than of the state. Zero is the one instant guaranteed
        // to be between blinks, and gaze drift is at its resting centre there too.
        clock: frozenClock ?? 0,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, frozenAt, frozenClock, state.mode, state.intensity, state.confidence, state.voiceActivity, state.focus, lookOverride, reducedMotion]);

  // ── The live path ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (frozenAt != null || frame) return;

    const engine = new MascotEngine(latest.current.state.mode, 0);
    const gaze = new PointerGaze(320);
    clockRef.current = 0;

    const media =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    let raf = 0;
    let wall = 0;
    let last = 0;
    let stopped = false;

    const step = (nowMs: number) => {
      raf = 0;
      const now = nowMs / 1000;
      const dt = last === 0 ? 0 : Math.min(0.1, now - last);
      last = now;
      const cfg = latest.current;
      const reduced = cfg.reducedMotion ?? media?.matches ?? false;

      if (!cfg.paused) clockRef.current += dt * Math.max(0, cfg.speed);
      wall += dt;

      const s = cfg.state;
      if (engine.current !== s.mode) engine.setState(s.mode, clockRef.current);

      const pointer = cfg.track ? gaze.update(wall) : null;
      const aimed = cfg.lookOverride ?? focusLook(s.focus ?? "none");
      const look = pointer ? mergeLook(aimed, pointer) : aimed;

      const t = clockRef.current;
      paint(
        engine.sample(t, {
          intensity: s.intensity,
          ctx: { confidence: s.confidence ?? 1, voice: s.voiceActivity ?? 0 },
          look,
          reduced,
          clock: t,
        }),
      );

      // With reduced motion on, a settled state is a CONSTANT frame — so the loop stops
      // rather than re-drawing the same numbers sixty times a second. A state change or a
      // pointer restarts it (see `kick`).
      const settled = reduced && engine.transitionAt(t) >= 1 && (!pointer || pointer.mix < 0.01);
      if (!stopped && !settled) raf = requestAnimationFrame(step);
    };

    const kick = () => {
      if (!stopped && raf === 0) raf = requestAnimationFrame(step);
    };
    kick();
    const poll = window.setInterval(kick, 250);

    const onMove = (ev: PointerEvent) => {
      if (!latest.current.track) return;
      const box = svgRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      gaze.point(ev.clientX, ev.clientY, box.left + box.width / 2, box.top + box.height / 2);
      kick();
    };
    const onLeave = () => {
      gaze.release();
      kick();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      window.clearInterval(poll);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozenAt == null && !frame]);

  const height = size * MARK_SCALE;

  return (
    <svg
      ref={svgRef}
      className={["nemesis-mascot", className].filter(Boolean).join(" ")}
      viewBox={VIEW.box}
      width={height * VIEW.ratio}
      height={height}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        {/* The face's window, re-cut every frame from the live silhouette — so an eye
            that has travelled to the edge is trimmed by the outline instead of hanging
            off it. Sitting on an untransformed group means the clip shares the body's
            local frame exactly, with no second copy of the placement to keep in step. */}
        <clipPath id={clipId}>
          <path ref={clipRef} d={UNIT_BLOB} />
        </clipPath>
      </defs>

      <g ref={rootRef}>
        {/* Fragments go BEHIND the body, so a spread collapsing to zero slides them home
            rather than leaving them stacked on the face. */}
        {Array.from({ length: SATELLITES }, (_, i) => (
          <path
            key={i}
            ref={(el) => { satRefs.current[i] = el; }}
            d={UNIT_BLOB}
            fill="var(--mascot-ink, #0b0b0d)"
            opacity="0"
          />
        ))}

        <g ref={bodyGRef}>
          {/* 🔴 THE PULSE IS A HALO OF THE FORM ITSELF, NOT A WASH OVER IT.
              First attempt lightened the body toward white for `correct` / `insight` /
              `success`. On a modelled bead that reads as more light falling on it; on a
              FLAT near-black mark it just turns the ink grey, and on the state board
              every celebratory state read as a FADED version of the character rather
              than an energised one. This is a copy of the live silhouette sitting
              behind the body, very slightly larger and very faint: while `glow` is 0 it
              hides underneath completely, and as it rises it grows out past the edge as
              a soft rim. Same ink, so the character never changes weight. */}
          <path ref={glowRef} d={UNIT_BLOB} fill="var(--mascot-ink, #0b0b0d)" opacity="0" />
          <path ref={bodyRef} d={UNIT_BLOB} fill="var(--mascot-ink, #0b0b0d)" />
          <g clipPath={`url(#${clipId})`}>
            {[0, 1].map((i) => (
              <path
                key={i}
                ref={(el) => { eyeRefs.current[i] = el; }}
                d={UNIT_BLOB}
                fill="var(--mascot-eye, #ffffff)"
              />
            ))}
          </g>
        </g>
      </g>
    </svg>
  );
}
