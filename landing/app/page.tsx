import { SiteChrome } from "@/components/SiteChrome";
import { Hero } from "@/components/home/Hero";
import { Canvas } from "@/components/home/Canvas";
import { Intake } from "@/components/home/Intake";
import { LearnerModel } from "@/components/home/LearnerModel";
import { Tenets } from "@/components/home/Tenets";
import { Everything } from "@/components/home/Everything";
import { Closer } from "@/components/home/Closer";

/**
 * The homepage.
 *
 * ── WHAT CHANGED, AND WHY IT IS SHORTER ───────────────────────────────────────
 *
 * The previous version was twelve sections and ~1,800 words. It explained Nemesis
 * accurately and at length, which made it read as documentation: the same idea was
 * restated in the problem, the loop, the map, the diagnosis and the tenets, each
 * with its own paragraph. Words were doing about 70% of the communication.
 *
 * This is seven sections and roughly a third of the copy, with real captures of the
 * running Canvas carrying the argument the prose used to make. The order:
 *
 *   hero → canvas → what goes in → what it learns → three tenets → the rest → close
 *
 * Sections that were folded rather than dropped: the preparation tax and sources
 * became one diagram (Intake); the map, the diagnosis and progress became the loop
 * line under the Canvas captures and the three tenets; capabilities and trust became
 * one strip. Nothing true was removed — the restatements were.
 *
 * ── THE TWO CHARACTERS ────────────────────────────────────────────────────────
 *
 * The three beads are the MARK: identity in the nav and footer. The chrome organism
 * is atmosphere and transition, and it appears five times on purpose rather than
 * beside every block — a character that turns up next to every paragraph is
 * wallpaper. Where it does appear it is saying something: it opens around material
 * in Intake, converges in the learner model, and is tight, asymmetric or smooth in
 * the three tenets according to which tenet it sits with.
 */
export default function Home() {
  return (
    <SiteChrome>
      <Hero />
      <Canvas />
      <Intake />
      <LearnerModel />
      <Tenets />
      <Everything />
      <Closer />
    </SiteChrome>
  );
}
