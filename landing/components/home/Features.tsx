"use client";

import Image from "next/image";

import { useParallax } from "@/components/use-parallax";
import { Mascot } from "@/components/home/Mascot";
import { CALENDAR_BLUR, EVIDENCE_BLUR, SEE_BLUR } from "./art-blur";

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
  readonly figures?: readonly Figure[];
  /** A product shot to sit opposite the copy, light/dark pair by basename. */
  readonly shot?: { readonly name: string; readonly alt: string; readonly w: number; readonly h: number };
  /** Put the character opposite the copy instead of a picture. */
  readonly mascot?: boolean;
}

interface Figure {
  readonly id: string;
  readonly alt: string;
  readonly w: number;
  readonly h: number;
}

/**
 * 🔴 THESE ARE THE PRODUCT'S OWN RENDERER, NOT DRAWINGS OF IT.
 *
 * Each one was captured from `/dev-preview/visual-cards` in the web app, which mounts
 * `SemanticVisual` — the exact component the Canvas mounts — against a hand-written spec, with no
 * model and no network in the loop. So the plot really is the app's plot renderer, and the aspirin
 * ring really was computed from its SMILES string rather than positioned by hand.
 *
 * That distinction is the entire reason the animated Canvas mock came off this page. Replacing one
 * drawing of the product with another drawing of the product would have changed nothing.
 *
 * To re-capture after a renderer change: run the web app, then
 * `node cardshot.mjs` against /dev-preview/visual-cards?only=<id>, and re-encode at q88.
 */
const FIGURES: readonly Figure[] = [
  { id: "plot", alt: "A plot of plasma concentration against time at two doses, with labelled axes and a legend.", w: 1416, h: 800 },
  { id: "structure", alt: "The structure of acetylsalicylic acid, drawn from its SMILES string.", w: 1416, h: 712 },
  { id: "construction", alt: "A 3-4-5 right triangle with its three angles marked and its sides labelled.", w: 1416, h: 842 },
  { id: "vectors", alt: "A free body diagram of a block resting on a thirty degree incline, with weight, normal force and friction.", w: 1416, h: 884 },
  { id: "relationship", alt: "A causal chain from action potential through calcium release to contraction.", w: 1416, h: 1042 },
  { id: "table", alt: "A table of current assets with a recomputed total.", w: 1416, h: 606 },
  { id: "timeline", alt: "A timeline of the American revolutionary period, showing moments and one span.", w: 1416, h: 496 },
  { id: "code", alt: "Python source for summing a list, with a stepped trace of the accumulator.", w: 1416, h: 746 },
  { id: "equation", alt: "First order elimination, type-set as an equation.", w: 1416, h: 350 },
];

const BANDS: readonly Band[] = [
  {
    id: "see",
    art: "/nemesis/art/see.webp",
    blur: SEE_BLUR,
    head: "See it",
    body: "Plots and molecules, geometry and force diagrams, tables, timelines, code traces.",
    figures: FIGURES,
  },
  {
    id: "evidence",
    art: "/nemesis/art/evidence.webp",
    blur: EVIDENCE_BLUR,
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
            <Mascot size={210} tone="lit" />
          </div>
        ) : null}
      </div>

      {band.figures ? (
        <div className="wrap band-figs" data-reveal="up">
          {band.figures.map((fig) => (
            /* <picture> rather than next/image: each figure ships a light file and a
               dark file and picks between them on prefers-color-scheme, which is the
               convention every product shot on this site follows and which
               next/image has no art-direction API for. They are already WebP and
               already sized. */
            <picture key={fig.id}>
              <source
                media="(prefers-color-scheme: dark)"
                srcSet={`/nemesis/figures/${fig.id}-dark.webp`}
              />
              <img
                src={`/nemesis/figures/${fig.id}-light.webp`}
                alt={fig.alt}
                width={fig.w}
                height={fig.h}
                decoding="async"
                loading="lazy"
              />
            </picture>
          ))}
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
