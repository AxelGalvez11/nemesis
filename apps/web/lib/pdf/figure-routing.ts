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
 * Sized from the measurement: 1,089 unexamined figures across 120 files averages
 * ~9 per file, and 40 covers all but the outliers.
 */
export const MAX_FIGURES_PER_DOC = 40;

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

export interface RoutingPlan {
  candidates: FigureCandidate[];
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
  model.blocks.forEach((block, blockIndex) => {
    if (block.kind !== "figure" || !block.figure) return;
    // Already examined, or already skipped for a stated reason. Re-examining a
    // figure we called decorative would spend a call to reach the same verdict.
    if (block.figure.description || block.figure.skipped) return;

    const area = block.rect ? block.rect.width * block.rect.height : 0;
    const thinUnit = (textByUnit.get(block.unit) ?? 0) < THIN_UNIT_CHARS;
    // 🔴 OR, NOT AND. A large figure qualifies on a page dense with text — which
    // is the exact 326-page population production cannot see.
    if (area < WORTH_LOOKING_AREA && !thinUnit) return;

    candidates.push({
      area,
      because: area >= WORTH_LOOKING_AREA ? "large-figure" : "thin-unit",
      blockIndex,
      ref: block.figure.ref ?? `block-${blockIndex}`,
      unit: block.unit,
    });
  });

  candidates.sort((a, b) => b.area - a.area || a.blockIndex - b.blockIndex);
  return {
    candidates: candidates.slice(0, maxFigures),
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
 */
export function applyFigureDescriptions(
  model: DocumentModel,
  results: ReadonlyMap<number, { description?: string; skipped?: string }>,
): DocumentModel {
  if (results.size === 0) return model;
  const blocks: DocBlock[] = model.blocks.map((block, index) => {
    const result = results.get(index);
    if (!result || block.kind !== "figure" || !block.figure) return block;
    const described = result.description?.trim();
    return {
      ...block,
      figure: {
        ...block.figure,
        ...(described
          ? { description: described }
          : { skipped: (result.skipped ?? "examined-empty") as NonNullable<DocBlock["figure"]>["skipped"] }),
      },
      // The caption stays whatever the document said. A description is what a
      // model saw; a caption is what the author wrote, and merging them would
      // make a generated sentence quotable as the document's own words.
      text: block.text,
    };
  });
  return { ...model, blocks };
}
