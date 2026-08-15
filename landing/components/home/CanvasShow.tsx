"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Section 2 — the Canvas, shown rather than explained.
 *
 * The previous version of this section described the loop in prose:
 * Understand → Retrieve → Diagnose → Adapt → Advance, a paragraph each. That is
 * documentation. A visitor does not need to be told that one surface changes
 * according to what you need — they need to WATCH it change, which takes about
 * eight seconds and no reading at all.
 *
 * So this is a mock Canvas that cycles: a short teaching passage becomes a
 * question, becomes a diagram, becomes a model, becomes a correction, becomes the
 * next concept. Same surface throughout. The only copy is one line underneath.
 *
 * ── IT IS A MOCK, AND THAT IS A DELIBERATE CHOICE ─────────────────────────────
 *
 * Embedding the real Canvas here would need auth, a document, and a live model
 * call before the visitor has decided they care — three ways for the front door to
 * be slow or broken. The frames below are fixed and honest about what the product
 * does; nothing here claims to be a live session.
 */

type Step = {
  readonly kind: string;
  readonly title: string;
  readonly body: React.ReactNode;
};

/**
 * One continuous thread rather than six disconnected screenshots. The point being
 * made is that the SAME surface changes representation while staying on one idea,
 * and six unrelated fragments would demonstrate the opposite.
 */
const STEPS: readonly Step[] = [
  {
    kind: "read",
    title: "afterload and stroke volume",
    body: (
      <p className="cshow-prose">
        The ventricle has to open the aortic valve before it can eject anything. Raise the pressure it
        is working against and more of each beat is spent getting the valve open — so less volume
        leaves.
      </p>
    ),
  },
  {
    kind: "recall",
    title: "before we go on",
    body: (
      <div className="cshow-ask">
        <p>Why does increasing afterload reduce stroke volume?</p>
        <div className="cshow-composer">
          <span className="cshow-caret" />
          <span className="cshow-typed">because the ventricle has to push harder…</span>
        </div>
      </div>
    ),
  },
  {
    kind: "visualize",
    title: "the same idea, as a loop",
    body: <PressureVolumeLoop />,
  },
  {
    kind: "correct",
    title: "not quite",
    body: (
      <div className="cshow-correct">
        <p>
          <b>Pushing harder is the effect, not the cause.</b> The cause is that ejection cannot begin
          until ventricular pressure exceeds aortic pressure — a higher threshold leaves less of the
          beat for ejection.
        </p>
        <p className="cshow-note">noted: afterload · cause vs effect</p>
      </div>
    ),
  },
  {
    kind: "connect",
    title: "so what follows",
    body: <ConceptLink />,
  },
];

/** Roughly the time it takes to read the longest frame, and no longer. */
const DWELL_MS = 4200;

export function CanvasShow() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current =
      typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) setPaused(true);
  }, []);

  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % STEPS.length), DWELL_MS);
    return () => window.clearTimeout(id);
  }, [index, paused]);

  const step = STEPS[index]!;

  return (
    <section className="csection" id="canvas">
      <div className="wrap">
        <h2 className="chead reveal">one canvas. whatever learning requires.</h2>

        <div
          className="cshow reveal r2"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => !reduced.current && setPaused(false)}
        >
          <div className="cshow-bar">
            <span className="cshow-kind">{step.kind}</span>
            <span className="cshow-title">{step.title}</span>
            <span className="cshow-dots" role="tablist" aria-label="Canvas steps">
              {STEPS.map((s, i) => (
                <button
                  key={s.kind}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={s.kind}
                  data-active={i === index}
                  onClick={() => {
                    setIndex(i);
                    setPaused(true);
                  }}
                />
              ))}
            </span>
          </div>

          {/* Keyed on the step so React remounts the body and the entrance
              animation re-runs. Without the key the content swaps in place and the
              change is easy to miss entirely. */}
          <div className="cshow-body" key={index}>
            {step.body}
          </div>
        </div>

        <p className="cshow-line reveal r3">
          Nemesis decides whether you should read, recall, solve, visualize, or move on.
        </p>
      </div>
    </section>
  );
}

/**
 * A pressure–volume loop, drawn rather than described.
 *
 * Real geometry, traversed the way the cycle actually runs: fill along the
 * bottom, rise at constant volume on the right, eject across the top, fall at
 * constant volume on the left. An earlier version used two rounded rectangles,
 * which looked tidy and taught nothing — the whole reason to show a PV loop is
 * that the flat verticals ARE the isovolumetric phases, and rounding them off
 * removes the only thing the picture knows that the sentence does not.
 *
 * The stroke volume is marked on both, because "less volume leaves" is the claim
 * and the width of the loop is where that claim is visible.
 */
function PressureVolumeLoop() {
  return (
    <figure className="cshow-fig">
      <svg viewBox="0 0 320 210" role="img" aria-label="Pressure–volume loops: raised afterload produces a taller, narrower loop and a smaller stroke volume">
        <g className="cshow-axis">
          <line x1="44" y1="172" x2="300" y2="172" />
          <line x1="44" y1="172" x2="44" y2="16" />
        </g>

        {/* Normal: ejects from 250 down to 140. */}
        <path
          className="cshow-loop"
          d="M140 164 L250 156 L250 96 C240 74 200 68 168 74 L140 84 Z"
        />
        {/* Raised afterload: the same filling, a HIGHER pressure before the valve
            opens, and it stops emptying sooner — so the loop is taller and its
            base is shorter. That shortening is the lost stroke volume. */}
        <path
          className="cshow-loop cshow-loop-2"
          d="M176 164 L250 156 L250 58 C240 36 208 32 190 40 L176 50 Z"
        />

        {/* Stroke volume, measured on the axis where it is actually read. */}
        <g className="cshow-sv">
          <line x1="140" y1="182" x2="250" y2="182" />
          <line x1="176" y1="194" x2="250" y2="194" className="cshow-sv-2" />
        </g>

        <text className="cshow-lab" x="50" y="14">pressure</text>
        <text className="cshow-lab" x="262" y="168">volume</text>
      </svg>
      <figcaption>raised afterload — the loop narrows, and the narrowing is the lost volume</figcaption>
    </figure>
  );
}

function ConceptLink() {
  return (
    <div className="cshow-chain">
      <span className="cshow-node cshow-node-done">afterload</span>
      <span className="cshow-arrow" aria-hidden="true">→</span>
      <span className="cshow-node cshow-node-now">compensation</span>
      <span className="cshow-arrow" aria-hidden="true">→</span>
      <span className="cshow-node">ventricular remodelling</span>
    </div>
  );
}
