"use client";

// Drawing a molecule from its notation — the chemistry half of §42's rung two.
//
// 🔴 THE KaTeX PATTERN, DELIBERATELY, DOWN TO THE FALLBACK. `Equation` hands LaTeX to a renderer
// and, when the renderer refuses, prints the source in monospace rather than an error. This does
// the same with SMILES, for the same reason: the teaching text around it stands on its own, and a
// box announcing an absence is the decoration §41 refuses.
//
// 🔴 THE LIBRARY IS LOADED IN AN EFFECT, NOT IMPORTED AT MODULE SCOPE, AND THAT IS NOT A
// PREFERENCE. `smiles-drawer` reaches for `document` and `SVGSVGElement` while drawing, so a
// top-level import pulls a browser-only module into the server bundle of every page that renders a
// Canvas block. It is also ~190KB minified, which is a lot to send to a learner reading a lesson
// that contains no chemistry at all. An effect-time dynamic import solves both.
//
// 🔴 WHAT IS DETERMINISTIC HERE AND WHAT IS NOT, MEASURED RATHER THAN ASSUMED. Atom positions and
// bond geometry are computed from the graph and are identical across renders — that is the whole
// claim §42 makes about this rung. The only randomness in the library is `makeid()`, which mints
// DOM ids for gradients and masks; those differ between renders and mean nothing. So determinism is
// asserted over path geometry, never over the serialised SVG string.
//
// 🔴 THE NOTATION IS SHOWN, NOT HIDDEN BEHIND THE PICTURE. §42 requires the canonical
// representation to stay inspectable: a learner, and anybody debugging a wrong-looking molecule,
// can read the exact string the drawing was computed from. This is also how a resolved structure
// visibly differs from one a model asserted.

import { useEffect, useRef, useState } from "react";

import { useTheme } from "@/components/theme-provider";
import type { StructureVisual } from "@/lib/learn/canvas-visual";
import { statesStereochemistry } from "@/lib/learn/chem-notation";

/** Why nothing was drawn. Named so a blank frame is diagnosable, exactly as elsewhere. */
type StructureFailure =
  /** The depiction library could not be loaded — offline, blocked, or not installed. */
  | "renderer-unavailable"
  /**
   * The library's own parser refused the string.
   *
   * 🔴 THIS IS THE REAL DEFENCE AND `chem-notation.ts` IS THE NAMED ONE, the same split
   * `canvas-visual.ts` keeps with KaTeX. The spec layer refuses prose, markup and unclosed rings
   * before anything loads; a valence nobody can draw is caught here, by the only code that knows.
   */
  | "structure-unparsable"
  /**
   * The layout came out overlapping badly enough that the drawing is not readable.
   *
   * 🔴 A REFUSAL THE LIBRARY MAKES POSSIBLE AND NOTHING WAS ASKING FOR. `getTotalOverlapScore()`
   * reports how much the computed geometry collides with itself — near zero for a clean molecule,
   * large when a crowded or bridged structure could not be laid out flat. A picture with atoms
   * sitting on top of one another is worse than the notation, and until this check existed
   * Nemesis would have shown it confidently. Measured: aspirin scores about 1e-15.
   */
  | "structure-unreadable";

