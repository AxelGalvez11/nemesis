"use client";

import { ChromeBlob } from "@/components/ChromeBlob";

/**
 * NEMESIS LEARNS HOW YOU LEARN.
 *
 * One statement, the signals it reads drawn in around the organism, and the read-out.
 * The two explanatory paragraphs that used to sit here are gone; 187 words became
 * about fifty.
 *
 * ── EVERY SIGNAL BELOW IS ONE THE SYSTEM ACTUALLY READS ───────────────────────
 *
 * Terse copy is exactly where accuracy breaks, so these were picked against the code
 * rather than for rhythm. `what you produced` and `what was missing` are the two
 * halves of a ResponseEvaluation. `misconceptions` is a distinct verdict, not a
 * synonym for wrong. `vocabulary` is canvas-vocabulary.ts. `prerequisites` is the
 * concept dependency the diagnosis can surface. `corrective attempts` is the
 * capped counter the policy reads.
 *
 * 🔴 THE LAST ONE IS NOT "FORGETTING". canvas-retention.ts carries a test asserting
 * that no amount of elapsed time can become a claim of loss, and its gate is named
 * `needsFreshEvidence` for that reason. A label reading "forgetting" would state
 * something the product refuses to state. "worth asking again" is the same idea,
 * honestly.
 *
 * 🔴 AND THE READ-OUT IS PER TOPIC. `diagnose()` takes one canvas's own concept
 * list; there is no profile spanning a degree. The caption stays even at 30% words.
 */
const SIGNALS = [
  "what you produced",
  "what was missing",
  "misconceptions",
  "vocabulary",
  "prerequisites",
  "corrective attempts",
  "worth asking again",
] as const;

const READOUT = [
  { name: "elastic vs plastic deformation", state: "strong", tone: "strong" },
  { name: "second moment of area", state: "strong", tone: "strong" },
  { name: "shear vs bending failure", state: "developing" },
  { name: "buckling under eccentric load", state: "weak", tone: "weak" },
  { name: "combined loading", state: "not yet asked" },
] as const;

export function LearnerModel() {
  return (
    <section className="hsec" id="model">
      <div className="wrap">
        <div className="hsec-head" data-reveal="up">
          <h2 className="htitle">nemesis learns how you learn.</h2>
        </div>

        {/* The signals converge on the organism as the section arrives. */}
        <div className="signals" data-reveal="soft">
          <div className="signals-core" aria-hidden="true">
            <ChromeBlob state="understanding" size={300} />
          </div>
          <ul className="signals-list">
            {SIGNALS.map((s, i) => (
              <li key={s} style={{ "--i": i } as React.CSSProperties}>
                {s}
              </li>
            ))}
          </ul>
        </div>

        <dl className="model" data-reveal="soft">
          {READOUT.map((c) => (
            <div className="model-row" key={c.name}>
              <dt>{c.name}</dt>
              <dd className={"tone" in c && c.tone ? `is-${c.tone}` : undefined}>
                {c.state}
              </dd>
            </div>
          ))}
        </dl>
        <p className="model-cap" data-reveal="soft">
          One topic&rsquo;s read-out. Nemesis tracks understanding within the thing you
          are learning, not as a score for a whole degree, and anything it has not
          asked about stays untested rather than counted as known.
        </p>
      </div>
    </section>
  );
}
