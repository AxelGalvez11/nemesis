"use client";

// The character, parked on a working surface — and the walk to the middle and back.
//
// WHERE IT SITS AND WHY. Lower left, above the composer. Lower left because the composer
// is the thing the learner keeps returning to and the character should be beside it
// rather than over it; above rather than beside because the composer grows as you type,
// and anything sharing its row gets shoved around. The dock measures the composer and
// floats clear of its top edge, so it holds its place while the composer changes height.
//
// 🔴 IT IS NEVER PART OF LAYOUT. Fixed or absolute, `pointer-events: none`, nothing
// reserves space for it. A decorative character that reflows the page it is sitting on,
// or eats a click meant for the composer behind it, is worse than no character.
//
// 🔴 AND THE JOURNEY IS A TRANSFORM. The dock's own `left`/`bottom` never move; only a
// composited transform carries it. Animating the offsets would lay the page out again on
// every frame of a 680ms trip across the surface, which is the easiest way for something
// decorative to make a real interface feel slow.

import { useEffect, useRef, useState } from "react";

import { useTheme } from "@/components/theme-provider";
import {
  ATTENTION_ATTR,
  getAttention,
  resolveAttention,
  subscribeAttention,
  type AttentionTarget,
} from "@/lib/mascot/attention";
import type { StateId } from "@/lib/bloub/states";

import { BloubBot } from "./bloub-bot";
import { usePoke } from "./use-poke";
import { speedOf, stationOf } from "@/lib/character/stations";

/** How often the anchor and the attention target are re-measured. */
const MEASURE_MS = 120;

export interface BloubDockProps {
  /** Which animation is playing. Its station decides corner or centre. */
  state?: StateId;
  /** A mark above the character's head: "!" when something went wrong, "?" when it needs something
   *  from the learner. Absent on nearly every render — a mascot that is always signalling is a
   *  mascot nobody looks at. */
  marker?: "!" | "?" | null;
  /** Rendered size in px. The viewBox is square. */
  size?: number;
  /**
   * Selector for the element to float above — the composer. While it resolves, the dock
   * tracks its top edge; when it does not, the dock falls back to `bottom`.
   */
  anchor?: string;
  /**
   * Distance from the left edge, px — used only when the anchor cannot be measured.
   *
   * 🔴 NORMALLY THE ANCHOR DECIDES, NOT THIS (owner 2026-08-20: "can we have the blob be just
   * above the chat composer on the left side"). The composer is a centred column on a wide page,
   * so a character pinned to the PAGE's lower-left sat hundreds of pixels away from it, in an
   * empty corner. It now lines up with the composer's own left edge and travels with it.
   */
  left?: number;
  /** Distance from the bottom when there is no anchor, px. */
  bottom?: number;
  /** Gap left above the anchor, px. */
  gap?: number;
  /**
   * How much bigger it gets when it takes the middle.
   *
   * It has to grow, not merely travel: at dock size it is a marker in the corner, and
   * the whole point of the middle is that it is the thing happening while there is
   * nothing else to look at yet.
   */
  centreScale?: number;
  /**
   * Sit inside the nearest positioned ancestor rather than the window.
   *
   * On almost every surface this wants to be on: the workspace has a rail down the left,
   * and a character pinned to the WINDOW's lower-left corner lands inside it.
   */
  contain?: boolean;
  /**
   * Take the character off this surface entirely.
   *
   * 🔴🔴 IT EXISTS BECAUSE ONE SURFACE NOW DRAWS ITS OWN (owner 2026-08-21: *"when thinking, the
   * mascot should be on top of the three dots"*). The dock's `thinking` animation IS the three dots
   * — the body morphs into the middle one — so a blob standing above a row of dots is a composition
   * the animation cannot express, and `CanvasThinkingPreview` builds it out of a resting character
   * and three dots of its own.
   *
   * 🔴 WHICH MAKES THIS THE GUARD AGAINST SIX DOTS, AGAIN. That defect was two MOUNTS of one
   * renderer on one surface, both centred, both playing `thinking`. The rule "the dock owns the
   * character" is what fixed it, so a surface that draws its own has to switch the dock off rather
   * than hope the two never overlap.
   */
  hidden?: boolean;
  className?: string;
}