export function ChemicalStructure({ visual }: { visual: StructureVisual }) {
  const target = useRef<SVGSVGElement | null>(null);
  const [failure, setFailure] = useState<StructureFailure | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    const element = target.current;
    if (!element) return;

    void (async () => {
      let library: typeof import("smiles-drawer").default;
      try {
        library = (await import("smiles-drawer")).default;
      } catch {
        if (!cancelled) setFailure("renderer-unavailable");
        return;
      }
      if (cancelled) return;
      try {
        // 🔴 A NEW DRAWER PER RENDER. `SvgDrawer` keeps an `svgWrapper` across draws and reuses it
        // unless told to clear; sharing one instance between two structures on a page is how the
        // second molecule ends up drawn on top of the first.
        //
        // 🔴 `compactDrawing: false`, AND THE DEFAULT WAS A REAL DEFECT. With it on — the library's
        // default — a small molecule is collapsed into condensed text: acetic acid renders as the
        // string "COOHCH3" with no bonds at all. Chemically correct and pedagogically useless, and
        // it hits exactly the tiny molecules a functional-group lesson is made of.
        //
        // 🔴 `showCarbons` CARRIES A TEACHING CHOICE FROM THE SPEC. Skeletal notation is what every
        // exam uses and is unreadable to somebody in their first week, who has to see that the bare
        // corners ARE carbons before the shorthand means anything.
        const options = {
          compactDrawing: false,
          fontFamily: "inherit",
          height: HEIGHT,
          padding: 12,
          ...(visual.carbons === "all" ? { showCarbons: "all" } : {}),
          width: WIDTH,
        };
        element.replaceChildren();

        let overlap = 0;
        if (visual.notation === "reaction-smiles") {
          // 🔴 A DIFFERENT DRAWER, NOT A DIFFERENT MODE. The reaction drawer lays out several
          // molecules, the plus signs between them and the arrow; the conditions ride ABOVE that
          // arrow as prose rather than being smuggled into the notation.
          const reaction = library.ReactionParser.parse(visual.value);
          if (cancelled) return;
          new library.ReactionDrawer({}, { ...options, height: HEIGHT, width: Math.round(WIDTH / 2.4) }).draw(
            reaction,
            element,
            theme,
            null,
            visual.conditions ?? "",
            visual.reactionLabel ?? "",
          );
        } else {
          const drawer = new library.SvgDrawer(options);
          const parsed = library.Parser.parse(visual.value);
          if (cancelled) return;
          // The fifth argument is `infoOnly`; the sixth is the atoms to pick out. Passing the
          // indices the spec carried is the whole of §42's "answerable-against" seam.
          drawer.draw(parsed, element, theme, null, false, visual.highlight ? [...visual.highlight] : []);
          overlap = drawer.getTotalOverlapScore();
        }

        if (cancelled) return;
        // A clean layout scores near zero. Past this the atoms are sitting on one another and the
        // notation below is the more honest thing to show.
        if (overlap > MAX_OVERLAP) {
          setFailure("structure-unreadable");
          element.replaceChildren();
          return;
        }
        setFailure(null);
        fitViewBoxToInk(element);
      } catch {
        if (!cancelled) setFailure("structure-unparsable");
      }
    })();

    return () => {
      cancelled = true;
    };
    // 🔴 THE THEME IS A DEPENDENCY, NOT A STYLE. The library bakes stroke and label colours into the
    // emitted SVG attributes rather than reading CSS, so a dark-mode toggle cannot repaint this
    // drawing — it has to be drawn again. Without `theme` here, switching to dark leaves a molecule
    // in near-black strokes on a near-black ground: invisible, with nothing on screen to say why.
  }, [theme, visual.carbons, visual.conditions, visual.highlight, visual.notation, visual.reactionLabel, visual.value]);

  return (
    <div>
      {/* 🔴 THE SEAM FOR RETRIEVAL, NAMED BEFORE IT IS BUILT (§42). Hiding a group to ask "what
          belongs here?" attaches HERE, not in the library: the drawer emits one <text> element per
          heteroatom label and one <path> per bond, so an occlusion is a mask over the client
          rectangle of a chosen element — the same shape as `FigureOcclusion` over a source figure.
          What it needs first is a stable way to name the group being hidden, which SMILES atom
          indices give and the library does not currently expose on the emitted nodes. Recorded so
          the next person starts from the actual obstacle rather than from the idea. */}
      {/* 🔴🔴 SIZED TO THE MOLECULE, NOT TO THE COLUMN, AND THE FIRST FIX GOT THIS HALF-RIGHT.
          `h-auto w-full` let the drawer's viewBox decide the aspect, and a small molecule has a
          nearly square one — so `CCO` painted a 650px-tall frame for three atoms. Capping the
          HEIGHT stopped that and left the other half standing: `w-full` still stretched three atoms
          across the full 640px column, and `object-contain` letterboxed the result into a large
          panel that is mostly empty.

          🔴 REPORTED 2026-08-20 WITH A SCREENSHOT: *"can you make the size of it be smaller to fit
          with the canvas sizing?"* — a hydroxyl group inside a box the width of the page.

          `w-auto` with a bound on both sides is the fix: the drawing renders at its own size,
          centred, and only shrinks when it is genuinely bigger than the column. A reaction scheme
          is wide and still fits; ethanol is small and now looks small. */}
      <svg
        aria-label={visual.learningGoal}
        // 🔴 AN EXPLICIT HEIGHT, BECAUSE FITTING THE VIEWBOX REMOVED THE INTRINSIC ONE. With the
        // library's padded viewBox, `w-auto` resolved to something column-sized; once the box was
        // refitted to the ink it resolved to the ink's own units and ethanol rendered about 60px
        // across — legible only in the sense that it was on screen. Measured both ways.
        //
        // Height fixed, width follows the aspect, and `max-w-full` still catches a wide reaction
        // scheme (which letterboxes rather than distorting: SVG scales uniformly).
        className="mx-auto block h-[150px] w-auto max-w-full"
        ref={target}
        role="img"
        style={{ display: failure ? "none" : "block" }}
      />
      {failure ? (
        <p className="font-mono text-[length:var(--canvas-text-body)] text-(--ui-text-secondary)">{visual.value}</p>
      ) : null}
      {/* 🔴🔴 THE PROVENANCE MOVED INTO A TOOLTIP, AND THE ARGUMENT FOR PRINTING IT STILL HOLDS.
          Owner circled this line, 2026-08-20: *"why does it show that thing that is circled?"* It
          read `CCO   not resolved: this notation was asserted, not looked up` under every drawing.

          🔴 IT WAS RIGHT ABOUT THE FACT AND WRONG ABOUT THE AUDIENCE. A structure a model wrote and
          one a resolver returned look identical on screen and only one can be checked — that is
          real and it is why this is not simply deleted. But "not resolved: this notation was
          asserted" is a sentence written for whoever built the pipeline, printed under a molecule
          for someone learning chemistry, in a product whose own rule is plain English.

          A LOOKED-UP structure still says so in the open, because that is the stronger claim and it
          names a source. An ASSERTED one carries it on hover: still checkable, no longer shouted.
          Silence would be the one wrong answer — it is what makes the two indistinguishable. */}
      <p
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)"
        title={visual.resolvedFrom ? undefined : `${visual.value}: written from the model's own knowledge, not looked up in a database`}
      >
        <span>{visual.value}</span>
        {visual.resolvedFrom ? (
          <span className="font-sans">
            {visual.resolvedFrom.provider} · {visual.resolvedFrom.name} · CID {visual.resolvedFrom.id}
          </span>
        ) : null}
        {statesStereochemistry(visual.value) ? <span className="font-sans">states stereochemistry</span> : null}
      </p>
    </div>
  );
}

