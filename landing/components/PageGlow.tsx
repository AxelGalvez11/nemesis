"use client";

import Image from "next/image";

import { useParallax } from "@/components/use-parallax";
import { PRICING_BLUR } from "@/components/home/art-blur";

/**
 * A masked wash of generated light behind a section, for pages that are not the home page.
 *
 * ── WHY THIS IS A COMPONENT AND THE HOME PAGE'S IS NOT ────────────────────────
 *
 * The hero's light and the four band grounds are each placed against one specific
 * composition — the hero's ellipse is positioned to sit behind the organism and to
 * be gone before it reaches the headline, and a band's is positioned against which
 * side its copy is on. Generalising those would mean a component with a prop for
 * every number in the mask, which is worse than two rules in a stylesheet.
 *
 * This one has a single job: put a quiet, wide wash at the top of an ordinary page
 * so it does not open on a bare white rectangle. Pricing uses it. Anything else that
 * wants the same treatment can too, and nothing needs to be parameterised for that
 * to work.
 *
 * The art is one of the grainy renders in `public/nemesis/art`, same family and same
 * palette as the home page, so the two pages are visibly the same site.
 */
export function PageGlow() {
  const glow = useParallax<HTMLDivElement>(0.18);

  return (
    // aria-hidden: decoration. It carries no information and describing it to a
    // screen reader would only delay the price.
    <div className="pglow" ref={glow} aria-hidden="true">
      <Image
        src="/nemesis/art/pricing.webp"
        alt=""
        width={2000}
        height={1143}
        sizes="100vw"
        placeholder="blur"
        blurDataURL={PRICING_BLUR}
        priority
        quality={84}
      />
    </div>
  );
}
