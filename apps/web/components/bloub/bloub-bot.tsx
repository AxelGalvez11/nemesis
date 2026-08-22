"use client";

// Compatibility renderer for surfaces that still import `BloubBot`.
//
// The product used to render the vendored Bloub catalogue directly. Nemesis now has its
// own deterministic mascot engine in `lib/mascot`; keeping this wrapper lets existing
// docks and call sites migrate without a flag day while ensuring the live product no
// longer turns the character into Bloub's comet/burst/triangle-style catalogue states.

import type { CSSProperties } from "react";

import { NemesisMascot } from "@/components/mascot/nemesis-mascot";
import { inkFor } from "@/lib/character/look";
import type { StateId } from "@/lib/bloub/states";
import type { ExpressionId } from "@/lib/mascot/expressions";
import type { Look } from "@/lib/mascot/gaze";
import type { MascotMode } from "@/lib/mascot/types";

import "@/components/mascot/mascot.css";
import "./bloub.css";

// Kept for the few tests/importers that used to inspect the old renderer's pools.
// The Nemesis renderer has a fixed two-fragment pool and no arc pool.
export const DOT_POOL = 2;
export const ARC_POOL = 0;

export interface BloubBotProps {
  state?: StateId;
  size?: number;
  color?: string;
  expression?: string;
  paper?: string;
  track?: boolean;
  aimAt?: { x: number; y: number } | null;
  entrance?: boolean;
  onPoke?: () => void;
  frozenAt?: number;
  speed?: number;
  reducedMotion?: boolean;
  label?: string;
  className?: string;
}

/**
 * Legacy state names describe Bloub animations; this table translates their PRODUCT
 * meaning into Nemesis semantic states. `burst`, for example, was only ever how the old
 * mascot said "ingesting" — the live character now uses the round-body ingest state.
 */
const MODE: Record<StateId, MascotMode> = {
  idle: "idle",
  thinking: "thinking",
  wink: "wink",
  wide: "listening",
  alert: "alert",
  notify: "notice",
  exclaim: "alert",
  sleep: "inactive",
  egg: "curious",
  hexagon: "evaluating",
  play: "teaching",
  orbit: "searching",
  burst: "ingesting",
  comet: "searching",
  swirl: "greeting",
};

const EXPRESSION: Record<string, ExpressionId> = {
  neutre: "neutral",
  attentif: "keen",
  surpris: "wide",
  excite: "bright",
  heureux: "bright",
  hilare: "bright",
  colere: "concerned",
  triste: "concerned",
  effraye: "wide",
  mefiant: "narrow",
  confus: "narrow",
  curieux: "keen",
  fier: "bright",
  timide: "soft",
  blase: "weary",
  somnolent: "weary",
};

function measuredLook(aimAt: { x: number; y: number } | null | undefined): Look | null {
  if (!aimAt || typeof window === "undefined" || window.innerWidth <= 0 || window.innerHeight <= 0) return null;
  const x = Math.max(-1, Math.min(1, ((aimAt.x / window.innerWidth) - 0.5) * 2));
  const y = Math.max(-1, Math.min(1, ((aimAt.y / window.innerHeight) - 0.5) * 2));
  return { x, y, mix: 0.9 };
}

export function BloubBot({
  state = "idle",
  size = 96,
  color = "default",
  expression = "neutre",
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
  const theme = typeof document !== "undefined" ? document.documentElement.dataset.theme : undefined;
  const ink = inkFor(color, theme);
  const mode = entrance && state === "idle" ? "greeting" : MODE[state];
  const look = measuredLook(aimAt);

  const style = {
    "--mascot-ink": ink,
    ...(paper ? { "--mascot-eye": paper } : null),
    display: "inline-block",
    lineHeight: 0,
    pointerEvents: onPoke ? "auto" : "none",
  } as CSSProperties;

  return (
    <span
      className={className}
      style={style}
      onClick={onPoke}
      role={onPoke ? "button" : undefined}
      tabIndex={onPoke ? 0 : undefined}
      onKeyDown={onPoke ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPoke();
        }
      } : undefined}
    >
      <NemesisMascot
        state={{ mode, expression: EXPRESSION[expression] ?? "neutral" }}
        // The old `size` described the entire padded SVG. The native component's size is
        // the resting BODY, so keep the perceived body close to the old call sites.
        size={size * 0.72}
        track={track && !look}
        look={look}
        speed={speed}
        frozenAt={frozenAt ?? null}
        reducedMotion={reducedMotion}
        label={label}
      />
    </span>
  );
}
