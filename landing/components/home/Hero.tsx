"use client";

import { NemesisMark } from "@/components/NemesisMark";
import { APP_SIGN_UP } from "@/components/SiteChrome";
import { captureCtaClick } from "@/lib/posthog";

/**
 * The hero.
 *
 * Five elements and a lot of nothing: the mark, the category, the statement, one
 * sentence, one action. The old hero put a laptop and a phone directly under the
 * headline — a product shot has to be earned by a proposition, and showing the
 * machine before saying what it is for makes the visitor grade the screenshot
 * instead of the idea.
 *
 * THE CATEGORY LINE IS DOING THE MOST WORK HERE. "cognitive accelerator" is not a
 * tagline; it is the answer to "what kind of thing is this", which is the question
 * a first-time visitor is actually holding, and no amount of benefit copy answers
 * it. It goes above the headline because that is the order the question arrives in.
 *
 * The mark is in `idle` — present, not working. Every other state is a claim that
 * something is happening, and nothing is happening yet.
 */
export function Hero() {
  return (
    <header className="nhero">
      <div className="wrap">
        <div className="nhero-mark reveal">
          <NemesisMark state="idle" size={132} label="Nemesis" />
        </div>

        <p className="hkicker reveal r2">cognitive accelerator</p>

        <h1 className="reveal r2">learn at the speed of understanding.</h1>

        <p className="nhero-lede reveal r3">
          Nemesis turns lectures, textbooks, recordings and course material into an
          adaptive path through knowledge.
        </p>

        <div className="nhero-cta reveal r3">
          <a
            className="btn btn-primary"
            href={APP_SIGN_UP}
            onClick={() => captureCtaClick("hero", "Start learning")}
          >
            Start learning
          </a>
          <a className="hlink" href="#canvas">
            see how it works
          </a>
        </div>

        <p className="nhero-coda reveal r4">
          the machine prepares.
          <br />
          you learn.
        </p>
      </div>
    </header>
  );
}
