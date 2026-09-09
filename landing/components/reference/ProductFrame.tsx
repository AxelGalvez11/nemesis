"use client";

import { useEffect, useRef, useState } from "react";

import { CYCLE_SECONDS } from "@/components/showcase/session/script";
import { SessionCanvas } from "@/components/showcase/session/SessionCanvas";

/**
 * The product frame: the real session surface, running, inside a window.
 *
 * 🔴🔴 THIS DRIVES `SessionCanvas` DIRECTLY RATHER THAN REUSING `CanvasShowcase`, AND THE FIRST
 * ATTEMPT GOT THAT WRONG. `CanvasShowcase` is a whole landing SECTION: it brings its own heading
 * ("One Canvas. Whatever learning requires."), its own caption and its own vertical padding.
 * Wrapping it in a product frame therefore nested a section inside a window, which put a marketing
 * headline INSIDE the app screenshot and left roughly 270px of dead space above and below the
 * canvas. Measured before the fix: a 1232x833 frame holding a 1230x781 section whose actual canvas
 * was only 1174x514.
 *
 * 🔴 THE FRAME IS A PICTURE OF THE APP, so it carries no marketing copy of its own. Everything the
 * page wants to SAY lives outside the frame, in the section around it. Measured on x.ai/bot: their
 * 976x660 frame contains product UI and nothing else.
 *
 * 🔴 IT PAUSES OFF SCREEN. A continuously running rAF loop on a landing page burns battery for a
 * frame nobody is looking at, and `prefers-reduced-motion` freezes it at a composed first frame
 * rather than stopping mid-gesture.
 */
export function ProductFrame() {
  const [t, setT] = useState(0.06);
  const [reduced, setReduced] = useState(false);
  const host = useRef<HTMLDivElement | null>(null);
  const onScreen = useRef(true);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        onScreen.current = entries[0]?.isIntersecting ?? true;
      },
      { rootMargin: "10% 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let origin: number | null = null;
    let pausedAt: number | null = null;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const seconds = now / 1000;
      if (origin === null) origin = seconds;
      if (!onScreen.current) {
        if (pausedAt === null) pausedAt = seconds;
        return;
      }
      if (pausedAt !== null) {
        origin += seconds - pausedAt;
        pausedAt = null;
      }
      setT(((seconds - origin) % CYCLE_SECONDS) / CYCLE_SECONDS);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div className="ref-frame" ref={host}>
      <div className="ref-frame-inner">
        <SessionCanvas reduced={reduced} t={t} />
      </div>
    </div>
  );
}
