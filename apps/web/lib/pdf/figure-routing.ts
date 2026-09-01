/**
 * Deciding which figures are worth looking at. PURE, and the whole point of it
 * is what it does *not* use.
 *
 * 🔴 TEXT SPARSITY ALONE IS THE DEFECT, NOT THE RULE.
 *
 * Production routes vision by one signal: does this page have enough native
 * text? Measured over 120 real course PDFs / 952 pages, that rule guarantees
 * **326 pages (34.2%) carrying 1,807 figures across 80 files are never looked
 * at** — every one of them a page with three paragraphs and a load-bearing
 * diagram. A page being wordy says nothing about whether its diagram carries the
 * argument. In a mechanics text the free-body diagram *is* the content; in a
 * statute the same page shape holds a decorative seal. Sparsity cannot tell them
 * apart because it never looks.
 *
 * So the predicate is: **an unexamined figure large enough to hold something,
 * OR a page whose text is thin.** The two are independent, and either is
 * sufficient. Thin text is kept because a scanned page has no figure block at
 * all — its words are pixels — so dropping it would trade one blind spot for
 * another.
 *
 * Everything here is a function of the model plus a budget. No network, no
 * pdf.js, no environment.
 */

import type { DocBlock, DocumentModel } from "@nemesis/shared";

import type { FigureLabel } from "@/lib/learn/figure-labels";

/**
 * A figure must cover at least this share of its page to be worth a call.
 *
 * Above the `too-small` furniture line in `structure.ts` (1%) on purpose. That
 * line asks "is this a figure at all"; this one asks "is it worth paying to
 * look at". A 2% figure is a real graphic and a poor use of a call when a
 * document holds two hundred of them.
 */
export const WORTH_LOOKING_AREA = 0.03;

/**
 * Characters of native text below which a page is treated as thin.
 *
 * The same threshold the existing page-vision path uses, kept identical so the
 * two routes cannot disagree about the same page.
 */
export const THIN_UNIT_CHARS = 120;

/**
 * The most figures one document will pay to examine.
 *
 * 🔴 A CAP THAT TRUNCATES MUST SAY SO. Everything beyond it keeps the
 * `not-examined` reason it already has, which coverage counts as lost — so a
 * document that hit the ceiling reports a gap rather than reporting completion.
 *
 * 🔴🔴🔴 IT WAS 40, SIZED ON AN AVERAGE, AND AN AVERAGE IS THE WRONG STATISTIC FOR A CEILING.
 * The old note read: "1,089 unexamined figures across 120 files averages ~9 per file, and 40
 * covers all but the outliers." Measured on the owner's own canvas 2026-09-01
 * (`5330d682-9449-40f1-b454-5d477ddea950`, "06. Antigen Processing and Presentation"): **77
 * pictures were not read**. A lecture deck exported to PDF is not an outlier, it is the shape of
 * the corpus this product exists to read, and the tail is where every one of them lives. The
 * owner, on that canvas: *"I want it to read everything… I need to see important figures, the
 * graphs, the tables."*
 *
 * 🔴🔴 AND THE FIGURES IT DROPPED HAD ALREADY PASSED THE FURNITURE FILTER. `WORTH_LOOKING_AREA`
 * declines a small image on a text-dense page as `too-small` BEFORE this cap is reached, so
 * everything counted here is a figure large enough to be worth a call. The 77 were diagrams, not
 * logos. Sorting by area and taking the first 40 is not a quality filter; it is losing the
 * smallest three-quarters of a lecture's real content.
 *
 * 🔴 RAISING IT COSTS NOTHING, WHICH IS WHY IT IS 120 AND NOT A NUMBER CHOSEN FOR NERVE.
 * `vision-budget.ts` added `DEFAULT_DOCUMENT_UNIT_CAP` (120 units, every lane, every attempt)
 * AFTER this constant was written, and its own header says this one "is a good rule, but it is
 * three things short of a budget" — then builds the budget. A second, tighter, UNPRICED ceiling
 * below the priced one does not save money the ledger was not already going to save; it only
 * decides, silently and on one lane, which content is lost first. Matching the two makes the
 * priced ceiling the ONLY ceiling, which is where a cost decision belongs.
 *
 * 🔴 SO THE SPEND IS UNCHANGED. A document could already spend 120 units on pages; it can now
 * spend them on figures instead. What moved is which lane may reach the ceiling, never the
 * ceiling. Raising THAT is still the priced decision `docs/vision-cost.md` describes.
 */
export const MAX_FIGURES_PER_DOC = 120;

export interface FigureCandidate {
  /** Index into `model.blocks`, so a description can be written back exactly. */
  blockIndex: number;
  unit: number;
  ref: string;
  /** Share of its page, 0..1. Used only for ordering and the worth-looking test. */
  area: number;
  /** Why this candidate was selected. Recorded so a run can be explained. */
  because: "large-figure" | "thin-unit";
}

/** A figure the router itself refused, and the reason it refused it. */
export interface DeclinedFigure {
  blockIndex: number;
  skipped: "too-small" | "over-cap";
}

