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
import { cn } from "@/lib/utils";
import type { HighlightTarget, StructureVisual } from "@/lib/learn/canvas-visual";
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

export function ChemicalStructure({ compact = false, visual }: {
  /**
   * One frame of a bigger scheme, so the provenance line belongs to the scheme and not to this
   * frame. Without it a five-step mechanism prints its own SMILES five times down the page.
   */
  compact?: boolean;
  visual: StructureVisual;
}) {
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
        // 🔴🔴🔴 LINE ART, NOT A RAINBOW. Owner, 2026-08-25, looking at a mechanism: *"im talking
        // about the style and design, it looks janky."* He was right, and the cause is the theme we
        // were asking for. Passing the APP's theme name selects the library's `light` or `dark`
        // palette, which colours oxygen red, nitrogen blue and bromine orange AND SPLITS EVERY BOND
        // DOWN THE MIDDLE so a C-O line is half black and half red. At the size a molecule renders
        // in a column that reads as a patchy, half-finished drawing.
        //
        // 🔴 IT IS ALSO THE ONLY RAINBOW IN THE PRODUCT. `surface-plot.tsx` states the house rule in
        // its own comment: this product is deliberately monochrome. Every other drawing on the
        // canvas is ink on paper, and the chemistry lane was quietly exempt.
        //
        // 🔴 A TEXTBOOK MECHANISM IS BLACK LINE ART, which is what the owner's own reference is.
        // Colour is kept for the two things that MEAN something: the electron arrows, and the cover
        // over the part a learner is being asked to name. Spending it on "oxygen is red" leaves
        // nothing for either.
        const ink = theme === "dark" ? "#e8eaed" : "#111418";
        const MONOCHROME = Object.fromEntries(
          ["C", "O", "N", "F", "CL", "BR", "I", "P", "S", "B", "SI", "H", "F", "FOREGROUND"].map((element) => [element, ink]),
        );
        const options = {
          // 🔴 REGISTERED UNDER BOTH NAMES THE DRAWER MIGHT BE ASKED FOR, because the theme argument
          // below is the APP's word ("light"/"dark") and the library looks it up by that name.
          themes: { dark: { ...MONOCHROME, BACKGROUND: "#0b0d11" }, light: { ...MONOCHROME, BACKGROUND: "#ffffff" } },
          compactDrawing: false,
          // 🔴🔴🔴 A REAL FAMILY, BECAUSE "inherit" TOOK THE FONT SIZE DOWN WITH IT. The drawer writes
          // its labels as `font: 11pt ${fontFamily}`, and `inherit` is a CSS-wide keyword that the
          // `font` SHORTHAND does not accept in the family slot. One invalid token voids the WHOLE
          // declaration, so the size went with the family and every atom label fell back to whatever
          // the page was set to. Measured on the rendered SVG: no `font-size` attribute, no inline
          // style, computed 15.5px, against a layout the drawer had computed for 11pt.
          //
          // 🔴 IT IS NOT MAINLY ABOUT THOSE FEW PIXELS. It means the labels were sized by the READER'S
          // text-size setting while the bonds were not, so a learner who scales the page up gets a
          // molecule whose letters grow and whose skeleton does not, until the labels swallow it.
          // Nothing in the drawing is supposed to answer to the page.
          fontFamily: "var(--font), system-ui, sans-serif",
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
          // 🔴🔴🔴 THE SIXTH ARGUMENT IS NOT "THE ATOMS TO PICK OUT", AND BELIEVING IT WAS PAINTED
          // EVERY MOLECULE NEON GREEN. The library matches `atom.class === highlight[0]` — an atom
          // CLASS, the `:n` you write inside brackets as `[C:1]`, not a position — and expects
          // `[class, colour]` PAIRS. We passed bare indices, so `highlight[0]` was `undefined` and
          // `atom.class` is `undefined` on every atom that has no class: `undefined === undefined`
          // matched the WHOLE MOLECULE, and `highlight[1]` being `undefined` fell back to the
          // library's own `#03fc9d`. Measured on aspirin with `highlight: [0, 2]`: 26 highlight
          // circles, one per atom, in a green nobody chose. It is drawn below instead, from the
          // index space the contract actually promises.
          drawer.draw(parsed, element, theme, null, false, []);
          overlap = drawer.getTotalOverlapScore();
          chargesReadLast(element);
          if (visual.highlight?.length) drawHighlights(element, drawer, visual.highlight);
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
        // 🔴 THE SIZE IS SET BY `fitViewBoxToInk`, IN PIXELS, FROM THE DRAWING'S OWN UNITS. This
        // class deliberately states no height: a constant here is what made ethanol as tall as a
        // steroid. `max-w-full` still catches a wide reaction scheme, which scales uniformly rather
        // than distorting.
        // 🔴 NO HEIGHT HERE, AND A CLASS COULD NOT SUPPLY ONE ANYWAY. `fitViewBoxToInk` writes the
        // height as an INLINE style, which beats any class, so `h-auto` here was tried and did
        // nothing at all: the letterbox it was meant to remove had to be fixed where the height is
        // actually written. See the aspect-ratio note in `fitViewBoxToInk`.
        className="mx-auto block max-w-full"
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
        className={cn(
          "mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary)",
          compact && "hidden",
        )}
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

/**
 * Move a formal charge to the end of the atom's label, where a chemist writes it.
 *
 * 🔴🔴🔴 THE OWNER, 2026-08-26: *"the electron 'OH⁻' is not correct."* He is right, and it is a bug
 * in the drawer rather than a missing feature. `SvgWrapper.drawText` welds the charge onto the
 * element symbol BEFORE it appends the hydrogens:
 *
 *     let display = elementName;                      // "O"
 *     if (charge) display += unicodeCharge(charge);   // "O⁻"   ← fused here
 *     text.push([display, elementName]);
 *     if (hydrogens === 1) text.push(['H', 'H']);     // "H"    ← always after
 *
 * So the pieces can only ever be `["O⁻", "H"]`, and the only two labels reachable are `O⁻H` and,
 * mirrored, `HO⁻`. `OH⁻` is not expressible. Measured on the four ions the owner named:
 *
 *     [OH-]   → "O⁻H"    wanted OH⁻
 *     [NH2-]  → "N⁻H₂"   wanted NH₂⁻
 *     [NH4+]  → "N⁺H₄"   wanted NH₄⁺
 *     [OH3+]  → "O⁺H₃"   wanted OH₃⁺
 *
 * 🔴 THE RULE IS UNIFORM AND NEEDS NO SPECIAL CASES: the charge goes LAST. A leftward label is
 * already correct because the element is last there and the charge rides with it (`CC[NH3+]` draws
 * "H₃N⁺"), so those are left untouched — the guard is simply "is the charge already on the final
 * piece?".
 *
 * 🔴 THE GEOMETRY IS UNAFFECTED, WHICH IS WHY THIS IS SAFE TO DO AFTER THE DRAW. The same glyphs
 * are laid out in a different order, so the run is the same width; the element symbol keeps its
 * place at the anchor; and the mask radius is computed from the ELEMENT NAME, which never moves.
 *
 * 🔴 AND IT IS DONE HERE RATHER THAN IN THE LIBRARY. `smiles-drawer` stays vendored and unedited,
 * which is the standing rule for it; this file already runs a pass over the finished drawing.
 */
function chargesReadLast(element: SVGSVGElement): void {
  // `createUnicodeCharge` emits ⁺ or ⁻, optionally preceded by a superscript magnitude for |n| > 1.
  const CHARGE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]*[⁺⁻]$/u;
  for (const label of element.querySelectorAll("text")) {
    const pieces = [...label.querySelectorAll("tspan")];
    if (pieces.length < 2) continue;
    // Only the piece that is not last can be holding a charge in the wrong place.
    const carrier = pieces.findIndex((piece, index) => index < pieces.length - 1 && CHARGE.test(piece.textContent ?? ""));
    if (carrier < 0) continue;
    const held = pieces[carrier]!;
    const charge = (held.textContent ?? "").match(CHARGE)?.[0];
    if (!charge) continue;
    held.textContent = (held.textContent ?? "").slice(0, -charge.length);
    // 🔴 NO x/y OF ITS OWN, so it flows straight after the final piece. A stacked label ("C" over
    // "H₃") writes an explicit y on each piece; inheriting nothing keeps the charge on that last
    // line rather than starting a third one.
    const moved = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    moved.textContent = charge;
    const last = pieces[pieces.length - 1]!;
    last.after(moved);
  }
}

/** Just enough of the library's parsed structure to put a mark under an atom or a bond. */
interface DrawnVertex {
  readonly position?: { x: number; y: number };
}

interface DrawnGraph {
  readonly vertices?: DrawnVertex[];
  readonly edges?: Array<{ sourceId?: number; targetId?: number }>;
}

/**
 * Draw the marks that say "this is the part we are talking about".
 *
 * 🔴🔴🔴 THE LIBRARY'S OWN HIGHLIGHT ARGUMENT IS NOT WHAT THE CONTRACT PROMISES, AND WE HAD BEEN
 * PASSING IT NONSENSE SINCE THE FIELD SHIPPED. `SvgDrawer.drawAtomHighlights` tests
 * `atom.class === highlight[0]` and paints with `highlight[1]`: it wants `[atomClass, colour]`
 * pairs, where the class is the `:n` written inside brackets in the notation (`[C:1]`), and it has
 * nothing to do with position. We passed `number[]`, so `highlight[0]` was `undefined`, `atom.class`
 * is `undefined` on any atom without a class, and `undefined === undefined` matched EVERY ATOM.
 * Measured on aspirin with `highlight: [0, 2]`: 26 highlight circles in `#03fc9d`, the library's
 * fallback green. The whole molecule lit up, in a colour this product does not own.
 *
 * 🔴 SO IT IS DRAWN HERE, FROM THE INDEX SPACE THE CONTRACT ACTUALLY STATES, and that also buys the
 * thing the library cannot do at all: a BOND highlight. A pair of indices is the bond between them,
 * exactly as it reads everywhere else in this contract.
 *
 * 🔴 UNDERNEATH, NEVER OVER. A mark painted on top of a bond hides the bond it is pointing at, so
 * the group is inserted before the drawing rather than appended after it.
 *
 * 🔴 `var(--ui-accent)` RATHER THAN A BAKED COLOUR: this element is ours, lives in the page's DOM,
 * and follows a theme switch with no redraw.
 */
function drawHighlights(
  element: SVGSVGElement,
  drawer: { preprocessor?: { graph?: DrawnGraph } },
  targets: readonly HighlightTarget[],
): void {
  const graph = drawer.preprocessor?.graph;
  if (!graph?.vertices) return;
  const NS = "http://www.w3.org/2000/svg";
  const at = (index: number) => graph.vertices?.[index]?.position;
  const group = document.createElementNS(NS, "g");
  group.setAttribute("data-highlight", "");
  // 🔴 THE WASH IS ON THE GROUP, NOT ON EACH MARK, AND THAT IS NOT TIDINESS. A step almost always
  // names an atom AND a bond that atom is in, so the two marks overlap; per-shape opacity compounds
  // there into a dark blob twice the weight of the rest of the highlight. One group-level value
  // makes any number of overlapping marks read as a single even wash.
  group.setAttribute("opacity", String(HIGHLIGHT_OPACITY));

  for (const target of targets) {
    if (Array.isArray(target)) {
      // A bond: a soft stroke laid along it.
      const from = at(target[0]);
      const to = at(target[1]);
      // 🔴 AN INDEX THE MOLECULE DOES NOT HAVE MARKS NOTHING, the same semantics the rest of this
      // contract keeps: a wrong claim about a structure draws nothing rather than something invented.
      if (!from || !to) continue;
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", String(from.x));
      line.setAttribute("y1", String(from.y));
      line.setAttribute("x2", String(to.x));
      line.setAttribute("y2", String(to.y));
      line.setAttribute("stroke", "var(--ui-accent)");
      line.setAttribute("stroke-width", String(HIGHLIGHT_BOND));
      line.setAttribute("stroke-linecap", "round");
      group.append(line);
      continue;
    }
    const point = at(target as number);
    if (!point) continue;
    const ball = document.createElementNS(NS, "circle");
    ball.setAttribute("cx", String(point.x));
    ball.setAttribute("cy", String(point.y));
    ball.setAttribute("r", String(HIGHLIGHT_ATOM));
    ball.setAttribute("fill", "var(--ui-accent)");
    group.append(ball);
  }
  if (!group.childNodes.length) return;

  // Behind the structure, but after <style> and <defs>, which paint nothing.
  const firstDrawn = [...element.children].find((node) => node.tagName === "g");
  if (firstDrawn) element.insertBefore(group, firstDrawn);
  else element.append(group);
}

/**
 * How a highlight is drawn, in the drawing's own units where a bond is 30 long.
 *
 * 🔴 A WASH, NOT A HIGHLIGHTER PEN. The mark exists to answer "which one?" while the learner reads
 * the step beside it, so it has to be findable at a glance and still leave the structure legible
 * through it. Solid accent at full strength turns a molecule into a silhouette.
 */
const HIGHLIGHT_ATOM = 7.5;
const HIGHLIGHT_BOND = 6;
const HIGHLIGHT_OPACITY = 0.22;
const WIDTH = 480;
const HEIGHT = 320;

/** Breathing room around the drawing, in the SVG's own units. */
const INK_MARGIN = 2;

/**
 * How many screen pixels one of the drawing's own units is worth.
 *
 * 🔴🔴 THIS REPLACES A HARDCODED HEIGHT, AND THE HEIGHT WAS THE BUG. Owner, twice, then a third
 * time: *"why is the figure still too big?"* Measured on production — figure 420x217, svg 382x150,
 * viewBox aspect matching the box exactly. Nothing was letterboxed and nothing was wasted: the box
 * was big because `h-[150px]` said so.
 *
 * A fixed height is the wrong instrument. It makes ethanol — two carbons — exactly as tall as a
 * steroid, so the simplest molecules look enormous and the most complex ones look cramped. Scale is
 * the thing that should be constant, not size: at a fixed px-per-unit a small molecule draws small,
 * a big one draws big, and a bond is the same length in both.
 *
 * 3.2 is measured off the drawer's own geometry — its bond length is ~26 units, which lands at
 * ~83px here, close to the 90px ChatGPT's inline chemistry uses and comfortably legible.
 */
const PX_PER_UNIT = 3.2;

/** Nothing draws taller than this, however many rings it has. */
const MAX_DRAWN_HEIGHT = 200;

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
    const w = ink.width + m * 2;
    const h = ink.height + m * 2;
    element.setAttribute("viewBox", `${ink.x - m} ${ink.y - m} ${w} ${h}`);

    // 🔴 THE DRAWN SIZE COMES FROM THE DRAWING, NOT FROM A CONSTANT. See `PX_PER_UNIT`: a fixed
    // height made a two-carbon molecule as tall as a steroid. Written as inline width/height so the
    // element has an intrinsic size again — refitting the viewBox is what took its old one away,
    // and `w-auto` with nothing to resolve against is how ethanol once rendered 60px across.
    const scale = Math.min(PX_PER_UNIT, MAX_DRAWN_HEIGHT / h);
    element.style.width = `${Math.round(w * scale)}px`;
    // 🔴🔴🔴 THE HEIGHT FOLLOWS THE WIDTH, AND PINNING BOTH IS WHAT LETTERBOXED EVERY NARROW FRAME.
    // An inline height beats `max-w-full`: the width shrinks to fit the column and the height stays
    // where it was, so the box keeps its old size around a drawing that is now smaller. Measured in
    // a mechanism scheme with frames capped at 236px: content 237x124, box 236x200. Seventy-seven
    // pixels of nothing under every frame, which stacked into the band of white the owner saw
    // between two rows of a scheme and called janky.
    //
    // 🔴 THE ASPECT IS STATED RATHER THAN LEFT TO BE INFERRED. `height: auto` on an SVG resolves
    // through its intrinsic ratio, and this element's ratio has just been rewritten underneath it by
    // `setAttribute("viewBox", …)`. Saying it outright cannot be got wrong by a browser that decides
    // to read the old one.
    element.style.aspectRatio = `${w} / ${h}`;
    element.style.height = "auto";
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
