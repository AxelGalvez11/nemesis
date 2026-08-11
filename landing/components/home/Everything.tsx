"use client";

import { Shot } from "@/components/home/Shot";

/**
 * EVERYTHING ELSE — one compact strip.
 *
 * This absorbs two whole sections: capabilities (six definition rows with a lead and
 * a body paragraph each, 294 words) and trust (four more, 170). Together they were a
 * quarter of the page arguing for things nobody reaches a homepage to read about.
 *
 * 🔴 TRUST IS COMPRESSED, NOT DELETED. The 7-section direction has no trust section
 * and did not ask for one to be removed, and these are standing product commitments
 * rather than marketing lines — "it never submits work for you" is policy, and the
 * judge genuinely refuses to correct an answer it cannot read confidently. They are
 * one line each here instead of a paragraph each. If they should come off the
 * homepage entirely that is a deliberate call, not something to infer.
 *
 * The phone capture carries the recording and mobile story that used to be three
 * paragraphs about quiet rooms, filing and afterwards.
 */
const DOES = [
  "records lectures",
  "reads slides, PDFs and documents",
  "keeps sources tied to what you learned from them",
  "schedules review against your real deadlines",
] as const;

const WONT = [
  "never submits work for you",
  "says so instead of guessing when it cannot tell",
  "your library is plain files you can take with you",
] as const;

export function Everything() {
  return (
    <section className="hsec" id="everything">
      <div className="wrap">
        <div className="strip" data-reveal="soft">
          <div>
            <p className="hkicker">it also</p>
            <ul className="strip-list">
              {DOES.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="hkicker">it won&rsquo;t</p>
            <ul className="strip-list strip-wont">
              {WONT.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <div className="strip-shot" data-reveal="zoom">
            <Shot
              name="canvas-phone"
              alt="Nemesis on a phone, showing the same lesson on cardiac action potentials with its composer at the bottom of the screen."
              width={780}
              height={1688}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
