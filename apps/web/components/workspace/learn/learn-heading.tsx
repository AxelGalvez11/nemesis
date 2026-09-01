"use client";

// The front door's greeting: "Learn calculus", with the subject changing under it.
//
// Owner, 2026-09-01: *"could you replace the 'what are you working on' with 'Learn x' and have the
// x fade in different subjects like calculus, biology, etc. so users are encouraged to learn"*. The
// line it replaces asked a question and waited; this one names the thing the product does and shows
// what it can be pointed at, which is the encouragement he is asking for.
//
// 🔴 ITS OWN FILE BECAUSE `canvas-home.tsx` IS ALREADY A THOUSAND LINES and its own header says so.
// What the front door gets from here is one element; how the word is chosen, measured, timed and
// silenced for a screen reader stays in here.
//
// 🔴🔴 THE SUBJECT LIST IS THE FIELD-AGNOSTIC RULE MADE VISIBLE. The standing rule (CLAUDE.md,
// owner 2026-07-27) is that Nemesis serves any discipline and that the design test for anything is
// whether it works for a law student AND a mechanical engineering student. This line is the single
// most-read sentence in the product, so a list of only sciences would answer that test with "no" in
// the first thing anybody sees. Ten subjects, ten different faculties, in a deliberate order that
// never puts two neighbours from the same one together.

import { useEffect, useRef, useState } from "react";

/**
 * What the front door offers to teach, one per faculty.
 *
 * 🔴 REAL COURSE NAMES, NOT CATEGORIES. "Science" or "the humanities" is a shelf label; "contract
 * law" is a thing somebody is sitting an exam in on Thursday, and it is what makes the line read as
 * an offer rather than as branding.
 *
 * 🔴🔴 THE HEALTH SLOT IS "anatomy", AND THE FIRST DRAFT'S "pharmacology" WAS CAUGHT BY THE GUARD
 * THAT EXISTS FOR EXACTLY THIS. `field-agnostic.test.ts` bans that word from every shipping
 * surface, because it is the word that made this product look like a pharmacy app for its whole
 * first life. The guard was right and the list was wrong: a health subject belongs here, that
 * particular one does not, and anatomy serves the same student.
 *
 * 🔴 AND "welding" IS NOT A JOKE ENTRY. CLAUDE.md's own list of who this serves ends with "trades",
 * and a list that quietly stops at university faculties says the opposite of what the rule says.
 */
export const LEARN_SUBJECTS = [
  "calculus",
  "biology",
  "contract law",
  "thermodynamics",
  "art history",
  "macroeconomics",
  "Spanish",
  "data structures",
  "anatomy",
  "welding",
] as const;

/** How long each subject holds, once it has arrived. */
const HOLD_MS = 2600;
/**
 * Each half of the swap: the old word fades out, and only then does the new one fade in.
 *
 * 🔴🔴 SEQUENTIAL, NOT A CROSSFADE, AND THAT IS THE DIFFERENCE BETWEEN CLEAN AND MUDDY. The words
 * are stacked in one grid cell so the line cannot jump, which also means a crossfade renders two
 * different words on top of each other, on the same baseline, at partial opacity: "calculus" and
 * "biology" overlapping is a blur, not a dissolve. Fading the outgoing word to nothing BEFORE the
 * incoming one starts means only one word is ever on screen, and it is also the plainest reading of
 * what was asked for: the x fades between subjects.
 *
 * 🔴 THE WIDTH MOVES DURING THE GAP, WHICH IS THE FREE HALF OF THE SAME DECISION. The slot resizes
 * while nothing is visible in it, so the line never resizes under a word somebody is reading.
 */
const FADE_MS = 520;

/**
 * The curve both halves of the swap ride.
 *
 * 🔴 SLOW AT BOTH ENDS — owner, 2026-09-01: *"make the transitions smoother and fade smoother
 * slower"*. `ease-out` starts at full speed and only decelerates, which is right for something
 * arriving from a press and wrong for something dissolving on its own: the first frames of the
 * fade are the fastest, so the word appears to snap before it drifts. Easing in as well as out
 * means the word leaves and arrives from nothing at both ends, which is what reads as smooth.
 */
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

