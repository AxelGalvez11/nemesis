import { SiteChrome } from "@/components/SiteChrome";
import { Hero } from "@/components/home/Hero";
import { CanvasShowcase } from "@/components/showcase/CanvasShowcase";
import { Sources } from "@/components/home/Sources";
import { Closer } from "@/components/home/Closer";

/**
 * The homepage.
 *
 * ── WHY IT IS FOUR SECTIONS ───────────────────────────────────────────────────
 *
 * The previous version was seven sections and explained, in order: the preparation
 * tax, the learning loop, resolution, diagnosis, progress, the learner model,
 * sources, recording, ingestion, retrieval, calendar, memory, six tenets, control,
 * uncertainty and exportability. All of it true, and all of it standing between a
 * first-time visitor and the product.
 *
 * Nemesis is one adaptive Canvas. A site for it should be about as complicated as
 * that sentence:
 *
 *   hero          the claim, and the organism making it
 *   showcase      one Canvas changing what it renders, four times, while pinned
 *   sources       what you bring, and that you can trace it back
 *   close         the claim again, now that it means something
 *
 * ── WHY THERE IS ONE SHOWCASE AND NOT TWO SECTIONS ────────────────────────────
 *
 * There used to be a Canvas mock that cycled on a timer, and beneath it three
 * separate demonstrations of three representations. Both were arguing the same
 * point, which meant the page made it twice and proved it neither time — three
 * demonstrations side by side show three surfaces, and the entire claim is that
 * there is only ever one. They are now a single pinned Canvas that changes what
 * it renders as you scroll.
 *
 * ── WHERE THE REST WENT ───────────────────────────────────────────────────────
 *
 * Not deleted — moved to /principles, intact. The thinking in those sections is
 * good and some visitors will want it; it just is not what a stranger needs in the
 * first thirty seconds. The nav's "Tenets" link now points there.
 *
 * ── THE TWO CHARACTERS ────────────────────────────────────────────────────────
 *
 * The three beads are the MARK: identity, in the nav and the footer, static. The
 * organism is its living form and appears exactly twice — at rest in the hero, and
 * drawing inward in the sources section. It deliberately does not travel down the
 * page through the showcase: the thing that persists there is the Canvas, and two
 * persistent objects competing for the same scroll would be one too many.
 */
export default function Home() {
  return (
    <SiteChrome>
      <Hero />
      <CanvasShowcase />
      <Sources />
      <Closer />
    </SiteChrome>
  );
}
