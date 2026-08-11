import { SiteChrome } from "@/components/SiteChrome";
import { Hero } from "@/components/home/Hero";
import { Preparation } from "@/components/home/Preparation";
import { Canvas } from "@/components/home/Canvas";
import { Resolution } from "@/components/home/Resolution";
import { FailureIsNavigation } from "@/components/home/FailureIsNavigation";
import { Progress } from "@/components/home/Progress";
import { LearnerModel } from "@/components/home/LearnerModel";
import { Sources } from "@/components/home/Sources";
import { Capabilities } from "@/components/home/Capabilities";
import { Tenets } from "@/components/home/Tenets";
import { Trust } from "@/components/home/Trust";
import { Closer } from "@/components/home/Closer";

/**
 * The homepage.
 *
 * ── THE ORDER IS THE ARGUMENT ─────────────────────────────────────────────────
 *
 * The page is built to behave like the thing it describes: sparse at the top, more
 * resolved with every section, the way Nemesis teaches. The hero states a category
 * and nothing else. By the end there are read-outs and definition lists.
 *
 * Sections 5 (diagnosis) and 7 (the learner model) sit AFTER Canvas rather than
 * before, because both are dissections of the loop and dissecting something nobody
 * has seen yet is just assertion.
 *
 * Capabilities come second to last, before trust. A feature list answers "what does
 * it have", and nobody asks that until they know what the thing is for. Trust comes
 * after everything: reassurance offered before desire is an answer to an objection
 * the visitor has not formed.
 *
 * ── WHY THERE ARE NO PRODUCT SCREENSHOTS ON THIS PAGE RIGHT NOW ───────────────
 *
 * There were: a laptop and a phone in the hero, plus captures in the middle. Every
 * one of them showed Chat, Study or Library, and those were retired as destinations.
 * A stale product shot is worse than none — it is a picture of software the visitor
 * will not find after signing up — so they came out rather than being re-cropped.
 *
 * They should come back. `landing/scripts/render-devices.py` still composites a capture
 * into a real Apple bezel and takes its input and output directories as arguments, so
 * nothing about it depends on the folders that were deleted — recreate
 * `public/nemesis/shots/` with the light/dark pairs and point the script at it. Capture
 * at each device's own viewport (1440x900 and 390x844) rather than squeezing a desktop
 * shot into a phone, serve the pair with `<picture media="(prefers-color-scheme: dark)">`,
 * and set the intrinsic width/height to whatever the script prints — a stale pair moves
 * the whole hero on load.
 *
 * One constraint that is easy to miss: `<picture media>` follows the OS, and the token
 * layer deliberately ships no theme toggle for exactly that reason. If a toggle is ever
 * added, these images have to become two <img>s swapped by CSS FIRST, or every
 * screenshot will serve the wrong mode against an inverted page.
 *
 * Until then, everything shown is either real product behaviour written out in the
 * page's own type, or an illustration that says it is one. Nothing is dressed as a
 * capture of a surface that does not exist.
 */
export default function Home() {
  return (
    <SiteChrome>
      <Hero />
      <Preparation />
      <Canvas />
      <Resolution />
      <FailureIsNavigation />
      <Progress />
      <LearnerModel />
      <Sources />
      <Capabilities />
      <Tenets />
      <Trust />
      <Closer />
    </SiteChrome>
  );
}
