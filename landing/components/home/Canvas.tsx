"use client";

import { Shot } from "@/components/home/Shot";

/**
 * CANVAS — the product, shown rather than described.
 *
 * This section used to be five stage cards with a paragraph each, plus a worked
 * example written out in prose: 332 words to argue for something the product can
 * simply be photographed doing. It is now two real captures and about forty.
 *
 * The captures are the whole argument. The first is a lesson with its vocabulary
 * scaffolding; the second is the diagnosis, and it is worth looking at closely,
 * because the surface says "2 ideas in this lesson were not assessed" of its own
 * accord. A product that volunteers what it has NOT measured is a stronger claim
 * than any sentence on this page could make about it.
 *
 * The loop is a row of five words. Naming the stages is enough once the screenshots
 * are carrying the evidence; explaining each one was the redundancy.
 */
export function Canvas() {
  return (
    <section className="hsec hsec-open" id="canvas">
      <div className="wrap">
        <div className="hsec-head" data-reveal="up">
          <p className="hkicker">canvas</p>
          <h2 className="htitle">it doesn&rsquo;t just explain. it makes you retrieve.</h2>
        </div>
      </div>

      {/* Wider than the reading column. The product is the point of this section,
          so it gets more of the screen than the words that introduce it. */}
      <div className="wrap wrap-wide">
        <div data-reveal="zoom">
          <Shot
            name="canvas-lesson"
            alt="The Nemesis canvas showing a lesson on cardiac action potentials: a one-idea summary set off by a rule, then explanatory paragraphs with terms like myocyte and electrochemical gradient underlined for definition, and a composer at the bottom reading ask Nemesis or change how you're learning."
            width={2880}
            height={1800}
            priority
          />
        </div>

        <ol className="loopline" data-reveal="soft">
          <li>learn</li>
          <li>recall</li>
          <li>diagnose</li>
          <li>relearn</li>
          <li>retest</li>
        </ol>

        <div data-reveal="zoom">
          <Shot
            name="canvas-diagnose"
            alt="The same canvas after a round of retrieval: a section headed what you understand listing ventricular phase 0, a section headed what needs work listing nodal phase 4 spontaneous depolarisation and effective refractory period, a line stating that two ideas in the lesson were not assessed, and a button reading fix my weak spots."
            width={2880}
            height={1080}
          />
          <p className="shot-cap">
            Not a score. What held, what broke, and what it has not asked you about
            yet.
          </p>
        </div>
      </div>
    </section>
  );
}
