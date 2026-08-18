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
  | "structure-unparsable";

export function ChemicalStructure({ visual }: { visual: StructureVisual }) {
  const target = useRef<SVGSVGElement | null>(null);
  const [failure, setFailure] = useState<StructureFailure | null>(null);

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
        const drawer = new library.SvgDrawer({ height: HEIGHT, padding: 12, width: WIDTH });
        const parsed = library.Parser.parse(visual.value);
        if (cancelled) return;
        element.replaceChildren();
        drawer.draw(parsed, element, "light");
        if (!cancelled) setFailure(null);
      } catch {
        if (!cancelled) setFailure("structure-unparsable");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visual.value]);

  return (
    <div>
      {/* 🔴 THE SEAM FOR RETRIEVAL, NAMED BEFORE IT IS BUILT (§42). Hiding a group to ask "what
          belongs here?" attaches HERE, not in the library: the drawer emits one <text> element per
          heteroatom label and one <path> per bond, so an occlusion is a mask over the client
          rectangle of a chosen element — the same shape as `FigureOcclusion` over a source figure.
          What it needs first is a stable way to name the group being hidden, which SMILES atom
          indices give and the library does not currently expose on the emitted nodes. Recorded so
          the next person starts from the actual obstacle rather than from the idea. */}
      <svg
        aria-label={visual.learningGoal}
        className="h-auto w-full"
        ref={target}
        role="img"
        style={{ display: failure ? "none" : "block" }}
      />
      {failure ? (
        <p className="font-mono text-[length:var(--canvas-text-body)] text-(--ui-text-secondary)">{visual.value}</p>
      ) : null}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)">
        <span>{visual.value}</span>
        {visual.resolvedFrom ? (
          <span className="font-sans">
            {visual.resolvedFrom.provider} · {visual.resolvedFrom.name} · CID {visual.resolvedFrom.id}
          </span>
        ) : (
          // 🔴 SAID OUT LOUD RATHER THAN LEFT BLANK. A structure a model wrote and one a resolver
          // returned look identical on screen, and only one of them can be checked.
          <span className="font-sans">not resolved: this notation was asserted, not looked up</span>
        )}
        {statesStereochemistry(visual.value) ? <span className="font-sans">states stereochemistry</span> : null}
      </p>
    </div>
  );
}

const WIDTH = 480;
const HEIGHT = 320;