export function BloubDock({
  marker = null,
  state = "idle",
  size = 52,
  anchor,
  left = 22,
  bottom = 24,
  gap = 14,
  centreScale = 2.1,
  contain = false,
  hidden = false,
  className,
}: BloubDockProps) {
  const { accent } = useTheme();
  // Clicking it draws a reaction, and a busy state cancels one mid-gesture.
  const { state: shown, poke } = usePoke(state);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(bottom);
  const [inset, setInset] = useState(left);
  const [travel, setTravel] = useState({ dx: 0, dy: 0, k: 1 });
  const [aimAt, setAimAt] = useState<{ x: number; y: number } | null>(null);
  const targetRef = useRef<AttentionTarget>(getAttention());
  const focusedRef = useRef<Element | null>(null);

  // ── Where the dock sits ──────────────────────────────────────────────────────
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
        setInset(left);
        return;
      }
      // Measured against whatever the dock is positioned within. Using the window's
      // height for a contained dock puts it hundreds of pixels below its own container,
      // where it simply vanishes.
      const host = hostRef.current;
      const floor =
        contain && host?.offsetParent instanceof HTMLElement
          ? host.offsetParent.getBoundingClientRect().bottom
          : window.innerHeight;
      setOffset(Math.max(bottom, floor - r.top + gap));
      // Lined up with the composer's left edge, in the same coordinate space the dock is
      // positioned in. `left` survives only as the fallback for a composer that is not there.
      const originX =
        contain && host?.offsetParent instanceof HTMLElement
          ? host.offsetParent.getBoundingClientRect().left
          : 0;
      setInset(Math.max(8, r.left - originX));
    };
    measure();
    const timer = window.setInterval(measure, MEASURE_MS);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [anchor, bottom, gap, contain, left]);

  // ── Where it stands ──────────────────────────────────────────────────────────
  const station = stationOf(shown);
  useEffect(() => {
    const measure = () => {
      const host = hostRef.current;
      if (!host) return;
      if (station === "corner") {
        setTravel({ dx: 0, dy: 0, k: 1 });
        return;
      }
      const parent =
        (contain && host.offsetParent instanceof HTMLElement ? host.offsetParent : null) ??
        document.documentElement;
      const pr = parent.getBoundingClientRect();
      // The UNTRANSFORMED corner, computed rather than measured: reading the host's own
      // rect would already include the transform, and the two would chase each other
      // every 120ms until the character drifted off the screen.
      const cornerX = pr.left + inset + size / 2;
      const cornerY = pr.bottom - offset - size / 2;
      // Optically above the middle. A form parked on the exact centre of a page reads as
      // sitting low, because the eye weights the top of a column more heavily.
      setTravel({
        dx: pr.left + pr.width / 2 - cornerX,
        dy: pr.top + pr.height * 0.42 - cornerY,
        k: centreScale,
      });
    };
    measure();
    const timer = window.setInterval(measure, MEASURE_MS);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [station, contain, inset, offset, size, centreScale]);

  // ── What it is looking at ────────────────────────────────────────────────────
  //
  // In order of precedence: whatever `lookAt()` was last given, then the focused field,
  // then — by falling through to null — the pointer, which BloubBot handles itself.
  useEffect(() => {
    const unsubscribe = subscribeAttention((t) => {
      targetRef.current = t;
    });

    const onFocus = (ev: FocusEvent) => {
      const el = ev.target;
      if (!(el instanceof Element)) return;
      // A field, or anything that opted in. Following every focus ring would make the
      // character stare at the page's own chrome.
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
      const point =
        resolveAttention(targetRef.current) ??
        (focusedRef.current ? resolveAttention({ kind: "element", el: focusedRef.current }) : null);
      setAimAt(point);
    }, MEASURE_MS);

    return () => {
      unsubscribe();
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      window.clearInterval(timer);
    };
  }, []);

  // 🔴 AFTER EVERY HOOK, NEVER BEFORE ONE. An early return above the effects would change the hook
  // count between renders the moment `hidden` flips, which React treats as a different component.
  if (hidden) return null;

  return (
    <div
      ref={hostRef}
      className={["bloub-dock", className].filter(Boolean).join(" ")}
      style={{
        position: contain ? "absolute" : "fixed",
        left: inset,
        bottom: offset,
        transform: `translate3d(${travel.dx}px, ${travel.dy}px, 0) scale(${travel.k})`,
      }}
      aria-hidden="true"
    >
      <BloubBot
        aimAt={aimAt}
        color={accent}
        onPoke={poke}
        size={size}
        speed={speedOf(shown)}
        state={shown}
        track
      />
      {/* 🔴 A MARK ABOVE THE HEAD, NOT A BODY STATE — owner's own wording, 2026-08-20: *"the mascot
          should have an exclamation mark or question mark appear above its head for those kinds of
          things."* The engine ships `exclaim` and `alert` poses that deform the character itself,
          and the owner was asked and chose neither: the character stays itself and something
          appears near it, which is how a mascot has always signalled.

          🔴 ADDITIVE, AND DELIBERATELY OUTSIDE THE ENGINE. `lib/bloub/*` is vendored whole and not
          edited (see bloub-bot.tsx), and the animation loop writes SVG attributes every frame — a
          glyph pushed through it would be a fourth thing to keep in sync at 60fps for no gain.
          This is a sibling that inherits the dock's own transform, so it travels with the character
          without the character knowing about it. */}
      {marker && (
        <span
          aria-hidden="true"
          className="bloub-marker pointer-events-none absolute left-1/2 bottom-full mb-1 -translate-x-1/2 select-none text-[13px] font-semibold leading-none text-(--ui-text-tertiary)"
        >
          {marker}
        </span>
      )}
    </div>
  );
}
