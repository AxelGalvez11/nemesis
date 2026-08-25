"use client";

import Image from "next/image";

import { APP_SIGN_UP } from "@/components/SiteChrome";
import { useParallax } from "@/components/use-parallax";
import { CLOSE_WASH_BLUR } from "./art-blur";
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
 *
 * ── THE LIGHT UNDER IT, ADDED 2026-08-25 ──────────────────────────────────────
 *
 * The owner asked for a smooth gradient here, and "smooth" is the whole spec: every
 * other ground on this page is a GENERATED render and carries the generator's
 * speckle. This one is computed — `scripts/art-wash.py` composites soft radial blobs
 * over white, so there is no grain in it at any size.
 *
 * It rises from the BOTTOM edge and is masked to nothing well before the headline.
 * The section is centred, so there is no quiet side to hide colour on; under it is
 * the only direction that leaves the type on clean ground. That is the same rule the
 * rest of the page keeps, applied to a symmetric block.
 */
export function Closer() {
  const wash = useParallax<HTMLDivElement>(0.12);

  return (
    <section className="nclose" id="start">
      <div className="nclose-art" ref={wash} aria-hidden="true">
        <Image
          src="/nemesis/art/close-wash.webp"
          alt=""
          width={2000}
          height={1100}
          sizes="100vw"
          placeholder="blur"
          blurDataURL={CLOSE_WASH_BLUR}
          quality={86}
        />
      </div>

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
