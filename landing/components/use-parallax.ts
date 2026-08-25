"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Writes a scroll progress number onto an element as the CSS variable `--p`.
 *
 * `--p` is -1 when the element's centre is one viewport BELOW the viewport centre
 * (i.e. it is rising into view), 0 when the two centres coincide, and +1 when it has
 * risen a full viewport past. CSS then decides what that means — a translate, a
 * scale, an opacity — so the motion lives in the stylesheet next to the thing it
 * moves, and this file never has an opinion about pixels.
 *
 * ── WHY A CSS VARIABLE AND NOT A TRANSFORM ────────────────────────────────────
 *
 * Writing `style.transform` here would mean this hook owns the whole transform, so
 * any static transform the element also needs — the hero organism sits deliberately
 * below centre — would be overwritten on the first scroll frame. Handing CSS a
 * scalar lets a rule compose it with whatever else that element is already doing.
 *
 * ── WHY IT IS NOT A SCROLL LISTENER PER ELEMENT ───────────────────────────────
 *
 * One listener, one rAF, all registered elements measured in the same frame. Six
 * separate scroll handlers each calling getBoundingClientRect independently is six
 * chances to force layout in a frame that has already laid out once.
 *
 * ── REDUCED MOTION ────────────────────────────────────────────────────────────
 *
 * Nothing is registered at all, and `--p` keeps whatever the stylesheet declared
 * (0). A visitor who asked for stillness gets a page whose art is placed exactly
 * where the non-scrolling design puts it, not a page that moves less.
 */

type Target = { el: HTMLElement; depth: number };

const targets = new Set<Target>();
let frame = 0;
let listening = false;

function measure() {
  frame = 0;
  const vh = window.innerHeight || 1;
  const mid = vh / 2;
  for (const t of targets) {
    const r = t.el.getBoundingClientRect();
    // Skip anything comfortably off screen: its --p cannot affect a visible pixel,
    // and a long page can hold far more registered elements than visible ones.
    if (r.bottom < -vh || r.top > vh * 2) continue;
    const centre = r.top + r.height / 2;
    const p = (mid - centre) / vh;
    t.el.style.setProperty("--p", (p * t.depth).toFixed(4));
  }
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(measure);
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
}

function unlisten() {
  if (!listening || targets.size > 0) return;
  listening = false;
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", schedule);
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
}

/**
 * @param depth How far this element moves relative to the scroll. 1 is a full
 *   viewport of travel across a full viewport of scrolling, which is far too much
 *   for anything but a deep background; 0.05–0.25 is the useful range.
 */
export function useParallax<T extends HTMLElement>(depth = 0.12): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const target: Target = { el, depth };
    targets.add(target);
    listen();
    schedule();

    return () => {
      targets.delete(target);
      el.style.removeProperty("--p");
      unlisten();
    };
  }, [depth]);

  return ref;
}
