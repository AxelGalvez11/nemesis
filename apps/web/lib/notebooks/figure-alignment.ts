/**
 * Pointing a vendor-read document's figures at the pixels WE decoded for it.
 *
 * 🔴 THE DEFECT THIS EXISTS FOR, MEASURED ON PRODUCTION 2026-09-01. The vendor lane learned to keep
 * its figure pixels (#982) and the upload stored 14 new objects — and the document still reported
 * **0 showable figures out of 27**. The pictures were in the bucket and nothing pointed at them.
 *
 * The cause is that a vendor-parsed PDF has TWO sources of truth about its own figures and they
 * have never agreed on a name:
 *
 *   the MODEL that gets stored  comes from the vendor   → refs like `img-0`, or no ref at all
 *   the PIXELS that get stored  come from OUR pdf read  → refs like `0:img_p0_1`
 *
 * Ref matching cannot work across that gap and never could. On the native lane both come from
 * `readPdfStructure`, so the refs match by construction and the bug is invisible — which is
 * precisely why it survived: the lane that works and the lane that does not look identical in the
 * code that joins them.
 *
 * 🔴 SO THE JOIN IS GEOMETRIC, WHICH IS THE ONLY THING THE TWO READS GENUINELY SHARE. They disagree
 * about names, ordering and count, and agree about where the ink is on the page. `figure-accounting`
 * already leans on exactly that to decide whether a vendor read lost a figure; this is the same
 * evidence used to decide which picture is which.
 *
 * 🔴 AND IT ASSIGNS A REF WHERE THE VENDOR LEFT NONE. Mistral names an image only when its markdown
 * references it; a located-but-unreferenced figure block arrives with no ref, so there is nothing
 * for an asset to attach to even after the picture is matched. Minting one here is safe because
 * `DocFigure.ref` means "the format's own name for it" and a vendor that supplied no name has no
 * opinion to contradict.
 */

import type { DocumentModel, DocRect } from "@nemesis/shared";

import { coveredShare } from "@/lib/pdf/figure-accounting";

import type { NormalizedFigure } from "./figure-assets";

/**
 * Below this share of the source figure's area, a vendor block is a neighbour rather than the same
 * picture.
 *
 * 🔴 DELIBERATELY LOW, BECAUSE THE TWO READS BOX A FIGURE DIFFERENTLY AND BOTH ARE RIGHT. Ours is
 * the image XObject's painted extent; a vendor's is whatever its layout model called the figure,
 * routinely including or excluding a caption, a border or surrounding white space. On the measured
 * corpus honest overlaps run from 0.43 upward with no gap (`figure-accounting`'s own note), so a
 * threshold tuned for tightness would reject real matches. The best candidate on the page wins
 * regardless; this only rules out a figure at the other end of it.
 */
const SAME_PICTURE_SHARE = 0.2;

/** The rect of every figure block, keyed the way `capturedFigures` keys its pixels. */
function sourceRects(model: DocumentModel): Map<string, { rect: DocRect; unit: number }> {
  const out = new Map<string, { rect: DocRect; unit: number }>();
  for (const block of model.blocks) {
    const ref = block.figure?.ref;
    if (block.kind !== "figure" || !ref || !block.rect) continue;
    out.set(`${block.unit}:${ref}`, { rect: block.rect, unit: block.unit });
  }
  return out;
}

/**
 * Re-key decoded pixels onto the model that will actually be stored.
 *
 * Returns the figures with their `entry` rewritten to a ref the target model carries, and the
 * target model with refs minted for the figure blocks that had none. A picture that matches nothing
 * is DROPPED: uploading it would put an object in the bucket that no document points at, which
 * costs storage and buys nothing. PURE.
 */
export function alignFiguresToModel(
  figures: readonly NormalizedFigure[],
  source: DocumentModel,
  target: DocumentModel,
): { figures: NormalizedFigure[]; model: DocumentModel } {
  if (figures.length === 0) return { figures: [], model: target };

  const rects = sourceRects(source);
  const targetFigures = target.blocks
    .map((block, index) => ({ block, index }))
    .filter((entry) => entry.block.kind === "figure" && entry.block.rect);
  if (targetFigures.length === 0) return { figures: [], model: target };

  /** Minted refs, by block index, so the model is rewritten once at the end. */
  const minted = new Map<number, string>();
  const refAt = (index: number): string => {
    const existing = target.blocks[index]?.figure?.ref;
    if (existing) return existing;
    const already = minted.get(index);
    if (already) return already;
    // Unit and index, so the name is stable across a re-parse of the same file and unique within
    // the document — the two properties a content-addressed store needs from a join key.
    const made = `fig_${target.blocks[index]?.unit ?? 0}_${index}`;
    minted.set(index, made);
    return made;
  };

  const aligned: NormalizedFigure[] = [];
  /** One picture per target figure: two pixel sets on one block would upload both and show one. */
  const claimed = new Set<number>();

  for (const figure of figures) {
    const from = rects.get(figure.entry);
    if (!from) continue;
    let best: { index: number; share: number } | null = null;
    for (const candidate of targetFigures) {
      if (claimed.has(candidate.index) || candidate.block.unit !== from.unit) continue;
      const share = coveredShare(from.rect, [candidate.block.rect!]);
      if (share >= SAME_PICTURE_SHARE && (!best || share > best.share)) {
        best = { index: candidate.index, share };
      }
    }
    if (!best) continue;
    claimed.add(best.index);
    aligned.push({ ...figure, entry: refAt(best.index) });
  }

  if (minted.size === 0) return { figures: aligned, model: target };
  return {
    figures: aligned,
    model: {
      ...target,
      blocks: target.blocks.map((block, index) => {
        const ref = minted.get(index);
        return ref ? { ...block, figure: { ...block.figure, ref } } : block;
      }),
    },
  };
}
