import { SiteChrome } from "@/components/SiteChrome";
import { Hero } from "@/components/home/Hero";
import { CanvasShow } from "@/components/home/CanvasShow";
import { Representations } from "@/components/home/Representations";
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
 *   canvas        the surface changing representation, shown not described
 *   representations   the same surface across three different kinds of problem
 *   sources       what you bring, and that you can trace it back
 *   close         the claim again, now that it means something
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
 * drawing inward in the sources section. Twice is a character; everywhere is
 * wallpaper.
 */
export default function Home() {
  return (
    <SiteChrome>
      <Hero />
      <CanvasShow />
      <Representations />
      <Sources />
      <Closer />
    </SiteChrome>
  );
}
