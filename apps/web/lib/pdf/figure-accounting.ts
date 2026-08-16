/**
 * What happened to the pictures a PDF actually paints, when a vendor read the document.
 *
 * 🔴 THE QUESTION IS "DID THE CONTENT ARRIVE", NOT "DID A FIGURE ARRIVE", AND THE DIFFERENCE
 * IS THE WHOLE MODULE. Measured on the owner's real diabetes lecture (17 pages), the file
 * paints 9 image regions big enough to matter. Mistral returned 8 figure blocks and our own
 * reader finds 11 images, so a count comparison says "3 lost" and a figure-to-figure geometric
 * comparison says **5 lost**. Both are wrong. Five of those regions are SCREENSHOTS OF TABLES —
 * ADA Table 2.5, 2.8, 6.1, 6.3 and 15.2 — and Mistral did not lose them, it OCR'd them into
 * captions, tables and paragraphs covering 64–91% of the same rectangle. The native lane could
 * only ever call those pages "a picture nobody looked at". The vendor read them.
 *
 * So a gate built on "an image must come back as an image" would have rejected a STRICTLY
 * BETTER parse on the first real document it met, and the fallback would have thrown away the
 * table contents to protect figures that were never lost. Content can survive in a different
 * form than it was painted in, and only the region can say whether it survived at all.
 *
 * The classification is therefore three-way, per painted region:
 *
 *     figure   a vendor FIGURE block covers it        — a diagram, still a diagram
 *     content  some other vendor block covers it      — a table screenshot, read as a table
 *     absent   nothing at all covers it               — the region did not arrive in any form
 *
 * 🔴 ONLY `absent` IS A CLAIM OF LOSS. `content` is not loss and must never be counted as
 * such; `figure` is not proof of quality either, only of shape. Nothing here decides what any
 * of it means for teaching — that is downstream.
 *
 * 🔴 AND THE THRESHOLD IS BORROWED, NOT INVENTED. `WORTH_LOOKING_AREA` (3% of a page) is the
 * existing line between furniture and content, used by `figure-routing.ts` to decide what is
 * worth a vision call and by `structure.ts` to decide what is worth decoding. A logo repeated
 * on every slide sits below it, which is why this module needs no repetition heuristic of its
 * own. There is no second threshold, and adding one on today's evidence would be tuning.
 *
 * PURE. Two models in, an accounting out — no pdf.js, no network, no mutation.
 */

import type { DocRect, DocumentModel } from "@nemesis/shared";

import { WORTH_LOOKING_AREA } from "./figure-routing";

/** How a painted region survived the vendor's read. See the module comment. */
export type FigureFate = "figure" | "content" | "absent";

export interface AccountedRegion {
  unit: number;
  ref: string;
  /** Share of its page the region covers, 0..1. */
  area: number;
  /** Share of the REGION the vendor's blocks cover, 0..1. Diagnostic; never a gate. */
  covered: number;
  fate: FigureFate;
}

export interface FigureAccounting {
  /** Every region large enough to be worth accounting for, in document order. */
  regions: readonly AccountedRegion[];
  asFigure: number;
  asContent: number;
  /** Regions nothing in the vendor's read covers. THE ONLY COUNT THAT MEANS LOSS. */
  absent: number;
}

export const NO_ACCOUNTING: FigureAccounting = { absent: 0, asContent: 0, asFigure: 0, regions: [] };

/**
 * The share of `region` covered by the union of `covers`.
 *
 * 🔴 THE DENOMINATOR IS THE REGION, WHICH IS THE OPPOSITE OF `containment` IN `figure-match.ts`
 * AND DELIBERATELY SO. That function divides by the SMALLER rectangle because it is pairing two
 * readers' views of one figure, where a caption-inclusive box and an image-only box must still
 * count as the same thing. Here the question is how much of a picture the vendor accounted for,
 * and dividing by the smaller rectangle would let one OCR'd axis label sitting inside a diagram
 * score 1.00 and declare the whole diagram accounted for.
 *
 * Union, not sum: Mistral's blocks overlap each other routinely (a table and its rows), and
 * adding them would report more than 100% of a region as covered.
 *
 * Swept in x, then merged in y — O(n^2) in the blocks on one page, which is a few dozen. PURE.
 */
