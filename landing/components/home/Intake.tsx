"use client";

import { ChromeBlob } from "@/components/ChromeBlob";

/**
 * ONE INPUT → EVERYTHING ORGANISED.
 *
 * Replaces the old preparation-tax section (142 words of two chained lists) and the
 * sources section (103) with a diagram that needs neither: what goes in, the organism
 * in the middle, what comes out. Eleven words of prose.
 *
 * The blob is doing the work of the paragraph here, which is the one place on the
 * page it earns being large — it is literally the transformation the section is about.
 */
const IN = ["pdf", "slides", "lecture", "syllabus", "notes"] as const;
const OUT = ["canvas", "review", "calendar", "library"] as const;

export function Intake() {
  return (
    <section className="hsec" id="intake">
      <div className="wrap">
        <div className="hsec-head" data-reveal="up">
          <h2 className="htitle">
            drop anything in.
            <br />
            <em>don&rsquo;t organise it first.</em>
          </h2>
        </div>

        <div className="flow" data-reveal="soft">
          <ul className="flow-row">
            {IN.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>

          <div className="flow-mid" aria-hidden="true">
            <ChromeBlob state="absorbing" size={260} />
          </div>

          <ul className="flow-row flow-out">
            {OUT.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
