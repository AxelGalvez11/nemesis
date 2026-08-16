import type { Metadata } from "next";
import Link from "next/link";

import { SiteChrome, APP_SIGN_UP } from "@/components/SiteChrome";

/**
 * Principles.
 *
 * ── WHAT THIS REPLACED ────────────────────────────────────────────────────────
 *
 * Five sections lifted verbatim off the old homepage: the loop, ingestion, the
 * learner model, three tenets and a feature inventory. They were moved here
 * intact when the homepage was cut to four sections, which was right at the time
 * because deleting work in the same change that relocates it makes both
 * decisions hard to review.
 *
 * They have since stopped being true in the way that matters. They described a
 * product organised around a study loop with a set of features attached. Nemesis
 * is one adaptive Canvas that decides how to teach something, and the old page
 * never said that once. It also carried its own illustrations in a visual
 * language the rest of the site no longer uses.
 *
 * ── WHY IT IS SHORT ───────────────────────────────────────────────────────────
 *
 * A principle that needs a paragraph to defend it is a feature description
 * wearing a principle's clothes. Each of these is a commitment that could be
 * broken, and you could tell if it were. That is the test for adding a sixth.
 */
export const metadata: Metadata = {
  title: "Principles · Nemesis",
  description:
    "What Nemesis holds to: one adaptive surface, any subject, retrieval before repetition, time spent where you are weak, and sources that stay attached.",
};

const PRINCIPLES: readonly { say: string; then: string }[] = [
  {
    say: "one surface.",
    then: "A passage, a question, a diagram, a model you can turn, a worked solution. The Canvas changes what it renders rather than sending you somewhere else to find it.",
  },
  {
    say: "any subject.",
    then: "A law student and a mechanical engineering student should both find it native. Nothing here is tuned to one field, and a feature that only makes sense for one is a feature built wrong.",
  },
  {
    say: "retrieval before repetition.",
    then: "Rereading feels like progress and mostly is not. You get asked before you get told again.",
  },
  {
    say: "time goes where you are weak.",
    then: "What you have already shown you know is not worth your evening. The point of watching how you answer is to stop spending time there.",
  },
  {
    say: "your sources stay attached.",
    then: "Anything Nemesis teaches can be traced back to the page it came from, so you can check the work rather than trust it.",
  },
  {
    say: "it says when it does not know.",
    then: "A confident wrong answer costs more than an admitted gap, because you cannot correct what you were not told was uncertain.",
  },
];

export default function Principles() {
  return (
    <SiteChrome>
      <header className="phead">
        <div className="wrap">
          <h1>principles</h1>
          <p>What Nemesis holds to, and what it will not do.</p>
        </div>
      </header>

      <section className="prin">
        <div className="wrap">
          <ol className="prin-list">
            {PRINCIPLES.map((p) => (
              <li key={p.say} data-reveal="soft">
                <h2>{p.say}</h2>
                <p>{p.then}</p>
              </li>
            ))}
          </ol>

          <p className="prin-close">
            <Link href="/">accelerate cognition.</Link>
          </p>
          <div className="prin-cta">
            <a className="btn btn-primary" href={APP_SIGN_UP}>
              Start learning
            </a>
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