export function coveredShare(region: DocRect, covers: readonly DocRect[]): number {
  const area = region.width * region.height;
  if (!(area > 0)) return 0;
  const clipped = covers
    .map((cover) => ({
      x0: Math.max(region.x, cover.x),
      x1: Math.min(region.x + region.width, cover.x + cover.width),
      y0: Math.max(region.y, cover.y),
      y1: Math.min(region.y + region.height, cover.y + cover.height),
    }))
    .filter((cover) => cover.x1 > cover.x0 && cover.y1 > cover.y0);
  if (clipped.length === 0) return 0;

  const edges = [...new Set(clipped.flatMap((cover) => [cover.x0, cover.x1]))].sort((a, b) => a - b);
  let covered = 0;
  for (let i = 0; i + 1 < edges.length; i += 1) {
    const left = edges[i]!;
    const right = edges[i + 1]!;
    const spans = clipped
      .filter((cover) => cover.x0 <= left && cover.x1 >= right)
      .map((cover) => [cover.y0, cover.y1] as const)
      .sort((a, b) => a[0] - b[0]);
    let reached = -Infinity;
    let height = 0;
    for (const [top, bottom] of spans) {
      const start = Math.max(top, reached);
      if (bottom > start) {
        height += bottom - start;
        reached = bottom;
      }
    }
    covered += (right - left) * height;
  }
  // Clamped because floating-point sweeps can land a hair over 1.
  return Math.min(1, covered / area);
}

/**
 * Account for every image region the source reader found, against the vendor's read.
 *
 * `source` is our own structural read of the SAME bytes, used ONLY for the rectangles of the
 * images the file paints — never for its text, its order or its tables. `vendor` is the model
 * that will actually be stored.
 *
 * 🔴 SAME PAGE OR NOTHING. Two readers agreeing about a rectangle on different pages is a
 * coincidence: run without the unit test, every large region on this corpus finds a "cover"
 * somewhere in the document and the accounting reports zero loss unconditionally.
 */
export function accountForFigures(
  vendor: DocumentModel,
  source: DocumentModel,
  options: { minArea?: number } = {},
): FigureAccounting {
  const minArea = options.minArea ?? WORTH_LOOKING_AREA;

  const byUnit = new Map<number, { figures: DocRect[]; others: DocRect[] }>();
  for (const block of vendor.blocks) {
    if (!block.rect) continue;
    const bucket = byUnit.get(block.unit) ?? { figures: [], others: [] };
    (block.kind === "figure" ? bucket.figures : bucket.others).push(block.rect);
    byUnit.set(block.unit, bucket);
  }

  const regions: AccountedRegion[] = [];
  source.blocks.forEach((block, index) => {
    if (block.kind !== "figure" || !block.rect) return;
    const area = block.rect.width * block.rect.height;
    if (area < minArea) return;

    const bucket = byUnit.get(block.unit) ?? { figures: [], others: [] };
    const byFigure = coveredShare(block.rect, bucket.figures);
    const byAny = coveredShare(block.rect, [...bucket.figures, ...bucket.others]);
    // 🔴 PRESENCE, NOT PROPORTION. Any overlap at all means something arrived over this
    // region; the share is recorded beside it so a run can be explained, but it is not a
    // threshold. On the measured corpus the honest shares run from 0.43 to 1.00 with no gap,
    // so a proportion test here would be a number chosen to fit two documents. What this
    // buys — and its limit — is stated in the module comment: it catches a region that
    // arrived in NO form, not one that arrived partially.
    const fate: FigureFate = byFigure > 0 ? "figure" : byAny > 0 ? "content" : "absent";
    regions.push({ area, covered: byAny, fate, ref: block.figure?.ref ?? `block-${index}`, unit: block.unit });
  });

  return {
    absent: regions.filter((region) => region.fate === "absent").length,
    asContent: regions.filter((region) => region.fate === "content").length,
    asFigure: regions.filter((region) => region.fate === "figure").length,
    regions,
  };
}
