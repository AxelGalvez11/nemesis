"use client";

import Image from "next/image";

import { Mascot } from "@/components/home/Mascot";
import { APP_SIGN_UP } from "@/components/SiteChrome";
import { captureCtaClick } from "@/lib/posthog";
import { useParallax } from "@/components/use-parallax";
import { HERO_BLUR } from "./art-blur";

/**
 * The hero: statement left, organism right, generated light behind both.
 *
 * ── WHAT CHANGED, AND WHY THE BLACK-AND-WHITE RULE DID NOT SURVIVE IT ─────────
 *
 * The standing rule in globals.css was the owner's, 2026-07-28: "purely black and
 * white minimalism … the red accent should be gone, we want focus not noise", and
 * it listed "every gradient" among the things removed and not coming back. The
 * owner reversed that on 2026-08-24 after looking at openai.com, asking for
 * Higgsfield-generated gradients and background imagery.
 *
 * It is a reversal of the palette, NOT of the reasoning. What the old rule was
 * really protecting against was decoration competing with the reading, and the
 * mechanism copied here is the one that avoids exactly that: openai.com has no CSS
 * gradients anywhere, keeps its page white and its type black, and puts every bit
 * of colour into rendered art. So the ink, the hairlines and the greys below are
 * untouched — the colour arrives as one image, behind the object, masked out
 * before it reaches any text.
 *
 * ── WHY THE HEADLINE MOVED OFF "ACCELERATE COGNITION" ─────────────────────────
 *
 * It has not gone; it closes the page instead. As an opening line it asked a
 * stranger to decode it before they knew what the product was, and nothing else
 * above the fold told them — no "student", no "course", no "lecture" anywhere on
 * the old page. The claim now leads with the job and the close keeps the phrase,
 * where it reads as a summary of something already shown.
 *
 * ── THE CHARACTER TOOK THE OBJECT'S PLACE (owner, 2026-08-24) ─────────────────
 *
 * The stipple organism held this spot and is now off the page entirely. The owner
 * asked for the character here instead, which reverses the earlier "keep the dotted
 * globe" and is a better page: the globe was beautiful and unreadable — a first-time
 * visitor could not tell what it was — where the character is the same thing they
 * will meet inside the product, and it looks back at them.
 *
 * It sits ON the light rather than beside it, which is the one composition the old
 * flat page could not do. It keeps its own slower parallax so it separates from the
 * backdrop as the page moves.
 *
 * `NemesisOrganism` and its shader files are left on disk, unimported.
 */
export function Hero() {
  // The backdrop travels furthest, the object least. That difference IS the depth
  // cue — matching them would move the whole hero as one flat sheet.
  const glow = useParallax<HTMLDivElement>(0.22);
  const orb = useParallax<HTMLDivElement>(0.06);

  return (
    <header className="nhero">
      {/* aria-hidden and not a background-image: it is decoration, but it is also
          the heaviest thing above the fold, and an <Image> gets the sizes/priority
          treatment a CSS background never does.

          A looping video ran here briefly on 2026-08-24 and came straight back out —
          the owner's word was "glitchy". Generated gradient motion reads as artefacts
          rather than as light, and a still frame of the same art has none of that
          problem. The stipple organism above it is the page's moving element; it does
          not need a second one competing behind it. */}
      <div className="nhero-glow" ref={glow} aria-hidden="true">
        <Image
          src="/nemesis/art/hero.webp"
          alt=""
          width={2400}
          height={1372}
          sizes="100vw"
          placeholder="blur"
          blurDataURL={HERO_BLUR}
          priority
          quality={84}
        />
      </div>

      <div className="wrap nhero-grid">
        <div className="nhero-copy">
          <h1 className="reveal">Learn anything, faster.</h1>

          <p className="nhero-lede reveal r2">
            Nemesis turns your lectures, slides and notes into a course, then teaches it, adapting to
            what you already know.
          </p>

          <div className="nhero-cta reveal r3">
            <a
              className="btn btn-primary"
              href={APP_SIGN_UP}
              onClick={() => captureCtaClick("hero", "Start learning")}
            >
              Start learning
            </a>
            {/* A text link, not a second button: two buttons of equal weight is
                two primary actions, which is none. */}
            <a className="nhero-alt" href="#look">
              See how it looks
            </a>
          </div>
        </div>

        {/* Not aria-hidden any more: unlike the stipple object this replaced, the
            character is something you can click, so it announces itself. */}
        <div className="nhero-organism reveal r2" ref={orb}>
          <Mascot size={300} />
        </div>
      </div>
    </header>
  );
}
