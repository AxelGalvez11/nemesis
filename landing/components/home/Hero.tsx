"use client";

import { NemesisOrganism } from "@/components/organism/NemesisOrganism";
import { APP_SIGN_UP } from "@/components/SiteChrome";
import { captureCtaClick } from "@/lib/posthog";

/**
 * The hero.
 *
 * Four things: the statement, the organism, one sentence, one action. Gallery
 * rather than landing page — the object is the content, and everything else gets
 * out of its way.
 *
 * ── WHAT WAS REMOVED, AND WHY ─────────────────────────────────────────────────
 *
 * The "cognitive accelerator" kicker is gone. It existed to answer "what kind of
 * thing is this" before the headline, which was the right instinct when the
 * headline was "learn what matters." — a benefit line that names no category.
 * "accelerate cognition." IS the category answer, so the kicker had become the
 * same sentence twice, and two restatements stacked on top of each other read as
 * hedging rather than as confidence.
 *
 * ── THE ORGANISM IS THE HERO, NOT DECORATION ──────────────────────────────────
 *
 * It sits between the headline and the supporting line, at full size, because the
 * product's whole claim is that one adaptive surface reorganises around what you
 * need. A visitor who watches the form continuously reorganise has already
 * understood the proposition before reading a word of it. Pushed to the side as
 * an accent it would be arguing for nothing.
 *
 * The three-bead mark is deliberately NOT repeated here — it sits in the nav
 * sixty pixels above, and two identity objects in one viewport is two things to
 * look at where the direction asks for one.
 */
export function Hero() {
  return (
    <header className="nhero">
      <div className="wrap">
        <h1 className="reveal">accelerate cognition.</h1>

        <div className="nhero-organism reveal r2" aria-hidden="true">
          <NemesisOrganism state="rest" size={520} />
        </div>

        <p className="nhero-lede reveal r3">one canvas that learns how you learn.</p>

        <div className="nhero-cta reveal r3">
          <a
            className="btn btn-primary"
            href={APP_SIGN_UP}
            onClick={() => captureCtaClick("hero", "Start learning")}
          >
            Start learning
          </a>
        </div>

        <p className="nhero-coda reveal r4">drop anything. learn from it.</p>
      </div>
    </header>
  );
}
