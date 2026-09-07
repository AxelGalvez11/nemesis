"use client";

import Image from "next/image";

import { useParallax } from "@/components/use-parallax";
import { FigureCarousel, type CarouselItem } from "@/components/home/FigureCarousel";
import { EVIDENCE_WASH_BLUR, SEE_WASH_BLUR } from "./art-blur";

/**
 * The things the page claims, one band each.
 *
 * ── THE ART IS GROUND, NOT A PICTURE IN A BOX ─────────────────────────────────
 *
 * This started as square cards in a two-column row — art on one side, words on
 * the other — and the owner's note was that the generated light was meant to be
 * BACKGROUND, not another image sitting in a frame. That is also the honest
 * reading of openai.com: their colour is not a thumbnail beside a paragraph, it is
 * the ground a whole band sits on.
 *
 * So each band is full-bleed, the art is absolutely positioned behind it, and the
 * copy sits on top. The art alternates which edge it burns brightest on, and is
 * masked to nothing before it crosses under the words — which is what lets the
 * type stay pure `--text` on pure `--bg` and never become white-on-a-gradient.
 *
 * ── WHY EACH BAND STILL GETS ITS OWN GROUND ───────────────────────────────────
 *
 * One ground per idea. One image tiled twice would read as wallpaper, so no two bands repeat, and
 * they share a palette so the page still holds together.
 *
 * 🔴 THE PALETTE IS ORANGE NOW, AND EVERY GROUND IS COMPUTED. Owner, 2026-09-06: "redesign the
 * landing page with these new gradients", the gradients being two grainy orange references he sent.
 * All of them come out of `scripts/art-gradient.mjs`, which draws the same domain-warped field the
 * launch film's backdrop draws, so the video on this page and the page under it are one thing.
 *
 * 🔴 GRAIN IS DELIBERATE, REVERSING 2026-08-25 ("not the grainy ones"). That instruction was about
 * a generator's speckle showing up in art nobody chose it for. Here it is the subject: the
 * references are grainy, and a smooth version of them reads as a stock CSS gradient.
 *
 * 🔴 SATURATION IS CAPPED AND THE FAR EDGE IS WHITE, because this page is white top to bottom. The
 * owner's rule when asked whether orange replaces the brand blue: "nemesis can use any color for
 * gradient, the main thing is to use them appropriately with the white and black backgrounds."
 *
 * ── WHAT IS NOT CLAIMED HERE, DELIBERATELY ────────────────────────────────────
 *
 * No LMS import and no "connect your apps" (owner, 2026-08-24: the only route to a
 * university LMS today is a browser extension, and it is not clean). No AP or
 * licensure exam scaffolds — that work is planned, and `scaffold-rung.ts` is
 * deliberately subject-agnostic today. Practice and Sources were cut as separate
 * blocks because the owner does not count them as differentiators; retrieval
 * practice survives inside `evidence`, where it is doing real work.
 *
 * 🔴 VOICE IS OUT AGAIN, AND THIS TIME WITH THE CALENDAR. It was cut once, brought back by owner
 * order on 2026-08-31 ("the voice mode is not on the landing page"), and cut again on 2026-09-06:
 * "remove the 'voice' and calendar section". A band that has been in and out twice is worth saying
 * out loud so the third person to touch this file knows it is a decision, not an oversight.
 */

interface Band {
  readonly id: string;
  readonly art: string;
  readonly blur: string;
  readonly head: string;
  readonly body: string;
  /** Real figures to lay under the copy. Only `see` has them — see FIGURES. */
  readonly figures?: readonly CarouselItem[];
  /** A product shot to sit opposite the copy, light/dark pair by basename. */
  readonly shot?: { readonly name: string; readonly alt: string; readonly w: number; readonly h: number };
  /**
   * Which edge the WASH burns on, when that is not the edge `data-side` would put it on.
   *
   * 🔴 THE WASH AND THE ENGRAVING USED TO SHARE A SIDE, AND THAT WAS THE BUG THE OWNER
   * SAW (2026-08-25: "make the gradients be on the opposite side of the contrast
   * images"). `data-side` drove both, so `Built on evidence` piled a blue wash and a
   * marble thinker onto the same half and left the other half bare white. Splitting them
   * gives the band two lit edges and a clear middle. This attribute moves ONLY the wash;
   * the engraving and the copy stay where `data-side` put them.
   */
  readonly artSide?: "left" | "right";
}

