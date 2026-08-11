"use client";

import { ChromeBlob, type BlobState } from "@/components/ChromeBlob";

/**
 * THREE TENETS, each given most of a viewport.
 *
 * Was six statements with a sentence of justification each — 224 words, and a
 * homepage is not where a position gets argued. Three, no explanation, at display
 * size. The other three and the reasoning behind them belong on /about.
 *
 * Each gets the organism in the state that statement is about, which is the one
 * place a blob per block is not decoration: the form IS the claim. `testing` is
 * tighter than idle. `weakness` is visibly asymmetric. `mastery` is smooth and even.
 */
const TENETS: readonly { say: string; state: BlobState }[] = [
  { say: "no passive rereading.", state: "testing" },
  { say: "retrieval before repetition.", state: "understanding" },
  { say: "spend time where you're weak.", state: "weakness" },
];

export function Tenets() {
  return (
    <section className="hsec hsec-flush" id="tenets">
      {TENETS.map((t) => (
        <div className="tenet-full" key={t.say} data-reveal="soft">
          <div className="wrap tenet-in">
            <p className="tenet-say">{t.say}</p>
            <div className="tenet-blob" aria-hidden="true">
              <ChromeBlob state={t.state} size={220} />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
