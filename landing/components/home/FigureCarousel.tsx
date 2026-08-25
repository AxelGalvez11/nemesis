"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The figures, as one carousel that advances on its own.
 *
 * ── WHAT DRIVES IT, AND WHAT STILL DOES NOT ───────────────────────────────────
 *
 * The owner asked for it to move by itself with no scrollbar and no arrows, so the
 * controls are gone and a timer steps it. What is NOT gone is the scroller
 * underneath: the track is still a real overflow container with `scroll-snap-type`,
 * so touch swipe, two-finger swipe and arrow keys all still work, and the timer only
 * calls `scrollBy` on top of that. Hiding a scrollbar is a paint decision; taking the
 * scrolling away with it would leave a phone with no way to look at card nine.
 *
 * ── WHY IT STEPS AND DWELLS INSTEAD OF DRIFTING ───────────────────────────────
 *
 * The obvious reading of "move on its own" is a marquee that slides continuously, and
 * it is the wrong one here. These are figures the section exists to have you LOOK at
 * — an anatomy render, a circuit, a score. Something permanently in motion is
 * something you cannot study. So a card holds still for `DWELL`, slides to the next
 * over about half a second, and holds again.
 *
 * ── THE SEAM ──────────────────────────────────────────────────────────────────
 *
 * The list is rendered TWICE. Reaching the end of a one-shot list leaves two bad
 * options: a long smooth sweep all the way back, which drags the eye across sixteen
 * cards, or an instant jump, which is a visible flinch. With the list doubled, the
 * step that lands on the first copy of card 0 is followed by a silent, unanimated
 * `scrollTo` back to the real card 0 — the same picture in the same place, so there
 * is nothing to see. The copies are `aria-hidden` and unfocusable; they exist only so
 * the wrap has somewhere to happen.
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

/** How long a figure holds still before the track moves on. */
const DWELL_MS = 4200;

export function FigureCarousel({ items }: { items: readonly CarouselItem[] }) {
  const track = useRef<HTMLUListElement>(null);
  const timer = useRef<number | null>(null);

  /** Card width plus the gap — measured, because the card width is a `min()` of vw. */
  const strideOf = useCallback((el: HTMLElement): number => {
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return el.clientWidth * 0.8;
    const gap = Number.parseFloat(getComputedStyle(el).columnGap || "16") || 16;
    return card.offsetWidth + gap;
  }, []);

  const advance = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const stride = strideOf(el);
    // One list's worth of track. Past this point every card on screen is a copy, so
    // the position can be rewound by exactly this much and look identical.
    const lap = stride * items.length;

    if (el.scrollLeft >= lap - 1) {
      el.scrollTo({ left: el.scrollLeft - lap, behavior: "auto" });
    }
    el.scrollBy({ left: stride, behavior: "smooth" });
  }, [items.length, strideOf]);

  const stop = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  }, []);

  const start = useCallback(() => {
    stop();
    timer.current = window.setInterval(advance, DWELL_MS);
  }, [advance, stop]);

  useEffect(() => {
    // 🔴 REDUCED MOTION GETS NO TIMER AT ALL, not a slower one. Someone who has asked
    // the OS to stop things moving has asked for exactly that; the track is still a
    // scroller, so the figures remain reachable by hand.
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (still?.matches) return;

    start();
    // Pausing while the page is in a background tab keeps the position honest: the
    // browser throttles the timer but not evenly, and coming back to a track that had
    // silently raced through nine cards reads as a glitch.
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [start, stop]);

  return (
    // Hovering, or tabbing in, holds whatever is on screen — the one thing a reader
    // needs when a moving strip shows them something they want to read.
    <div
      className="carou"
      onMouseEnter={stop}
      onMouseLeave={start}
      onFocusCapture={stop}
      onBlurCapture={start}
    >
      <ul
        className="carou-track"
        ref={track}
        tabIndex={0}
        aria-label="Figures Nemesis has drawn"
        // A scroller the arrow keys drive is a listbox in everything but name;
        // `group` plus the roledescription is what tells a screen reader that moving
        // through it is expected rather than accidental.
        role="group"
        aria-roledescription="carousel"
      >
        {items.map((item, i) => (
          <Card item={item} index={i} key={item.id} total={items.length} eager={i < 2} />
        ))}
        {/* The seam copy. See the note at the top: present so the wrap has somewhere
            to happen, hidden from assistive tech so the list is still sixteen long. */}
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
      {/* <picture> because every figure ships a light and a dark file and picks
          between them on prefers-color-scheme, the convention the rest of the site
          uses. They are already WebP and already sized. */}
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
