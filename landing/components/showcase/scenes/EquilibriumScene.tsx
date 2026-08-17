"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { ease, window01 } from "../progress";

/**
 * Scene 6 — the same idea about catalysts, in symbols.
 *
 * The profile above showed a barrier drop while the endpoints held. This says why
 * that means the yield does not change, and it is the argument the picture cannot
 * make on its own: the equilibrium constant is the ratio of the two rate
 * constants, a catalyst multiplies BOTH by the same factor, and the factor
 * cancels.
 *
 * ── IT HAS TO BE CORRECT, NOT JUST SUGGESTIVE ─────────────────────────────────
 *
 * The common wrong version of this scene would show only the forward rate
 * speeding up, which would imply more product and teach the exact misconception
 * the pair exists to remove. A catalyst lowers one barrier, and that one barrier
 * is on the path in both directions — so both constants rise by the same factor.
 * That is the whole reason K survives, and it is why the cancellation is drawn
 * out rather than asserted.
 *
 * ── WHY IT REUSES THE CALCULUS SCENE'S CLASSES ────────────────────────────────
 *
 * `shw-calc` and friends size KaTeX inside the frame and nothing more; they carry
 * no calculus-specific meaning. A parallel set of `shw-eq-*` rules would be the
 * same declarations under different names, and the two symbolic scenes drifting
 * apart visually is a real risk while duplicated CSS is the usual way it happens.
 */

/** See CalculusScene for the note on `trust`. Every string here is a literal. */
const OPTS = { throwOnError: false, trust: true, strict: false as const, displayMode: true };

function tex(source: string): { __html: string } {
  return { __html: katex.renderToString(source, OPTS) };
}

const REACTION = String.raw`\mathrm{N_2} + 3\,\mathrm{H_2} \rightleftharpoons 2\,\mathrm{NH_3}`;
const K_DEF = String.raw`K = \frac{k_{f}}{k_{r}}`;
const FORWARD = String.raw`k_f \longrightarrow c\,k_f`;
const REVERSE = String.raw`k_r \longrightarrow c\,k_r`;
const K_CANCEL = String.raw`K = \frac{c\,k_{f}}{c\,k_{r}}`;
const K_SAME = String.raw`K = \frac{k_{f}}{k_{r}}\quad\text{unchanged}`;

export function EquilibriumScene({ t }: { readonly t: number }) {
  const reaction = ease(window01(t, 0, 0.12));
  const kDef = ease(window01(t, 0.16, 0.28));
  // Both rate constants are multiplied, and they arrive together on purpose:
  // showing the forward one first, alone, is the misconception.
  const both = ease(window01(t, 0.34, 0.5));
  const cancel = ease(window01(t, 0.56, 0.7));
  const same = ease(window01(t, 0.8, 0.92));

  return (
    <div className="shw-calc">
      <div className="shw-calc-int" style={{ opacity: reaction }} dangerouslySetInnerHTML={tex(REACTION)} />

      <div className="shw-calc-stack">
        <div style={{ opacity: kDef * (1 - cancel) }} dangerouslySetInnerHTML={tex(K_DEF)} />
        <div style={{ opacity: cancel * (1 - same) }} dangerouslySetInnerHTML={tex(K_CANCEL)} />
        <div className="shw-calc-final" style={{ opacity: same }} dangerouslySetInnerHTML={tex(K_SAME)} />
      </div>

      <div className="shw-calc-defs" style={{ opacity: both * (1 - same) }}>
        <div className="shw-calc-def" dangerouslySetInnerHTML={tex(FORWARD)} />
        <div className="shw-calc-def" dangerouslySetInnerHTML={tex(REVERSE)} />
      </div>
    </div>
  );
}
