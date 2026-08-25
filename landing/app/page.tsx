import { SiteChrome } from "@/components/SiteChrome";
import { Hero } from "@/components/home/Hero";
import { LearnAnything } from "@/components/home/LearnAnything";
import { Features } from "@/components/home/Features";
import { Closer } from "@/components/home/Closer";

/**
 * The homepage.
 *
 * ── THE ORDER, AND WHY IT IS THIS ORDER ───────────────────────────────────────
 *
 *   hero      the job, in the reader's words, with the identity on lit ground
 *   learn     the range, drawn as a ring rather than argued as a list
 *   features  see it / built on evidence / calendar, one noun heading each
 *   close     "accelerate cognition", now that it means something
 *
 * `learn` is its own component rather than a fourth entry in `Features` because it
 * is the only claim on the page whose SHAPE is the argument: a centred sentence
 * inside a ring of twelve subjects says "no field comes first" in a way no ordered
 * list can. See LearnAnything.tsx.
 *
 * The page states what it does, shows what it looks like, says what is underneath
 * it, and asks. That is the owner's brief almost verbatim: describe what it does,
 * how it looks, and the purpose.
 *
 * ── WHAT WAS REMOVED, 2026-08-24 ──────────────────────────────────────────────
 *
 * `Look` — the "This is the whole thing" section — came out at the owner's
 * instruction. It carried one screenshot of the app, and the nine real figures in
 * the `See it` band already do the same job better: they show what the renderer
 * DRAWS rather than what the page around it looks like. `Look.tsx` and the shots it
 * used are left on disk, unimported, in case a product-shot section returns.
 *
 * `CanvasShowcase` — the animated mock of a Canvas session — is gone at the
 * owner's instruction. It was a drawing of the product standing in the place a
 * picture of the product should stand, and real screenshots were already sitting
 * unused in `public/nemesis/shots`. The component and its scene files are left on
 * disk rather than deleted: the choreography is good work and nothing else
 * imports it, so it costs nothing to keep and would cost a day to rebuild.
 *
 * `Sources` is gone too. Its subject — what you can bring in, and tracing an idea
 * back to the original — was the best writing on the old page, but the owner does
 * not count sources as a differentiator. What it carried that still matters, the
 * list of things you can bring, now sits inside the `Learn anything` block.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────────
 *
 * No "connect your apps" section. The only route to a university LMS today is a
 * browser extension the owner considers glitchy, and the plugins surface itself
 * marks LMS import as "Coming soon" with the button disabled. Nothing on this page
 * may promise it. No AP or licensure exam scaffolds either — that work is planned,
 * not built, and `scaffold-rung.ts` is deliberately subject-agnostic today.
 */
export default function Home() {
  return (
    <SiteChrome>
      <Hero />
      <LearnAnything />
      <Features />
      <Closer />
    </SiteChrome>
  );
}
