/**
 * What to tell a student when a file came back with no readable text.
 *
 * 🔴 "NO READABLE TEXT WAS FOUND" IS TRUE AND USELESS. It reads as "your file
 * is broken" when the file is fine and the limitation is ours: a scanned
 * handout, or slides exported as pictures, is a perfectly good document that
 * this parser cannot read because the words are pixels.
 *
 * Since #486 the parser knows the difference — it hands back the units, figures
 * and geometry it did find — so the sentence can name what is actually there
 * instead of implying the upload was wasted.
 *
 * PURE. Facts in, one sentence out. No I/O, no formatting of anything else.
 */

import type { ExtractionCoverage } from "@nemesis/shared";

function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/**
 * One sentence for a parse that produced no text.
 *
 * `kind` is the file kind, `coverage` the record the parse produced — which is
 * always present, and for a scan carries the picture and page counts that make
 * the difference between an explanation and a shrug.
 */
export function noTextMessage(kind: string, coverage: ExtractionCoverage): string {
  if (kind === "image") {
    return "Couldn't read anything in that picture. Try again with more light, or hold the camera steadier.";
  }
  const figures = coverage.figures.found;
  if (figures > 0) {
    // 🔴 SAY WHAT WAS FOUND, AND SAY WHOSE LIMITATION IT IS. The document is not
    // at fault and the student has not lost their upload — the shape of the file
    // is stored, and a reader that can see pictures would finish the job.
    const where = coverage.units > 1 ? ` across ${count(coverage.units, "page", "pages")}` : "";
    return `This file has no text to select — it is made of pictures (${count(figures, "picture", "pictures")}${where}). Nemesis can't read text out of images yet, so nothing could be pulled out of it.`;
  }
  if (kind === "pdf") return "This PDF has no selectable text (it may be scanned images).";
  return "No readable text was found in that file.";
}
