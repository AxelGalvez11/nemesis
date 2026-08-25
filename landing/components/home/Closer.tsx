"use client";

import { APP_SIGN_UP } from "@/components/SiteChrome";
import { captureCtaClick } from "@/lib/posthog";

/**
 * THE CLOSE.
 *
 * ── WHY "ACCELERATE COGNITION" IS DOWN HERE NOW ───────────────────────────────
 *
 * It used to open the page and close it, and opening with it was the single
 * costliest thing on the site: a stranger met an abstraction before anything had
 * told them what the product was. The phrase is good and the owner wants it — it
 * just needs the page to happen first. By this point the reader has been told the
 * job, shown the software, and given the four methods underneath it, so the line
 * lands as a summary instead of a riddle.
 *
 * ── NOTHING BUT THE WORDS AND THE ACTION ──────────────────────────────────────
 *
 * This section has held three different objects: the stipple organism, then the
 * character, then the character on a bloom built to light it. All three are gone at
 * the owner's instruction, and the section is better for it — the page has already
 * shown the reader the product, the figures and the range, and the last thing it
 * needs is one more thing to look at instead of the button.
 *
 * The character still appears twice, in the hero and in `Built on evidence`.
 */
export function Closer() {

  return (
    <section className="nclose" id="start">
      <div className="wrap" data-reveal="up">
        <h2>Accelerate cognition.</h2>

        <div className="nclose-cta">
          <a
            className="btn btn-primary"
            href={APP_SIGN_UP}
            onClick={() => captureCtaClick("closer", "Start learning")}
          >
            Start learning
          </a>
        </div>
        <p className="nclose-note">Free to start. No card.</p>
      </div>
    </section>
  );
}
