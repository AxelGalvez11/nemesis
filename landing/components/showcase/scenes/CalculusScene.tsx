"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { ease, window01 } from "../progress";

/**
 * Scene 4 — the same reasoning, in symbols.
 *
 * The plot above showed a limit happening. This shows the notation doing the
 * same kind of work, on a substitution: spot the inner function, name it, spot
 * its derivative sitting in the integrand, and the integral collapses.
 *
 * ── THE PIECES MOVE, THEY DO NOT CROSS-FADE ───────────────────────────────────
 *
 * When u is defined, the definition does not simply appear underneath. It
 * starts at the exact position of the highlighted (x²+1) inside the integral
 * and travels to its own line. Same for du and 2x dx. That is the entire point
 * of the step — this expression *is* that one, renamed — and a fade between two
 * blocks of text says only that one block replaced another.
 *
 * The offsets are measured rather than guessed. Both elements are in the DOM at
 * once, so the delta between their boxes is a subtraction; hard-coding an em
 * offset would drift the moment the font, the width or the zoom changed.
 *
 * ── WHY THE ANSWER GOES BACK TO x ─────────────────────────────────────────────
 *
 * The sequence ends on (x²+1)⁴/4 + C, not on u⁴/4 + C. Stopping at u would be
 * shorter and would look finished, and it would be wrong: the question was
 * asked in x. On a landing page for something that claims to teach, the worked
 * example has to actually be correct.
 */

/**
 * `trust: true` enables \htmlClass, which is how the substituted terms get
 * tagged so they can be highlighted and measured.
 *
 * On the injection question: every string passed to this renderer is a
 * module-level constant a few lines below. Nothing here is user input, nothing
 * is fetched, and nothing is interpolated — so there is no untrusted path into
 * the markup, and a sanitiser would only be scrubbing output KaTeX generated
 * from our own literals. If this ever renders an expression that came from a
 * learner, a document or a model, `trust` must go off and the output must be
 * sanitised, because \htmlClass and \href are exactly the escape hatches an
 * injected expression would reach for.
 */
const OPTS = { throwOnError: false, trust: true, strict: false as const, displayMode: true };

function tex(source: string): { __html: string } {
  return { __html: katex.renderToString(source, OPTS) };
}

/** The integrand, with the two parts the substitution acts on tagged. */
const INTEGRAL = String.raw`\int \htmlClass{ct-dx}{2x} \htmlClass{ct-u}{(x^2+1)}^3 \, \htmlClass{ct-dx2}{dx}`;
const INTEGRAL_U = String.raw`\int u^3 \, du`;
const DEF_U = String.raw`u = x^2 + 1`;
const DEF_DU = String.raw`du = 2x \, dx`;
const RESULT_U = String.raw`\frac{u^4}{4} + C`;
const RESULT_X = String.raw`\frac{(x^2+1)^4}{4} + C`;

type Delta = { dx: number; dy: number };
const ZERO: Delta = { dx: 0, dy: 0 };

export function CalculusScene({ t }: { readonly t: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const defURef = useRef<HTMLDivElement>(null);
  const defDuRef = useRef<HTMLDivElement>(null);
  const [deltaU, setDeltaU] = useState<Delta>(ZERO);
  const [deltaDu, setDeltaDu] = useState<Delta>(ZERO);

  /**
   * Measure how far each definition sits from the term it comes from.
   *
   * Layout effect, not effect: this runs before paint, so the first frame
   * already has the right offsets and nothing is seen jumping into place.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const measure = () => {
      const from = (sel: string, el: HTMLElement | null): Delta => {
        const src = root.querySelector(sel);
        if (!src || !el) return ZERO;
        const a = src.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        if (!a.width || !b.width) return ZERO;
        return { dx: a.left + a.width / 2 - (b.left + b.width / 2), dy: a.top - b.top };
      };
      setDeltaU(from(".ct-u", defURef.current));
      setDeltaDu(from(".ct-dx", defDuRef.current));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  const intIn = ease(window01(t, 0, 0.1));
  const hlU = window01(t, 0.12, 0.2) * (1 - window01(t, 0.56, 0.66));
  const flyU = ease(window01(t, 0.2, 0.36));
  const hlDx = window01(t, 0.36, 0.44) * (1 - window01(t, 0.56, 0.66));
  const flyDu = ease(window01(t, 0.44, 0.58));
  const swap = ease(window01(t, 0.6, 0.72));
  const resU = ease(window01(t, 0.74, 0.84));
  const resX = ease(window01(t, 0.87, 0.97));

  return (
    <div className="shw-calc" ref={rootRef} data-hl-u={hlU > 0.5 ? "" : undefined} data-hl-dx={hlDx > 0.5 ? "" : undefined}>
      <div className="shw-calc-stack">
        <div className="shw-calc-int" style={{ opacity: intIn * (1 - swap) }} dangerouslySetInnerHTML={tex(INTEGRAL)} />
        <div className="shw-calc-int shw-calc-int-u" style={{ opacity: swap }} dangerouslySetInnerHTML={tex(INTEGRAL_U)} />
      </div>

      <div className="shw-calc-defs">
        <div
          className="shw-calc-def"
          ref={defURef}
          style={{
            opacity: flyU,
            transform: `translate(${deltaU.dx * (1 - flyU)}px, ${deltaU.dy * (1 - flyU)}px)`,
          }}
          dangerouslySetInnerHTML={tex(DEF_U)}
        />
        <div
          className="shw-calc-def"
          ref={defDuRef}
          style={{
            opacity: flyDu,
            transform: `translate(${deltaDu.dx * (1 - flyDu)}px, ${deltaDu.dy * (1 - flyDu)}px)`,
          }}
          dangerouslySetInnerHTML={tex(DEF_DU)}
        />
      </div>

      <div className="shw-calc-stack shw-calc-result">
        <div style={{ opacity: resU * (1 - resX) }} dangerouslySetInnerHTML={tex(RESULT_U)} />
        <div className="shw-calc-final" style={{ opacity: resX }} dangerouslySetInnerHTML={tex(RESULT_X)} />
      </div>
    </div>
  );
}
