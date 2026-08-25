"use client";

import { useEffect, useRef } from "react";

/**
 * The figures, as one strip that drifts by itself.
 *
 * ── IT DRIFTS, IT DOES NOT STEP ───────────────────────────────────────────────
 *
 * An earlier version held each card still for four seconds and then slid to the next.
 * The owner asked for continuous left-to-right movement instead, and for hovering to
 * SLOW it rather than stop it — so there is no dwell and no discrete slide: the strip
 * moves a little every frame and never stops while the page is visible.
 *
 * That rules out a CSS animation, which is the obvious way to build a marquee.
 * `animation-play-state` can only run or pause, and changing `animation-duration`
 * mid-flight restarts the timeline from wherever the new duration puts it, which reads
 * as a jump. Speed has to be a number that can change smoothly between frames, so the
 * loop owns it.
 *
 * ── WHAT STILL WORKS UNDERNEATH ───────────────────────────────────────────────
 *
 * The track is a real overflow container and the drift is written to `scrollLeft`, so
 * a swipe on a phone, a two-finger swipe on a trackpad and the arrow keys all still
 * move it — the scrollbar is only hidden in CSS, not disabled. A hand-scroll is not
 * fought, either: the loop re-reads the element's own position whenever it disagrees
 * with the loop's, so a swipe simply moves the strip and the drift carries on from
 * wherever the finger left it.
 *
 * ── THE SEAM ──────────────────────────────────────────────────────────────────
 *
 * The list is rendered TWICE and the position wraps by exactly one list's width. At
 * that point every card on screen is a copy sitting where the original was, so the
 * subtraction is invisible — no rewind, no jump. The copies are `aria-hidden` and
 * carry empty alt text, so the strip is still sixteen figures long to a screen reader.
 */

export interface CarouselItem {
  readonly id: string;
  readonly label: string;
  /** Basename under /nemesis/figures/, which ships a -light and a -dark file. */
  readonly file: string;
  readonly alt: string;
  readonly w: number;
  readonly h: number;
}

/** Pixels per second. Slow enough to read a figure as it passes. */
const DRIFT = 42;

/**
 * What hovering drops it to. NOT ZERO — the owner's rule is that hover slows the strip
 * rather than stopping it. Still slow enough to hold a figure in view long enough to
 * study, and the residual movement is what tells you the strip is alive rather than
 * broken.
 */
const HOVER_DRIFT = 9;

export function FigureCarousel({ items }: { items: readonly CarouselItem[] }) {
  const track = useRef<HTMLUListElement>(null);
  const speed = useRef(DRIFT);

  useEffect(() => {
    const el = track.current;
    if (!el) return;

    // 🔴 REDUCED MOTION GETS NO LOOP AT ALL, not a slower one. Someone who asked the OS
    // to stop things moving asked for exactly that; the strip stays a scroller, so every
    // figure is still reachable by hand.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let last = 0;
    // 🔴 A FLOAT ALONGSIDE `scrollLeft`, BECAUSE THE ELEMENT ROUNDS. At 42px/s a frame is
    // worth 0.7px; writing that back and re-reading it loses the fraction every time, and
    // the strip either crawls at the wrong speed or never moves at all. The float is the
    // real position and `scrollLeft` is where it gets drawn.
    let pos = el.scrollLeft;

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      if (!last) {
        last = now;
        return;
      }
      // Clamped, so returning to a backgrounded tab does not apply one enormous delta.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      // If the element and the loop disagree, a hand did it — take the hand's answer.
      if (Math.abs(el.scrollLeft - pos) > 1.5) pos = el.scrollLeft;

      // One list's width: card + gap, times the number of real cards. Measured rather
      // than assumed, because the card width is a `min()` of vw and the gap is a clamp.
      const card = el.firstElementChild as HTMLElement | null;
      if (!card) return;
      const gap = Number.parseFloat(getComputedStyle(el).columnGap || "16") || 16;
      const lap = (card.offsetWidth + gap) * items.length;

      pos += speed.current * dt;
      if (pos >= lap) pos -= lap;
      el.scrollLeft = pos;
    };

    frame = requestAnimationFrame(step);

    // A backgrounded tab throttles rAF unevenly; resetting `last` on return stops the
    // first frame back from carrying a multi-second delta.
    const onVisibility = () => {
      last = 0;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [items.length]);

  const slow = () => {
    speed.current = HOVER_DRIFT;
  };
  const normal = () => {
    speed.current = DRIFT;
  };

  return (
    <div
      className="carou"
      onMouseEnter={slow}
      onMouseLeave={normal}
      onFocusCapture={slow}
      onBlurCapture={normal}
    >
      <ul
        className="carou-track"
        ref={track}
        tabIndex={0}
        aria-label="Figures Nemesis has drawn"
        // A scroller the arrow keys drive is a listbox in everything but name; `group`
        // plus the roledescription is what tells a screen reader that moving through it
        // is expected rather than accidental.
        role="group"
        aria-roledescription="carousel"
      >
        {items.map((item, i) => (
          <Card item={item} index={i} key={item.id} total={items.length} eager={i < 2} />
        ))}
        {/* The seam copy — see the note at the top. Present so the wrap has somewhere to
            happen, hidden from assistive tech so the list is still sixteen long. */}
        {items.map((item) => (
          <Card item={item} copy key={`copy-${item.id}`} />
        ))}
      </ul>
    </div>
  );
}

function Card({
  item,
  index,
  total,
  eager = false,
  copy = false,
}: {
  item: CarouselItem;
  index?: number;
  total?: number;
  eager?: boolean;
  copy?: boolean;
}) {
  return (
    <li
      aria-hidden={copy || undefined}
      aria-label={copy ? undefined : `${(index ?? 0) + 1} of ${total}: ${item.label}`}
      className="carou-card"
      role={copy ? "presentation" : "group"}
      aria-roledescription={copy ? undefined : "slide"}
    >
      {/* <picture> because every figure ships a light and a dark file and picks between
          them on prefers-color-scheme, the convention the rest of the site uses. They
          are already WebP and already sized. */}
      <picture>
        <source
          media="(prefers-color-scheme: dark)"
          srcSet={`/nemesis/figures/${item.file}-dark.webp`}
        />
        <img
          src={`/nemesis/figures/${item.file}-light.webp`}
          alt={copy ? "" : item.alt}
          width={item.w}
          height={item.h}
          decoding="async"
          loading={eager ? "eager" : "lazy"}
        />
      </picture>
      <span className="carou-label">{item.label}</span>
    </li>
  );
}