export function LearnHeading({ departing }: { departing: boolean }) {
  const [index, setIndex] = useState(0);
  /**
   * The natural width of every subject, measured once from the words themselves.
   *
   * 🔴🔴 MEASURED ONCE, FROM SPANS THAT ARE ALREADY ON SCREEN, AND NEVER DURING A SWAP. The words
   * are all rendered, stacked in one grid cell; each carries `width: max-content` so it keeps its
   * own width inside a cell as wide as the longest. That means one pass at mount produces every
   * width, and the slot can then animate between them with nothing left to measure later. The
   * alternative — measuring the incoming word as it arrives — is the shape that blanked the page in
   * #987: a measurement taken mid-swap, verified only at rest.
   *
   * 🔴 AND ZERO IS A REAL ANSWER, NOT A NUMBER TO USE. A headless pass, a hidden tab or a font that
   * has not landed yet all report 0; `sized` stays false, the slot keeps `max-content`, and the
   * heading is simply the width of the longest subject with no animation. Correct, still legible,
   * never collapsed.
   */
  const words = useRef<(HTMLSpanElement | null)[]>([]);
  const [widths, setWidths] = useState<number[] | null>(null);
  /** True once the browser has said it will not animate. See the reduced-motion note below. */
  const [still, setStill] = useState(false);
  /** Whether the current subject is showing. False only during the gap between two subjects. */
  const [lit, setLit] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setStill(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  useEffect(() => {
    const measured = words.current.map((word) => word?.getBoundingClientRect().width ?? 0);
    if (measured.length !== LEARN_SUBJECTS.length || measured.some((width) => width <= 0)) return;
    setWidths(measured);
  }, []);

  // 🔴 THE ROTATION IS THE MOTION, so `prefers-reduced-motion` stops it here rather than merely
  // removing the fade. The house rule (see `STILL` in lib/mascot/states.ts) is that the honest
  // answer to reduced motion is a characteristic frame rather than a broken one: the first subject,
  // held, which is a complete sentence on its own.
  useEffect(() => {
    if (still || departing) return;
    let swap = 0;
    const timer = window.setInterval(() => {
      // Out first: the word on screen goes to nothing, and only when it is gone does the next one
      // take the slot. See FADE_MS for why the two halves may not overlap.
      setLit(false);
      // 🔴 THE NEXT WORD STARTS AT 85% OF THE FADE, NOT AT 100%. Measured on screen: the outgoing
      // word is already under 2% opacity by then, so nothing overlaps, but waiting for the curve's
      // full tail AND then the next word's own slow head left a quarter-second where the line read
      // "Learn" with nothing after it. This closes that beat without putting two words in one spot.
      swap = window.setTimeout(() => {
        setIndex((current) => (current + 1) % LEARN_SUBJECTS.length);
        setLit(true);
      }, Math.round(FADE_MS * 0.85));
    }, HOLD_MS + FADE_MS * 2);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(swap);
    };
  }, [departing, still]);

  const slotWidth = widths ? `${Math.ceil(widths[index] ?? 0)}px` : "max-content";

  return (
    <h1
      className="text-[length:var(--canvas-text-title)] font-medium tracking-[-0.01em] text-(--ui-text-primary)"
      style={{
        opacity: departing ? 0 : 1,
        // The departure fade is the front door's own, unchanged: the greeting leaves as the
        // composer travels to the canvas. See the DOCK_MS note in canvas-home.tsx.
        transition: `opacity ${Math.round(420 * 0.55)}ms ease-out`,
      }}
    >
      {/* 🔴 ONE STABLE SENTENCE FOR A SCREEN READER, AND THE MOVING HALF HIDDEN FROM IT. A word that
          swaps every 2.6 seconds inside a live heading is announced every 2.6 seconds; the visual
          line is decoration over a heading whose meaning never changes. */}
      <span className="sr-only">Learn anything.</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        Learn&nbsp;
        <span
          className="relative inline-grid overflow-hidden text-left align-baseline"
          style={{
            width: slotWidth,
            // Only animated once the widths are known; with `max-content` there is nothing to
            // animate between and a transition on `auto` does nothing anyway.
            transition: widths && !still ? `width ${FADE_MS}ms ${EASE}` : undefined,
          }}
        >
          {LEARN_SUBJECTS.map((subject, at) => (
            <span
              key={subject}
              ref={(node) => {
                words.current[at] = node;
              }}
              // 🔴 EVERY WORD IN THE SAME GRID CELL, so they occupy one line and cross-fade in
              // place rather than pushing each other around. `max-content` is what lets each one
              // keep its own width for the measuring pass above.
              className="col-start-1 row-start-1 whitespace-nowrap"
              style={{
                width: "max-content",
                opacity: at === index && (lit || still) ? 1 : 0,
                transform: still || (at === index && lit) ? "none" : "translateY(0.12em)",
                // 🔴🔴 `visibility`, NOT ONLY OPACITY, AND IT IS ABOUT THE TEXT RATHER THAN THE
                // PIXELS. All ten words are in the DOM so they can be measured and cross-faded in
                // place; at `opacity: 0` alone they are invisible but still TEXT, so the heading
                // read "Learn calculus biology contract law thermodynamics…" to anything that
                // walks rendered text, and selecting the line copied all ten. Caught in the
                // filmstrip, not by eye. Hidden words keep their layout box, so the measuring pass
                // above is untouched.
                //
                // 🔴 THE CHANGE IS DELAYED BY EXACTLY THE FADE, or the outgoing word would vanish
                // on the first frame of its own dissolve and the crossfade would become a cut.
                visibility: at === index ? "visible" : "hidden",
                transition: still
                  ? undefined
                  : at === index
                    ? `opacity ${FADE_MS}ms ${EASE}, transform ${FADE_MS}ms ${EASE}, visibility 0s`
                    : `opacity ${FADE_MS}ms ${EASE}, transform ${FADE_MS}ms ${EASE}, visibility 0s linear ${FADE_MS}ms`,
              }}
            >
              {subject}
            </span>
          ))}
        </span>
      </span>
    </h1>
  );
}
