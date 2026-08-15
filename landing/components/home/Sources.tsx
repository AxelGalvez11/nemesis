"use client";

import { NemesisOrganism } from "@/components/organism/NemesisOrganism";

/**
 * Section 4 — material in, a path out.
 *
 * This replaces five sections of the old page: sources, ingestion, retrieval,
 * memory and the learner model. Those were accurate and they were mechanics —
 * a visitor deciding whether to sign up does not need the pipeline, they need to
 * know that what they already have is what they bring.
 *
 * The organism appears here for the second and last time on the page, in its
 * `intake` state: the shell opens and the flow draws inward. It is the same
 * object from the hero in a different state, not a second graphic — which is what
 * makes "this is the thing that absorbs your material" land without a caption
 * saying so.
 *
 * ── THE ONE SENTENCE THAT SURVIVED THE CUT ────────────────────────────────────
 *
 * Provenance. Everything else here was mechanics that could go, but "you can trace
 * it back" is the line that answers the question a student actually has about an
 * AI reading their coursework — whether they can check it. It buys trust for
 * eighteen words, which is the best rate on the page.
 */

const INPUTS = ["PDF", "slides", "lecture", "website", "notes", "recording"] as const;
const OUTPUTS = ["explain", "retrieve", "solve", "visualize", "connect"] as const;

export function Sources() {
  return (
    <section className="srcs" id="sources">
      <div className="wrap">
        <h2 className="chead reveal">
          bring the material.
          <br />
          nemesis builds the path.
        </h2>

        <div className="srcs-flow reveal r2">
          <ul className="srcs-col srcs-in" aria-label="What you can bring">
            {INPUTS.map((s, i) => (
              <li key={s} style={{ ["--i" as string]: i }}>
                {s}
              </li>
            ))}
          </ul>

          <div className="srcs-core" aria-hidden="true">
            <NemesisOrganism state="intake" size={260} interactive={false} />
          </div>

          <ul className="srcs-col srcs-out" aria-label="What it becomes">
            {OUTPUTS.map((s, i) => (
              <li key={s} style={{ ["--i" as string]: i }}>
                {s}
              </li>
            ))}
          </ul>
        </div>

        <p className="srcs-note reveal r3">
          Your sources stay attached to what Nemesis teaches, so you can always trace an idea back to
          the original.
        </p>
      </div>
    </section>
  );
}