export interface RoutingPlan {
  candidates: FigureCandidate[];
  /**
   * Figures this router declined, each with the reason.
   *
   * 🔴🔴 THE ROUTER USED TO DECLINE IN SILENCE, WHICH IS THE ONE THING THIS VOCABULARY FORBIDS.
   * A figure below the worth-looking area on a text-dense page was dropped with a bare `return`
   * and reached storage carrying no verdict — indistinguishable from a figure nothing ever looked
   * at. `lookAtFigures` already takes great care to name every absence it can see; it could not
   * name the ones that never reached it.
   */
  declined: DeclinedFigure[];
  /**
   * Figures that qualified and did not fit the budget.
   *
   * Not "figures we skipped" — those are already classified. These are figures
   * we WOULD have examined, and the number exists so the truncation is
   * countable instead of implicit in a shorter list.
   */
  overBudget: number;
}

/**
 * Which figures in this document should be examined, in priority order.
 *
 * Ordered largest-first within the document. When a budget bites, the figure
 * most likely to carry the argument is the one that survives — and "largest on
 * its page" is a structural proxy that means the same thing in a physics text
 * and a property deed.
 */
export function planFigureVision(
  model: DocumentModel,
  options: { maxFigures?: number } = {},
): RoutingPlan {
  const maxFigures = options.maxFigures ?? MAX_FIGURES_PER_DOC;
  const textByUnit = new Map<number, number>();
  for (const block of model.blocks) {
    if (block.kind === "figure") continue;
    textByUnit.set(block.unit, (textByUnit.get(block.unit) ?? 0) + block.text.length);
  }

  const candidates: FigureCandidate[] = [];
  const declined: DeclinedFigure[] = [];
  model.blocks.forEach((block, blockIndex) => {
    if (block.kind !== "figure" || !block.figure) return;
    // Already examined, or already skipped for a stated reason. Re-examining a
    // figure we called decorative would spend a call to reach the same verdict.
    if (block.figure.description || block.figure.skipped) return;

    const area = block.rect ? block.rect.width * block.rect.height : 0;
    const thinUnit = (textByUnit.get(block.unit) ?? 0) < THIN_UNIT_CHARS;
    // 🔴 OR, NOT AND. A large figure qualifies on a page dense with text — which
    // is the exact 326-page population production cannot see.
    if (area < WORTH_LOOKING_AREA && !thinUnit) {
      // Judged, not overlooked: too small to be worth a call on a page that already has words.
      declined.push({ blockIndex, skipped: "too-small" });
      return;
    }

    candidates.push({
      area,
      because: area >= WORTH_LOOKING_AREA ? "large-figure" : "thin-unit",
      blockIndex,
      ref: block.figure.ref ?? `block-${blockIndex}`,
      unit: block.unit,
    });
  });

  candidates.sort((a, b) => b.area - a.area || a.blockIndex - b.blockIndex);
  // 🔴 THE ONES PAST THE CEILING ARE NAMED TOO. The comment on `MAX_FIGURES_PER_DOC` says they
  // "keep the `not-examined` reason they already have" — which was true and was the problem: a
  // truncated document and an unexamined one read identically afterwards.
  for (const over of candidates.slice(maxFigures)) declined.push({ blockIndex: over.blockIndex, skipped: "over-cap" });
  return {
    candidates: candidates.slice(0, maxFigures),
    declined,
    overBudget: Math.max(0, candidates.length - maxFigures),
  };
}

/**
 * Fold descriptions back into the model, and record every refusal as a reason.
 *
 * 🔴 A FIGURE THAT WAS LOOKED AT AND YIELDED NOTHING IS NOT THE SAME AS ONE
 * NOBODY LOOKED AT. The first is `examined-empty` — a disclosed decision. The
 * second keeps no reason at all, which is what makes it countable as lost. This
 * function is the only place that distinction is written, so it is the only
 * place it can be lost.
 *
 * 🔴 LABELS RIDE THE SAME RESULT, AND UNTIL NOW THERE WAS NOWHERE TO PUT THEM (§46.6). The caller
 * (`figure-look.ts`) already receives `{ description, labels }` off one `readFiguresWithVision`
 * reply — the PPTX lane's exact rule, "same call, two answers" — but this map's value type had no
 * `labels` slot, so a PDF diagram vision named parts in was silently reduced to its prose on the
 * way into the model. A photograph or a chart with no named parts still gets no `labels` field,
 * which is correct: absence here means "not a labelled diagram", never "not looked at".
 */
export function applyFigureDescriptions(
  model: DocumentModel,
  results: ReadonlyMap<number, { description?: string; skipped?: string; labels?: readonly FigureLabel[] }>,
): DocumentModel {
  if (results.size === 0) return model;
  const blocks: DocBlock[] = model.blocks.map((block, index) => {
    const result = results.get(index);
    if (!result || block.kind !== "figure" || !block.figure) return block;
    const described = result.description?.trim();
    const named = result.labels && result.labels.length > 0 ? result.labels : undefined;
    return {
      ...block,
      figure: {
        ...block.figure,
        ...(described
          ? { description: described }
          : { skipped: (result.skipped ?? "examined-empty") as NonNullable<DocBlock["figure"]>["skipped"] }),
        ...(named ? { labels: named } : {}),
      },
      // The caption stays whatever the document said. A description is what a
      // model saw; a caption is what the author wrote, and merging them would
      // make a generated sentence quotable as the document's own words.
      text: block.text,
    };
  });
  return { ...model, blocks };
}
