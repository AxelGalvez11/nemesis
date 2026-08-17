"use client";

import { useEffect, useRef, useState } from "react";

import { CYCLE_SECONDS, sessionState } from "./session/script";
import { SessionCanvas } from "./session/SessionCanvas";

/**
 * The product showcase: one Canvas, running a learning session.
 *
 * ── WHAT THIS USED TO BE, AND WHY IT CHANGED ──────────────────────────────────
 *
 * Six scenes on a nine-second rotation — a diagram, a heart, a plot, a
 * substitution, an energy profile, an equilibrium. Every one of them well drawn,
 * and together they made the wrong argument: "here are six things Nemesis can
 * render." The owner's words were that it should feel like watching a real
 * session rather than a feature reel, and that it had noticeable dead time.
 *
 * Both were true and the dead time was structural. Each scene finished its
 * choreography at 78% of its band and then HELD, still, for the remaining 22% —
 * about two seconds. Between scenes, `bands()` drove both neighbours to zero on
 * purpose so that two representations could never be superimposed, which left the
 * frame containing nothing but a small mark for another second and a half. Three
 * and a half seconds of stillness in every nine.
 *
 * What runs now is a single continuous session: Nemesis teaches with a figure
 * that illustrates the actual claim, the learner presses Continue, Nemesis asks
 * about what it just taught, the learner answers through the composer, Nemesis
 * thinks and then evaluates and refines, and it moves into the next concept
 * without stopping. Three acts — biology, mathematics, chemistry — so the Canvas
 * is seen BECOMING what each subject needs rather than being described as able to.
 *
 * ── THE CLOCK ─────────────────────────────────────────────────────────────────
 *
 * READ FROM WALL TIME, not accumulated per frame. Any environment that throttles
 * requestAnimationFrame — a background tab, a loaded machine, an embedded webview
 * — delivers fewer frames, and summing deltas would make a nine-second beat take
 * however long the frame budget allowed. Wall time makes the pacing real
 * regardless of how often we are called. `origin` moves forward by exactly the
 * paused duration on resume, so a hold freezes the frame instead of letting the
 * session run on invisibly and jump when it comes back.
 */

/** Held while the reader is genuinely manipulating something. */
const RESUME_AFTER = 2.5;

/**
 * `?seek=0.42` freezes the session at one point in its cycle.
 *
 * 🔴 THIS IS A TESTABILITY AFFORDANCE, NOT DEBUG CODE LEFT IN. The owner's first
 * acceptance criterion is that there is no perceptible dead pause, and that
 * cannot be established by watching: this animation is verified by stepping the
 * clock in small increments and diffing what is on screen between steps, so an
 * interval where nothing changes is reported as a number rather than as an
 * impression. Without a seek the only way in is to sit through a 53-second loop
 * one delivered frame at a time. It costs one URL read and it changes nothing for
 * a visitor who does not pass the parameter.
 */
function readSeek(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("seek");
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? ((value % 1) + 1) % 1 : null;
}

export function CanvasShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [seek, setSeek] = useState<number | null>(null);

  const onScreen = useRef(false);
  const lastInteract = useRef(-Infinity);

  useEffect(() => {
    setReduced(!!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setSeek(readSeek());
  }, []);

  useEffect(() => {
    if (reduced || seek !== null) return;

    let raf = 0;
    let origin = performance.now() / 1000;
    let pausedAt: number | null = null;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const t = now / 1000;

      const held = !onScreen.current || t - lastInteract.current < RESUME_AFTER;
      if (held) {
        if (pausedAt === null) pausedAt = t;
        return;
      }
      if (pausedAt !== null) {
        origin += t - pausedAt;
        pausedAt = null;
      }

      setProgress(((t - origin) % CYCLE_SECONDS) / CYCLE_SECONDS);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced, seek]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        onScreen.current = e.isIntersecting;
      },
      { rootMargin: "10% 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const note = () => {
    lastInteract.current = performance.now() / 1000;
  };

  /**
   * Under reduced motion the session holds on a fully-taught first concept —
   * passage drawn, figure finished, composer present. Not blank and not cycling:
   * someone who asked the system to stop moving things should still be able to
   * see what a Nemesis session looks like.
   */
  const p = seek ?? (reduced ? 2.4 / (CYCLE_SECONDS) : progress);

  return (
    <section className="shw" id="canvas" ref={sectionRef}>
      <div className="wrap-wide shw-inner">
        <h2 className="shw-head">One Canvas. Whatever learning requires.</h2>

        {/* The frame is the argument: one hairline, a fixed ratio, and it does not
            move for the whole session. What changes is what is happening inside
            it. Only `onPointerDown` holds the clock — a pointer merely crossing
            the frame is not an instruction to stop. */}
        <div className="shw-canvas" onPointerDown={note}>
          <SessionCanvas reduced={reduced} t={p} />
        </div>

        <p className="shw-line">Biology. Mathematics. Chemistry. One surface.</p>
      </div>
    </section>
  );
}

/** Re-exported so a test or a harness can assert against the same state the UI draws. */
export { sessionState };
