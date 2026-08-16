import type { Metadata } from "next";
import Link from "next/link";

import { SiteChrome, APP_SIGN_UP } from "@/components/SiteChrome";

/**
 * Principles.
 *
 * ── THE COPY IS THE OWNER'S, VERBATIM ─────────────────────────────────────────
 *
 * Written by the owner and set here as given. Do not tighten it, reorder it, or
 * merge two statements because they look adjacent. The line breaks are part of
 * it: "Learn it. Think about it. Use it." on one line and "Then move on." on the
 * next is a beat, and running them together loses the beat.
 *
 * ── WHAT THIS REPLACED ────────────────────────────────────────────────────────
 *
 * Five sections lifted verbatim off the old homepage: the loop, ingestion, the
 * learner model, three tenets and a feature inventory. They were accurate about
 * a product organised around a study loop with features attached, which is not
 * what Nemesis is. Deleted, along with the illustrations they carried in a
 * visual language the rest of the site no longer uses.
 *
 * ── NO NUMERALS ───────────────────────────────────────────────────────────────
 *
 * An earlier pass numbered these 01 to 06. Numbering implies a sequence or a
 * ranking, and these are neither; they are six positions held at once. The rules
 * between them do the separating.
 */
export const metadata: Metadata = {
  title: "Principles · Nemesis",
  description:
    "Information is abundant, attention is scarce. Less information and more learning, one thing at a time, at the edge of what you can do.",
};

const PRINCIPLES: readonly { say: string; lines: readonly string[] }[] = [
  {
    say: "information is abundant. attention is scarce.",
    lines: ["Nemesis turns everything around you into the next thing worth understanding."],
  },
  {
    say: "less information. more learning.",
    lines: [
      "300 slides should not become 600 flashcards.",
      "Nemesis distills what matters and shows you only what you need now.",
    ],
  },
  {
    say: "one thing at a time.",
    lines: [
      "Learn it. Think about it. Use it.",
      "Then move on.",
      "The canvas stays calm so your attention can stay focused.",
    ],
  },
  {
    say: "start simple. go deeper when you're ready.",
    lines: [
      "Nemesis explains things at the level that makes sense to you.",
      "Simple language. Better analogies. More depth when you need it.",
    ],
  },
  {
    say: "stay at the edge of what you can do.",
    lines: [
      "Too easy is boring. Too hard is noise.",
      "Nemesis learns what you understand, where you struggle, and continuously adjusts what comes next.",
    ],
  },
  {
    say: "think, don't collect.",
    lines: [
      "Learning is not making notes, rereading slides, or accumulating flashcards.",
      "It is retrieving, connecting, explaining, solving, and correcting.",
    ],
  },
];

export default function Principles() {
  return (
    <SiteChrome>
      <header className="phead">
        <div className="wrap">
          <h1>principles</h1>
        </div>
      </header>

      <section className="prin">
        <div className="wrap">
          <div className="prin-list">
            {PRINCIPLES.map((p) => (
              <article key={p.say} data-reveal="soft">
                <h2>{p.say}</h2>
                {p.lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </article>
            ))}
          </div>

          <div className="prin-close" data-reveal="soft">
            <p>The goal is not more time in Nemesis.</p>
            <p>It is more learning from the attention you give it.</p>
            <p className="prin-tag">learn. diagnose. iterate.</p>
          </div>

          <div className="prin-cta">
            <a className="btn btn-primary" href={APP_SIGN_UP}>
              Start learning
            </a>
            <Link className="hlink" href="/">
              accelerate cognition.
            </Link>
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