/**
 * 🔴 THESE ARE THE PRODUCT'S OWN RENDERERS, NOT DRAWINGS OF THEM.
 *
 * Every frame was captured from a dev-preview harness that mounts the SAME component the Canvas
 * mounts, fed a hand-written spec, with no model and no network deciding anything:
 *
 *   /dev-preview/visual-cards   -> SemanticVisual, all thirteen semantic kinds
 *   /dev-preview/anatomy-cards  -> AnatomyViewer, real GLB meshes from the atlas
 *
 * So the haemoglobin really came from the PDB and was posed by Mol*, the surface really is a
 * sampled grid rendered in three dimensions, the score really was engraved from ABC, and the
 * ventricle really is the atlas mesh with that one structure picked out. Nothing here was drawn
 * by hand to look like the product.
 *
 * 🔴 ORDER IS DELIBERATE: THE THREE-DIMENSIONAL ONES LEAD. A carousel is judged on its first
 * card, and "we can draw a table" is a much weaker opening than a rotating heart. The flat and
 * useful kinds are all still here, further in.
 *
 * To re-capture after a renderer change, run the web app and `node cardshot4.mjs` / `anat.mjs`.
 */
const FIGURES: readonly CarouselItem[] = [
  { id: "heart", file: "heart", label: "Anatomy, in 3D", w: 1576, h: 946,
    alt: "The left ventricle picked out of a three-dimensional cardiovascular system, the rest of the vessels ghosted around it." },
  { id: "macromolecule", file: "macromolecule", label: "Protein, in 3D", w: 1416, h: 1044,
    alt: "Haemoglobin from the Protein Data Bank, its four subunits each in a different colour." },
  { id: "surface", file: "surface", label: "3D surface", w: 1416, h: 912,
    alt: "A three-dimensional surface of z equals sin x times cos y, with labelled axes." },
  { id: "plot", file: "plot", label: "Plot", w: 1416, h: 800,
    alt: "A plot of plasma concentration against time at two doses, with labelled axes and a legend." },
  { id: "structure", file: "structure", label: "Molecule", w: 1416, h: 1309,
    alt: "The structure of acetylsalicylic acid, drawn from its SMILES string." },
  { id: "nervous", file: "nervous", label: "Nervous system", w: 1576, h: 946,
    alt: "A three-dimensional brain with the hippocampus picked out on each side and named, the rest of the nervous system ghosted around it." },
  { id: "score", file: "score", label: "Music", w: 1416, h: 612,
    alt: "The opening phrase of Ode to Joy, engraved on a stave." },
  { id: "circuit", file: "circuit", label: "Circuit", w: 1416, h: 804,
    alt: "A circuit with one resistor in series with two more in parallel, and the equivalent resistance stated." },
  { id: "construction", file: "construction", label: "Geometry", w: 1416, h: 760,
    alt: "A 3-4-5 right triangle with its three angles marked and its sides labelled." },
  { id: "vectors", file: "vectors", label: "Force diagram", w: 1416, h: 760,
    alt: "A free body diagram of a block on a thirty degree incline, with weight, normal force and friction." },
  { id: "skeleton", file: "skeleton", label: "Skeleton", w: 1576, h: 946,
    alt: "A three-dimensional skeleton with the femur picked out." },
  { id: "relationship", file: "relationship", label: "Causal chain", w: 1416, h: 1042,
    alt: "A causal chain from action potential through calcium release to contraction." },
  { id: "timeline", file: "timeline", label: "Timeline", w: 1416, h: 748,
    alt: "A timeline of the American revolutionary period, showing moments and one span." },
  { id: "table", file: "table", label: "Table", w: 1416, h: 606,
    alt: "A table of current assets with a recomputed total." },
  { id: "code", file: "code", label: "Code trace", w: 1416, h: 680,
    alt: "Python source for summing a list, with a stepped trace of the accumulator." },
  { id: "equation", file: "equation", label: "Equation", w: 1416, h: 350,
    alt: "First order elimination, type-set as an equation." },
];

