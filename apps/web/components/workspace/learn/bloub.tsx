"use client";

// Bloub, rendered by React instead of Vue.
//
// 🔴 THE ENGINE IS VENDORED UNCHANGED AND THIS IS THE ONLY THING THAT WAS REWRITTEN. `lib/bloub/`
// is Jérémy Perret's `src/bot/*` copied verbatim (MIT, licence kept beside it in
// `lib/bloub/LICENSE`). It is framework-free and clock-independent by design — `sample(t)` is a
// pure function of time — so porting it would have meant re-deriving fourteen hand-measured morph
// states for no gain and every opportunity to get one wrong. What Vue was doing that React has to
// do instead is exactly this file: run a clock, and turn one `BotFrame` into SVG.
//
// 🔴 THE OWNER WAS TOLD WHAT THIS IS AND CHOSE IT. Bloub is described by its own author as "an SVG
// recreation of the x.ai bot avatar" — the MIT licence covers the code, not the trade dress of the
// design it reproduces. Raised before any of it was written; the owner's answer was to reuse the
// original motion as-is, to test ideas with. Recorded here rather than in a commit message so that
// whoever decides Nemesis's real mascot finds the caveat attached to the thing itself.
//
// 🔴 THE DRAW ORDER IS LOAD-BEARING AND IS COPIED FROM `BloubBot.vue`, INCLUDING THE PART THAT
// LOOKS REDUNDANT. The eyes are HOLES punched in the body via a mask, not white shapes laid on top,
// which is what makes them clip themselves against the silhouette near the edge. A hole shows
// whatever is drawn behind it — and the back halves of the orbit rings and the burst particles are
// drawn behind, deliberately, so the body occludes them. Hence the opaque `paper`-filled copy of
// the body UNDER the masked one: without it, a ring passing behind the ball reappears inside the
// eyes.

import { useEffect, useRef, useState } from "react";

import { BotEngine, type BotFrame } from "@/lib/bloub/engine";
import { DEMI_VIEWBOX, RAYON } from "@/lib/bloub/repere";
import type { StateId } from "@/lib/bloub/states";

/** The largest step the clock will take. Copied from the reference: a tab that was in the
 *  background for a minute must not resume by fast-forwarding a minute of morphing in one frame. */
const MAX_STEP_SECONDS = 0.064;

interface BloubProps {
  /** Rendered width and height, in px. */
  size?: number;
  /** Which of the engine's states to sit in. `thinking` is the one this product wants. */
  state?: StateId;
  /** The body colour. */
  ink?: string;
  /** What the eyes let through. NOT white: they are holes, and what they used to show was the page
   *  behind them, so a white fill would read as lighter than the page on a large ball. */
  paper?: string;
  className?: string;
  /** Accessible name. `null` marks it decorative, for when adjacent text already says what is
   *  happening — which is the case wherever this product uses it. */
  label?: string | null;
}

export function Bloub({
  className,
  ink = "var(--ui-text-primary)",
  label = null,
  paper = "var(--ui-bg-editor)",
  size = 96,
  state = "thinking",
}: BloubProps) {
  const engine = useRef<BotEngine | null>(null);
  if (engine.current === null) engine.current = new BotEngine(RAYON, state);

  const [frame, setFrame] = useState<BotFrame>(() => engine.current!.sample(0));
  // 🔴 A UNIQUE MASK ID PER INSTANCE. SVG ids are document-global, so two of these on one page
  // would both resolve `url(#bot-mask)` to whichever mounted first and one would render as a
  // solid blob. `useId` is React's answer and is stable across hydration.
  const uid = useRef(Math.random().toString(36).slice(2, 8));
  const maskId = `bloub-mask-${uid.current}`;

  useEffect(() => {
    engine.current?.setState(state, 0);
  }, [state]);

  useEffect(() => {
    const bot = engine.current;
    if (!bot) return;
    let raf = 0;
    let last = 0;
    let clock = 0;
    const tick = (ms: number) => {
      // 🔴 ACCUMULATED, NOT `performance.now()` STRAIGHT IN. The engine's clock starts at zero for
      // this instance; feeding it the page's uptime would begin every animation mid-cycle, and the
      // clamp above would have nothing to clamp.
      const dt = last ? Math.min((ms - last) / 1000, MAX_STEP_SECONDS) : 0;
      last = ms;
      clock += dt;
      setFrame(bot.sample(clock));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const VB = DEMI_VIEWBOX;
  const dots = frame.dots.map((dot, index) => {
    const fill = dot.color ?? ink;
    if (dot.d) {
      return (
        <path
          d={dot.d}
          fill={fill}
          key={index}
          opacity={dot.opacity}
          transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})`}
        />
      );
    }
    return <circle cx={dot.x} cy={dot.y} fill={fill} key={index} opacity={dot.opacity} r={dot.r} />;
  });

  return (
    <svg
      aria-hidden={label === null ? true : undefined}
      aria-label={label ?? undefined}
      className={className}
      height={size}
      role={label === null ? undefined : "img"}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      width={size}
    >
      <defs>
        <mask height={VB * 2} id={maskId} maskUnits="userSpaceOnUse" width={VB * 2} x={-VB} y={-VB}>
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, index) => (
            <path d={eye.d} fill="#000" key={index} opacity={eye.alpha} transform={eye.matrix} />
          ))}
          {frame.notch && <circle cx={frame.notch.x} cy={frame.notch.y} fill="#000" r={frame.notch.r} />}
        </mask>
        {frame.arcs.map((arc) => (
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`${uid.current}-${arc.id}`}
            key={arc.id}
            x1={arc.grad.x1}
            x2={arc.grad.x2}
            y1={arc.grad.y1}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((colour, index) => (
              <stop key={index} offset={index / (arc.grad.stops.length - 1)} stopColor={colour} />
            ))}
          </linearGradient>
        ))}
      </defs>

      {/* Back halves of the orbits: drawn before the body, so the body occludes them. */}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            d={arc.back}
            key={`b${arc.id}`}
            opacity={arc.opacity}
            stroke={`url(#${uid.current}-${arc.id})`}
            strokeWidth={arc.width}
          />
        ))}
      </g>

      {frame.dotsBehind && <g>{dots}</g>}

      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill={paper} />
        <g mask={`url(#${maskId})`}>
          <rect fill={ink} height={VB * 2} width={VB * 2} x={-VB} y={-VB} />
        </g>
      </g>

      {!frame.dotsBehind && <g>{dots}</g>}

      {frame.notif && <circle cx={frame.notif.x} cy={frame.notif.y} fill="#2563eb" r={frame.notif.r} />}

      {/* Front halves of the orbits. */}
      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            d={arc.front}
            key={`f${arc.id}`}
            opacity={arc.opacity}
            stroke={`url(#${uid.current}-${arc.id})`}
            strokeWidth={arc.width}
          />
        ))}
      </g>
    </svg>
  );
}
