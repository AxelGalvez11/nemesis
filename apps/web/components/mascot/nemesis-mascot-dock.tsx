"use client";

// The mascot, parked in the corner of a working surface.
//
// WHERE IT SITS AND WHY. Lower left, above the composer. Lower left because the
// composer is the thing the learner returns to and the character should be beside it
// rather than over it; above rather than beside because the composer grows as you type
// and anything sharing its row gets pushed around. The dock measures the composer and
// floats clear of it, so it stays put while the composer changes height.
//
// 🔴 IT IS `position: fixed` AND IT NEVER TAKES PART IN LAYOUT. Nothing below this
// reserves space, and the element does not accept pointer events, so the mascot cannot
// move the page's content or intercept a click meant for it. That is not a nicety: a
// character that reflows the page it is sitting on is worse than no character.
//
// WHAT IT LOOKS AT, in order of precedence:
//
//   1. whatever `lookAt()` was last given   — the surface saying "look at this"
//   2. the focused field                    — the learner started typing
//   3. the pointer                          — with inertia, and never chased
//
// With none of those it falls back to the state's own gaze bias and its resting drift,
// which is what keeps it alive on a touch device where there is no pointer at all.

import { useEffect, useRef, useState } from "react";

import {
  ATTENTION_ATTR,
  getAttention,
  resolveAttention,
  subscribeAttention,
  type AttentionTarget,
  type MascotState,
} from "@/lib/mascot";

import { NemesisMascot } from "./nemesis-mascot";

export interface NemesisMascotDockProps {
  state?: MascotState;
  /** Height of the resting body, px. */
  size?: number;
  /**
   * A selector for the element to float above — the composer. When it resolves, the
   * dock tracks its top edge; when it does not, the dock falls back to `bottom`.
   */
  anchor?: string;
  /** Distance from the left edge, px. */
  left?: number;
  /** Distance from the bottom edge when there is no anchor, px. */
  bottom?: number;
  /** Gap left above the anchor, px. */
  gap?: number;
  /**
   * Sit inside the nearest positioned ancestor instead of the window.
   *
   * The product wants this on almost everywhere: a workspace has a rail down the left,
   * and a mascot pinned to the WINDOW's lower-left corner lands in it. Off by default
   * only because a page with no positioned wrapper is the simpler case to reason about.
   */
  contain?: boolean;
  className?: string;
}

/** How often the anchor and the attention target are re-measured. See attention.ts. */
const MEASURE_MS = 120;

export function NemesisMascotDock({
  state,
  size = 40,
  anchor,
  left = 22,
  bottom = 24,
  gap = 14,
  contain = false,
  className,
}: NemesisMascotDockProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(bottom);
  const [look, setLook] = useState<{ x: number; y: number; mix: number } | null>(null);
  const targetRef = useRef<AttentionTarget>(getAttention());
  const focusedRef = useRef<Element | null>(null);

  // ── Where the dock sits ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!anchor) {
      setOffset(bottom);
      return;
    }
    const measure = () => {
      const el = document.querySelector(anchor);
      if (!el) {
        setOffset(bottom);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.height === 0) {
        setOffset(bottom);
        return;
      }
      // Measured against whatever the dock is positioned within — the window, or the
      // offset parent. Using the window's height for a contained dock puts it hundreds
      // of pixels below its own container and it simply vanishes.
      const host = hostRef.current;
      const floor =
        contain && host?.offsetParent instanceof HTMLElement
          ? host.offsetParent.getBoundingClientRect().bottom
          : window.innerHeight;
      // Clear of the composer's TOP edge, so the mascot holds its place while the
      // composer grows downward-anchored as the learner types.
      setOffset(Math.max(bottom, floor - r.top + gap));
    };
    measure();
    const timer = window.setInterval(measure, MEASURE_MS);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [anchor, bottom, gap, contain]);

  // ── What it is looking at ─────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeAttention((t) => {
      targetRef.current = t;
    });

    const onFocus = (ev: FocusEvent) => {
      const el = ev.target;
      if (!(el instanceof Element)) return;
      // A field, or anything that has opted in. Everything else the character ignores —
      // following every focus ring would make it look at the page's own chrome.
      const wanted =
        el.hasAttribute(ATTENTION_ATTR) ||
        el.matches("input, textarea, [contenteditable='true'], [role='textbox']");
      focusedRef.current = wanted ? el : null;
    };
    const onBlur = () => {
      focusedRef.current = null;
    };

    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);

    const timer = window.setInterval(() => {
      const host = hostRef.current;
      if (!host) return;
      const box = host.getBoundingClientRect();
      if (box.width === 0) return;

      const point =
        resolveAttention(targetRef.current) ??
        (focusedRef.current ? resolveAttention({ kind: "element", el: focusedRef.current }) : null);

      if (!point) {
        setLook(null);
        return;
      }
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      // Same softening the pointer gets, so an aim across the page and an aim at the
      // cursor arrive with the same weight rather than one pinning the eyes.
      const soften = (v: number) => v / Math.sqrt(1 + v * v);
      setLook({ x: soften((point.x - cx) / 320), y: soften((point.y - cy) / 320), mix: 0.92 });
    }, MEASURE_MS);

    return () => {
      unsubscribe();
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={["nemesis-mascot-dock", className].filter(Boolean).join(" ")}
      style={{ position: contain ? "absolute" : "fixed", left, bottom: offset }}
      aria-hidden="true"
    >
      {/* `track` stays on even when a target is set: the look override wins while it is
          there, and the pointer takes back over the moment it is cleared. */}
      <NemesisMascot state={state} size={size} track look={look} />
    </div>
  );
}