const BANDS: readonly Band[] = [
  {
    id: "see",
    art: "/nemesis/art/see-wash.webp",
    blur: SEE_WASH_BLUR,
    head: "Visualize anything",
    body: "Anatomy and proteins in three dimensions, surfaces, plots, molecules, circuits, music, geometry, timelines and code.",
    figures: FIGURES,
  },
  {
    id: "evidence",
    art: "/nemesis/art/evidence-wash.webp",
    blur: EVIDENCE_WASH_BLUR,
    /* 🔴 `artSide: "right"` IS GONE WITH THE STATUE IT WAS AVOIDING. It existed for one reason —
       owner, 2026-08-25: "make the gradients be on the opposite side of the contrast images" — and
       the contrast image was the seated figure that sat on this band's left. With the engraving cut
       and the wash now at full strength, sending it right put a solid orange field directly behind
       this band's copy. `data-side` alone puts the wash opposite the words, which is the rule. */
    head: "Built on evidence",
    body: "Scaffolding, worked examples, retrieval practice and spaced review. Four methods with real research behind them, running under every session.",
  },
];

/* ── WHAT CAME OUT, 2026-09-06 ────────────────────────────────────────────────
 *
 * `calendar` and `voice`, both at the owner's instruction in one message: "remove the 'voice' and
 * calendar section". Their art and their product shots are deleted rather than left on disk — the
 * page has a long history of sections coming back, but a wash in the old blue family would not
 * survive this redesign anyway, so there is nothing here worth keeping warm.
 *
 * The engraving that sat beside `Built on evidence` went in the same message: "remove the images of
 * statues". It was a seated classical figure, and the hands from the Sistine ceiling did the same
 * job on `Learn anything`. Both are gone, along with `Band.figure` and the second parallax layer
 * that positioned them — a field nothing sets is a field the next person has to read and dismiss.
 */

function Feature({ band, index }: { band: Band; index: number }) {
  // Alternating depth so neighbouring bands never drift in lockstep — two grounds
  // moving identically read as one sheet sliding behind the whole page.
  const art = useParallax<HTMLDivElement>(index % 2 === 0 ? 0.16 : 0.21);

  return (
    <section
      className="band"
      data-side={index % 2 === 1 ? "left" : "right"}
      data-figs={band.figures ? "true" : undefined}
      data-art={band.artSide}
    >
      {/* aria-hidden: it is the ground, and it carries no information a reader
          would miss. The alt text that used to describe each gradient was
          describing decoration to a screen reader. */}
      <div className="band-art" ref={art} aria-hidden="true">
        <Image
          src={band.art}
          alt=""
          width={1100}
          height={1100}
          sizes="(max-width: 900px) 120vw, 70vw"
          placeholder="blur"
          blurDataURL={band.blur}
          quality={82}
        />
      </div>

      <div className="wrap band-in" data-reveal="up">
        {/* The measure and the side live on this wrapper, not on the heading. `ch`
            resolves against the element's OWN font size, so a 46ch cap on a 44px h3
            came out at 1133px — the whole column — and `margin-left: auto` had
            nothing left to push. */}
        <div className="band-copy">
          <h3>{band.head}</h3>
          <p>{band.body}</p>
        </div>

        {/* The slot opposite the copy. A band has at most one of these, and it sits on
            whichever side the light is on, so the two never fight for the same half.
            🔴 THE CHARACTER IS NOT ONE OF THEM ANY MORE (owner, 2026-08-25: "remove the
            mascot from the 'built on evidence section'"). It sat here opposite the copy,
            which put it on the same half as the engraved thinker's wash and gave the band
            three things to look at. The hero keeps it; this band is the claim and its
            evidence. Do not re-add a `mascot` slot without him asking. */}
        {band.shot ? (
          <div className="band-aside">
            <picture>
              <source
                media="(prefers-color-scheme: dark)"
                srcSet={`/nemesis/shots/${band.shot.name}-dark.webp`}
              />
              <img
                src={`/nemesis/shots/${band.shot.name}-light.webp`}
                alt={band.shot.alt}
                width={band.shot.w}
                height={band.shot.h}
                decoding="async"
                loading="lazy"
              />
            </picture>
          </div>
        ) : null}
      </div>

      {band.figures ? (
        <div className="wrap band-figs" data-reveal="up">
          <FigureCarousel items={band.figures} />
        </div>
      ) : null}
    </section>
  );
}

export function Features() {
  return (
    <div className="bands" id="what">
      {BANDS.map((band, i) => (
        <Feature band={band} index={i} key={band.id} />
      ))}
    </div>
  );
}
