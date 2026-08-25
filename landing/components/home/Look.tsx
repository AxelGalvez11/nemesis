"use client";

import { useParallax } from "@/components/use-parallax";

/**
 * What Nemesis actually looks like.
 *
 * ── THIS REPLACES THE MOCK, AND THAT WAS THE POINT ────────────────────────────
 *
 * What stood here was `CanvasShowcase` — a hand-drawn animation of a Canvas
 * session, choreographed in SVG across three subjects on a 53-second loop. It was
 * beautifully made and it was a drawing of the product rather than the product,
 * which is what the owner asked to remove. These are real screenshots of the real
 * application, and they were already sitting in `public/nemesis/shots` unused.
 *
 * The audit's third critical finding was that the page carried no evidence of any
 * kind: no screenshots, no numbers, nobody's word for it. A picture of the running
 * software is the cheapest evidence available.
 *
 * 🔴 AND IT HAS TO SHOW A FIGURE, NOT PROSE. The first version of this section used
 * `canvas-lesson-*`, which is the same lesson rendering as plain text, and the owner's
 * verdict was that it "sucks" because any chatbot can print paragraphs. The shot here
 * now shows the Canvas drawing a real action-potential curve inline, which is the part
 * nothing else in the category does. It came from adding a `visual` to the lesson block
 * in `canvas-preview-fixture.ts`: before that the fixture had no figure anywhere, so
 * /dev-preview/learn never exercised `RoutedVisual` at all.
 *
 * ── WHY THERE IS NO PHONE INSET ANY MORE ──────────────────────────────────────
 *
 * A second, smaller copy of the same screenshot hung off the bottom-right corner
 * until 2026-08-24. The owner cut it, and it was the right cut: it showed the SAME
 * lesson at a third of the size, so it added no information and took attention away
 * from the figure, which is the only thing this section is here to prove. The line
 * underneath still says the app is on both, which is the part that mattered.
 *
 * ── WHY <picture> AND NOT next/image ──────────────────────────────────────────
 *
 * Every product shot on this site ships a light file and a dark file and picks
 * between them with `media="(prefers-color-scheme: dark)"`, per the note in
 * globals.css. `next/image` has no art-direction API that survives that, and
 * serving a white screenshot onto the black page is worse than losing the
 * optimiser on two images that are already WebP and already sized.
 *
 * `decoding="async"` and `loading="lazy"` because this sits well below the fold;
 * width and height are the real pixel dimensions so the box is reserved before
 * either file arrives and the section never jumps.
 */
export function Look() {
  const desk = useParallax<HTMLDivElement>(0.07);

  return (
    <section className="look" id="look">
      <div className="wrap">
        <h2 className="look-head reveal">This is the whole thing.</h2>
        <p className="look-sub reveal r2">
          One surface. It teaches, draws the figure the point needs, asks you to explain it back, and keeps track of what you know.
        </p>

        <div className="look-stage reveal r2">
          <div className="look-desk" ref={desk}>
            <picture>
              <source
                media="(prefers-color-scheme: dark)"
                srcSet="/nemesis/shots/canvas-visual-dark.webp"
              />
              <img
                src="/nemesis/shots/canvas-visual-light.webp"
                alt="A Nemesis lesson on cardiac action potentials, with a plotted action potential curve drawn inline in the explanation."
                width={2560}
                height={1600}
                decoding="async"
                loading="lazy"
              />
            </picture>
          </div>

        </div>

        <p className="look-note reveal r3">One canvas, on your laptop and in your pocket.</p>
      </div>
    </section>
  );
}
