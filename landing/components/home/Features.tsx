"use client";

import Image from "next/image";

import { useParallax } from "@/components/use-parallax";
import { Mascot } from "@/components/home/Mascot";
import { FigureCarousel, type CarouselItem } from "@/components/home/FigureCarousel";
import { CALENDAR_BLUR, EVIDENCE_BLUR, EVIDENCE_FIGURE_BLUR, SEE_BLUR } from "./art-blur";

/**
 * The four things the page claims, one band each.
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
 * ── WHY EACH BAND STILL GETS ITS OWN FILE ─────────────────────────────────────
 *
 * Four renders, one per idea: light opening outward, a beam separating, layered
 * strata, receding pulses. One image tiled four times would read as wallpaper.
 * They share a palette (indigo → azure → cyan → white) so the page holds together
 * while no two bands repeat.
 *
 * ── WHAT IS NOT CLAIMED HERE, DELIBERATELY ────────────────────────────────────
 *
 * No LMS import and no "connect your apps" (owner, 2026-08-24: the only route to a
 * university LMS today is a browser extension, and it is not clean). No AP or
 * licensure exam scaffolds — that work is planned, and `scaffold-rung.ts` is
 * deliberately subject-agnostic today. Practice, Sources and Voice were cut as
 * separate blocks because the owner does not count them as differentiators;
 * retrieval practice survives inside `evidence`, where it is doing real work.
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
  /** Put the character opposite the copy instead of a picture. */
  readonly mascot?: boolean;
  /**
   * An engraved figure laid OVER the wash, not instead of it — two grounds, one behind the other.
   * It takes its own opacity, mask and parallax rate: a face cannot survive the treatment a
   * gradient can, because a gradient has no subject to lose. See the note in art.css.
   */
  readonly figure?: { readonly src: string; readonly blur: string };
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
    art: "/nemesis/art/see.webp",
    blur: SEE_BLUR,
    head: "Visualize anything",
    body: "Anatomy and proteins in three dimensions, surfaces, plots, molecules, circuits, music, geometry, timelines and code.",
    figures: FIGURES,
  },
  {
    id: "evidence",
    art: "/nemesis/art/evidence.webp",
    blur: EVIDENCE_BLUR,
    figure: { blur: EVIDENCE_FIGURE_BLUR, src: "/nemesis/art/evidence-figure.webp" },
    head: "Built on evidence",
    body: "Scaffolding, worked examples, retrieval practice and spaced review. Four methods with real research behind them, running under every session.",
    mascot: true,
  },
  {
    id: "calendar",
    art: "/nemesis/art/calendar.webp",
    blur: CALENDAR_BLUR,
    head: "Calendar",
    body: "Your plan becomes scheduled blocks and reminders, timed to when you are likely to forget.",
    shot: {
      name: "calendar",
      alt: "A month of the Nemesis calendar: two courses, their assignments and exam, and the review blocks Nemesis scheduled between them.",
      w: 2400,
      h: 1509,
    },
  },
];

function Feature({ band, index }: { band: Band; index: number }) {
  // Alternating depth so neighbouring bands never drift in lockstep — two grounds
  // moving identically read as one sheet sliding behind the whole page.
  const art = useParallax<HTMLDivElement>(index % 2 === 0 ? 0.16 : 0.21);
  // Its own, slower rate: two grounds moving identically read as one sheet.
  const figure = useParallax<HTMLDivElement>(0.1);

  return (
    <section
      className="band"
      data-side={index % 2 === 1 ? "left" : "right"}
      data-figs={band.figures ? "true" : undefined}
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

      {band.figure ? (
        <div className="band-figure" ref={figure} aria-hidden="true">
          <Image
            src={band.figure.src}
            alt=""
            width={1100}
            height={1100}
            sizes="(max-width: 900px) 100vw, 40vw"
            placeholder="blur"
            blurDataURL={band.figure.blur}
            quality={84}
          />
        </div>
      ) : null}

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
            whichever side the light is on, so the two never fight for the same half. */}
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

        {band.mascot ? (
          <div className="band-aside band-aside-mascot">
            <Mascot size={210} />
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
