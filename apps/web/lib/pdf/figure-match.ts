/**
 * Giving Docling's figures their pixels.
 *
 * 🔴 WITHOUT THIS, ROUTING PDFS TO DOCLING WOULD LOSE FIGURE DESCRIPTIONS WE
 * ALREADY PRODUCE. Docling DETECTS pictures — 1,220 of them across the corpus'
 * PDFs — and never looks at one. Our own lane detects them AND sends the ones
 * worth seeing to a vision model. So a straight swap would trade "0 tables,
 * figures described" for "349 tables, no figure ever described", and every
 * Docling-parsed PDF would sit at coverage state `partial` forever, because
 * every picture would be `not-examined` with nothing able to move it.
 *
 * The two halves each have what the other lacks. Docling knows WHERE the figures
 * are and which ones are semantically figures. PDF.js has the actual embedded
 * image bytes, already decoded, because it walked the page's operator list. This
 * module joins them by geometry so the existing vision pass — `planFigureVision`
 * and its 3%-of-page area filter, `lookAtFigures`, the 40-per-document budget —
 * runs unchanged over a Docling model.
 *
 * 🔴 IT MATCHES, IT DOES NOT MERGE. Nothing here adds a block, moves a block or
 * changes a rectangle. Docling's model stays exactly as the adapter built it;
 * the only output is a lookup table of pixels. A figure with no match keeps its
 * `not-examined` state, which is the truth: nobody could look at it.
 *
 * PURE. Geometry in, a map out — no pdf.js, no network, no model mutation.
 */

import type { DocBlock, DocRect, DocumentModel } from "@nemesis/shared";

import type { CapturedFigure } from "./structure";

/**
 * How much two rectangles must agree before they are called the same figure.
 *
 * Expressed as intersection over the SMALLER area rather than intersection over
 * union, because the two readers legitimately disagree about a figure's extent:
 * Docling's box often includes the caption underneath, PDF.js's is the image
 * draw operation alone. Punishing that difference with an IoU denominator would
 * reject correct matches for a picture with a two-line caption.
 *
 * 🔴 THIS NUMBER IS MEASURED, NOT CHOSEN — see `scripts/bakeoff-figure-match.mts`
 * and the distribution it prints over the corpus. Changing it without re-running
 * that is how a threshold quietly starts sending the wrong pixels to a vision
 * model, and a wrong description is worse than a missing one because nothing
 * downstream can tell it is wrong.
 */
export const MIN_CONTAINMENT = 0.5;

export interface FigureMatchReport {
  /** Figure blocks in the target model. */
  targetFigures: number;
  /** …of which this many now have pixels. */
  matched: number;
  /** …and this many do not, and will honestly stay `not-examined`. */
  unmatched: number;
  /** Figures the source captured that nothing in the target claimed. */
  unusedSources: number;
  /** Target figures with no rectangle at all — geometry cannot help them. */
  withoutRect: number;
}

export interface FigureMatchResult {
  /** Keyed `unit:ref` in the TARGET's terms, which is what `lookAtFigures` reads. */
  images: Map<string, CapturedFigure>;
  report: FigureMatchReport;
}

/** Overlap as a share of the smaller rectangle. 0 when either has no area. */
export function containment(a: DocRect, b: DocRect): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  const overlap = (right - left) * (bottom - top);
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  if (!(smaller > 0)) return 0;
  return overlap / smaller;
}

interface Placed {
  key: string;
  unit: number;
  rect: DocRect;
}

/** Figure blocks that carry both a reference and a rectangle, in document order. */
function placedFigures(model: DocumentModel): Placed[] {
  const out: Placed[] = [];
  for (const block of model.blocks) {
    if (block.kind !== "figure") continue;
    const ref = block.figure?.ref;
    if (!ref || !block.rect) continue;
    out.push({ key: `${block.unit}:${ref}`, unit: block.unit, rect: block.rect });
  }
  return out;
}

/**
 * Pair the target model's figures with the source model's captured pixels.
 *
 * Greedy best-first over every candidate pair, so a page with two overlapping
 * pictures cannot give both of them the same image: each source figure is
 * consumed once. Sorting by overlap first means the clearest pairing wins before
 * a weaker one can steal its partner — the alternative, matching in document
 * order, hands the first Docling figure whatever it happens to overlap.
 */
export function matchFigureImages(
  target: DocumentModel,
  source: DocumentModel,
  images: ReadonlyMap<string, CapturedFigure>,
  options: { minContainment?: number } = {},
): FigureMatchResult {
  const threshold = options.minContainment ?? MIN_CONTAINMENT;
  const targets = placedFigures(target);
  // Only sources whose pixels were actually captured are worth pairing: a match
  // to a figure with no image teaches us nothing and consumes a candidate.
  const sources = placedFigures(source).filter((s) => images.has(s.key));

  const targetFigures = target.blocks.filter((block) => block.kind === "figure").length;
  const withoutRect = targetFigures - targets.length;

  const pairs: { score: number; target: number; source: number }[] = [];
  for (let t = 0; t < targets.length; t += 1) {
    for (let s = 0; s < sources.length; s += 1) {
      // Same page or nothing. Two engines agreeing on a rectangle across
      // different pages is a coincidence, not a match.
      if (targets[t]!.unit !== sources[s]!.unit) continue;
      const score = containment(targets[t]!.rect, sources[s]!.rect);
      if (score >= threshold) pairs.push({ score, source: s, target: t });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const out = new Map<string, CapturedFigure>();
  const usedTargets = new Set<number>();
  const usedSources = new Set<number>();
  for (const pair of pairs) {
    if (usedTargets.has(pair.target) || usedSources.has(pair.source)) continue;
    const image = images.get(sources[pair.source]!.key);
    if (!image) continue;
    usedTargets.add(pair.target);
    usedSources.add(pair.source);
    out.set(targets[pair.target]!.key, image);
  }

  return {
    images: out,
    report: {
      matched: out.size,
      targetFigures,
      unmatched: targetFigures - out.size,
      unusedSources: sources.length - usedSources.size,
      withoutRect,
    },
  };
}