const WIDTH = 480;
const HEIGHT = 320;

/** Breathing room around the drawing, in the SVG's own units. */
const INK_MARGIN = 3;

/**
 * Refit the emitted viewBox to what was actually drawn.
 *
 * 🔴🔴 TWO REPORTED DEFECTS, ONE CAUSE, AND I WOULD NOT HAVE GUESSED THEY WERE THE SAME. Owner,
 * 2026-08-20: *"ethanol did not render the 'H' in '-OH'"* and *"why are the figures unneccesarily
 * big?"*
 *
 * The library computes its viewBox from ATOM COORDINATES and then draws terminal labels — "HO",
 * "NH2", "COOH" — anchored OUTSIDE the last atom, with `text-anchor="end"`. Read off the live page:
 * viewBox x started at 62.99 while the "HO" label was anchored ending at 77.67, so the H hung off
 * the left edge and was clipped to the sliver of a vertical stem the owner circled. The same
 * mismatch leaves dead space on the other sides, which is the panel that reads as too big.
 *
 * `getBBox()` is the geometry the browser actually laid out, labels included, so fitting the box to
 * it fixes both at once: nothing can hang outside the frame, and the frame stops being mostly
 * empty.
 *
 * 🔴 IT RUNS AFTER THE DRAW AND NEVER TOUCHES THE DRAWING. No atom moves, no bond is rescaled, no
 * colour changes — only the window onto them. The library stays vendored and unedited, which is the
 * standing rule for it.
 *
 * 🔴 AND IT REFUSES ON AN EMPTY BOX. `getBBox()` throws on a detached node and returns zeroes for
 * an empty one; either would write `viewBox="0 0 0 0"` and blank a structure that had drawn
 * perfectly well.
 */
function fitViewBoxToInk(element: SVGSVGElement): void {
  try {
    const ink = element.getBBox();
    if (!(ink.width > 0) || !(ink.height > 0)) return;
    const m = INK_MARGIN;
    element.setAttribute("viewBox", `${ink.x - m} ${ink.y - m} ${ink.width + m * 2} ${ink.height + m * 2}`);
  } catch {
    // A node that is not laid out has no box to fit. Leaving the library's own viewBox is correct.
  }
}

/**
 * How much self-overlap makes a drawing worse than its notation.
 *
 * 🔴 CALIBRATED, NOT GUESSED. A clean molecule scores around 1e-15 — floating-point noise. The
 * score climbs with genuine collisions, so anything meaningfully above zero means atoms are being
 * drawn on top of one another. Set loose enough that a crowded but legible fused-ring system still
 * renders, and tight enough that a hairball does not.
 */
const MAX_OVERLAP = 1;
