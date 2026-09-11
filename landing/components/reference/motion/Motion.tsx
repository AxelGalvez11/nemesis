"use client";

import { createElement, Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import "./motion.css";

/**
 * Motion primitives for the landing variations, each one a behaviour measured on sanalabs.com.
 * The numbers live in motion.css with their provenance; this file only decides WHEN they play.
 */

type Nm = "armed" | "on" | undefined;
type Tag = "h1" | "h2" | "h3" | "p" | "div" | "span" | "section" | "figure" | "ul" | "li";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Arms an element only if it is still below the fold when the page hydrates, then plays it once as
 * it scrolls in.
 *
 * 🔴 ANYTHING ALREADY ON SCREEN IS LEFT AT ITS FINAL STATE. Blanking what the reader can already
 * see, only to fade it back in, is exactly the flash a reveal is supposed to hide.
 */
export function useReveal<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [nm, setNm] = useState<Nm>(undefined);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || reducedMotion()) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return;
    setNm("armed");
    // threshold 0 with a bottom inset: a ratio threshold never trips on an element taller than a
    // few screens, because it can never be that much on screen at once.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNm("on");
          io.disconnect();
        }
      },
      { threshold: 0, rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, nm };
}

function splitWords(text: string, dimFrom?: number) {
  const words = text.split(/\s+/).filter(Boolean);
  return words.map((w, i) => (
    <Fragment key={i}>
      <span
        aria-hidden="true"
        className={cx("nm-w", dimFrom !== undefined && i >= dimFrom && "nm-dimw")}
        style={{ "--w": i } as CSSProperties}
      >
        {w}
      </span>
      {i < words.length - 1 ? " " : null}
    </Fragment>
  ));
}

/** A headline that arrives word by word. `now` plays on load in pure CSS, for the hero. */
export function Words({
  text,
  as = "h1",
  now,
  dimFrom,
  className,
  style,
  id,
}: {
  text: string;
  as?: Tag;
  now?: boolean;
  /** Words from this index on take the dim ink, for a two-tone head. */
  dimFrom?: number;
  className?: string;
  style?: CSSProperties;
  id?: string;
}) {
  const { ref, nm } = useReveal<HTMLElement>();
  return createElement(
    as,
    { ref, id, style, className: cx("nm-words", className), "data-nm": now ? "now" : nm, "aria-label": text },
    splitWords(text, dimFrom),
  );
}

/** A paragraph that starts at 10% and fills in word by word as it scrolls in. */
export function TypeOn({ text, as = "p", className, style }: { text: string; as?: Tag; className?: string; style?: CSSProperties }) {
  const { ref, nm } = useReveal<HTMLElement>();
  return createElement(as, { ref, style, className: cx("nm-typeon", className), "data-nm": nm, "aria-label": text }, splitWords(text));
}

/** A block that plays one of the measured entrances when it scrolls in. */
export function Reveal({
  kind,
  as = "div",
  className,
  style,
  id,
  children,
}: {
  kind: "rise" | "tilt" | "tilt-b" | "pop" | "drop" | "draw";
  as?: Tag;
  className?: string;
  style?: CSSProperties;
  id?: string;
  children: ReactNode;
}) {
  const { ref, nm } = useReveal<HTMLElement>();
  const base = kind === "tilt-b" ? "nm-tilt nm-tilt-b" : `nm-${kind}`;
  return createElement(as, { ref, id, style, className: cx(base, className), "data-nm": nm }, children);
}

/** Cycles through `items` in place; the box eases to each item's width so the line never jumps. */
export function Rotator({ items, interval = 2600, className }: { items: ReactNode[]; interval?: number; className?: string }) {
  const [i, setI] = useState(0);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const measure = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (items.length < 2 || reducedMotion()) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % items.length), interval);
    return () => window.clearInterval(t);
  }, [items.length, interval]);
  useLayoutEffect(() => {
    if (measure.current) setWidth(measure.current.getBoundingClientRect().width);
  }, [i]);
  return (
    <span className={cx("nm-rot", className)} style={{ width }}>
      <span key={i} className="nm-rot-in">
        {items[i]}
      </span>
      <span ref={measure} className="nm-rot-measure" aria-hidden="true">
        {items[i]}
      </span>
    </span>
  );
}

/** True once the page has scrolled past `offset`, for the header's scrolled state. */
export function useScrolled(offset = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > offset);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [offset]);
  return scrolled;
}

/**
 * A grid whose cells swap one at a time: a cell fades out over 1s, takes the next item, fades back,
 * and the next cell starts 1.25s after the last. Both numbers were sampled off Sana's partner grid.
 *
 * 🔴 CELLS ARE PLAIN TEXT, NOT A RENDER FUNCTION. Pages are server components, and a function prop
 * cannot cross into a client component.
 * 🔴 AN ITEM NEVER SHOWS TWICE. The first version stepped only even cells and took the next item in
 * the list whether or not it was already on screen, and the page showed "Lecture slides" twice.
 */
export function Slots({ items, count, className, cellClassName }: { items: string[]; count: number; className?: string; cellClassName?: string }) {
  const [cells, setCells] = useState(() => items.slice(0, count));
  const [out, setOut] = useState<number | null>(null);
  const shown = useRef(cells);
  useEffect(() => {
    if (items.length <= count || reducedMotion()) return;
    // every cell takes a turn, alternating so neighbours in a row never swap back to back
    const order = Array.from({ length: count }, (_, k) => k).sort((a, b) => (a % 2) - (b % 2) || a - b);
    let step = 0;
    let next = count;
    const timers: number[] = [];
    const tick = window.setInterval(() => {
      const c = order[step % order.length];
      step += 1;
      setOut(c);
      timers.push(
        window.setTimeout(() => {
          const cur = shown.current;
          let k = next;
          for (let guard = 0; guard < items.length && cur.includes(items[k % items.length]); guard += 1) k += 1;
          next = k + 1;
          const updated = cur.map((v, j) => (j === c ? items[k % items.length] : v));
          shown.current = updated;
          setCells(updated);
          setOut(null);
        }, 1000),
      );
    }, 1250);
    return () => {
      window.clearInterval(tick);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [items, count]);
  return (
    <div className={className}>
      {cells.map((item, k) => (
        <div key={k} className={cx("nm-slot", cellClassName, out === k && "nm-out")}>
          {item}
        </div>
      ))}
    </div>
  );
}
