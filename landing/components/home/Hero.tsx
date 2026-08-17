"use client";

import { NemesisOrganism } from "@/components/organism/NemesisOrganism";
import { APP_SIGN_UP } from "@/components/SiteChrome";
import { captureCtaClick } from "@/lib/posthog";

/**
 * The hero: statement left, organism right.
 *
 * ── WHY IT IS NOT CENTRED, AND NOT A HALF-AND-HALF SPLIT ──────────────────────
 *
 * Centred, the headline sat on top of the organism and the two competed for the
 * same axis — the eye had nowhere to go but straight down, and the object ended
 * up reading as an illustration of the sentence above it.
 *
 * Off-centre, they do different jobs. The text holds a narrow measure on the
 * left and the object occupies open space on the right, so the page has a
 * reading order rather than a stack. The columns are deliberately uneven, and
 * the organism is allowed to overflow its column: an even split with each side
 * neatly inside its box is the layout every SaaS homepage already uses, and the
 * overflow is what makes the object feel placed in the page rather than
 * slotted into a grid cell.
 *
 * No card, no border, no panel behind it. A frame would turn the identity into
 * a product screenshot.
 *
 * ── WHAT WAS REMOVED ──────────────────────────────────────────────────────────
 *
 * The "cognitive accelerator" kicker went when the headline became "accelerate
 * cognition." — the same claim, stated twice, reads as hedging.
 *
 * "drop anything. learn from it." went too. It was a good line, but it was the
 * second supporting sentence under a headline that needs at most one, and the
 * idea it carried is the whole of the sources section further down. The hero
 * is now four things: the statement, the object, one line, one action.
 *
 * The three-bead mark is deliberately not repeated here — it is in the nav
 * sixty pixels above, and two identity objects in one viewport is two things to
 * look at where the direction asks for one.
 */
export function Hero() {
  return (
    <header className="nhero">
      <div className="wrap nhero-grid">
        <div className="nhero-copy">
          <h1 className="reveal">Accelerate cognition.</h1>

          <p className="nhero-lede reveal r2">One Canvas that learns how you learn.</p>

          <div className="nhero-cta reveal r3">
            <a
              className="btn btn-primary"
              href={APP_SIGN_UP}
              onClick={() => captureCtaClick("hero", "Start learning")}
            >
              Start learning
            </a>
          </div>
        </div>

        {/* aria-hidden: it carries the identity, not information. A screen
            reader announcing it would be announcing decoration. */}
        <div className="nhero-organism reveal r2" aria-hidden="true">
          <NemesisOrganism state="rest" size={620} />
        </div>
      </div>
    </header>
  );
}
