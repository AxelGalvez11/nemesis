// Which pages of a PDF are pictures rather than text.
//
// 🔴 Why this is its own step. A scanned page carries no text layer, so today it
// renders correctly, selects nothing, matches no search, and contributes
// NOTHING to an AI answer — silently. The student sees a page and reasonably
// assumes searching it works. Naming those pages is worth doing on its own,
// before any OCR exists to read them.
//
// 🔴 "NO TEXT" IS NOT "SCANNED", and the difference is the whole design.
// Measured on two real course PDFs:
//
//   Digoxin PK recitation  pages 3-6, 12: no text, ONE image covering 88% of
//                          the page. Genuine scans.
//   Pharmacy Lingo         pages 1, 2, 6, 7: no text either — but 3 to 78 SMALL
//                          images covering 6% to 44%. These are slides built
//                          out of graphics. Reading them with OCR would produce
//                          noise, not text.
//
// So a page only counts as an image of a page when something on it is big
// enough to BE the page. Everything here is geometry — coverage measured from
// the transform matrix actually in effect — with no word lists and no
// character-count thresholds (CLAUDE.md: a character count is wrong in one
// direction or the other for CJK, and this must work for any script).

/** How much of the page one image must cover before the page reads as a
 *  picture of a page rather than a page with pictures on it.
 *
 *  Deliberately generous to the "leave it alone" side: on the real material,
 *  0.60 puts the 88% scans in and keeps the 44% and 32% graphic slides out.
 *  Under-reaching costs a page that could have been read; over-reaching means
 *  running OCR over artwork and presenting the result as the page's words. */
export const DOMINANT_IMAGE_COVERAGE = 0.6;

export type PageTextKind =
  /** The page carries its own text layer. Selection, search and citations all
   *  work, and OCR must never touch it. */
  | "embedded"
  /** No text, and one image big enough to be the page — a scan. */
  | "image-only"
  /** No text and nothing that looks like a scan: a blank page, or a slide made
   *  of small graphics. Saying "this is a scan" here would be wrong. */
  | "no-text";

/** The subset of a pdf.js operator list this module reads. Declared locally so
 *  the geometry is testable without loading pdf.js. */
export interface PageOperators {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
}

/** The pdf.js `OPS` values this module needs, passed in rather than imported so
 *  nothing here depends on pdf.js being loaded. */
export interface ImageOpcodes {
  save: number;
  restore: number;
  transform: number;
  /** Every operator that paints an image. A LIST rather than named fields:
   *  pdf.js renames and removes these between versions (v6 dropped
   *  `paintJpegXObject`), and the measurement does not care which one it is. */
  paintImage: readonly number[];
}

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function isMatrix(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 6 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

/** The largest fraction of the page any single image covers.
 *
 *  A PDF draws an image into the unit square and then transforms it, so the
 *  painted size is the length of the transformed unit vectors — which is why
 *  the graphics state has to be tracked through save/restore rather than
 *  reading the image's own pixel dimensions (those say nothing about how big it
 *  lands on the page).
 *
 *  🔴 A result ABOVE 1 is normal and must not be treated as an error: a scan
 *  bleeding past the page edge measured 122% on real material, and that is the
 *  most scan-like page there is. */
export function maxImageCoverage(
  operators: PageOperators,
  page: { width: number; height: number },
  opcodes: ImageOpcodes,
): number {
  const area = page.width * page.height;
  if (!Number.isFinite(area) || area <= 0) return 0;

  let current: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  let largest = 0;

  for (let index = 0; index < operators.fnArray.length; index += 1) {
    const fn = operators.fnArray[index];
    if (fn === undefined) continue;
    if (fn === opcodes.save) {
      stack.push(current);
      continue;
    }
    if (fn === opcodes.restore) {
      current = stack.pop() ?? IDENTITY;
      continue;
    }
    if (fn === opcodes.transform) {
      const args = operators.argsArray[index];
      // pdf.js passes the six numbers either as the argument itself or wrapped
      // in a single-element array, depending on the operator.
      const matrix = isMatrix(args) ? args : Array.isArray(args) && isMatrix(args[0]) ? (args[0] as number[]) : null;
      if (matrix) current = multiply(current, matrix as unknown as Matrix);
      continue;
    }
    if (opcodes.paintImage.includes(fn)) {
      const width = Math.hypot(current[0], current[1]);
      const height = Math.hypot(current[2], current[3]);
      largest = Math.max(largest, (width * height) / area);
    }
  }
  return largest;
}

export interface PageScan {
  /** 1-based page number. */
  unit: number;
  kind: PageTextKind;
  /** The dominant image's share of the page, for the label and for tests. */
  coverage: number;
}

/** What one page is, from its text layer and its biggest image.
 *
 *  🔴 A page counts as having text when its text layer is NOT EMPTY — never
 *  when it passes some number of characters. Two reasons: a character count is
 *  wrong in one direction or the other depending on the script, and a page that
 *  has ANY real text must never be OCR'd, because mixing guessed words into
 *  words the file actually contains is exactly the failure to avoid. */
export function classifyPage(unit: number, text: string, coverage: number): PageScan {
  if (text.trim().length > 0) return { unit, kind: "embedded", coverage };
  return { unit, kind: coverage >= DOMINANT_IMAGE_COVERAGE ? "image-only" : "no-text", coverage };
}

export interface DocumentScan {
  pages: PageScan[];
  /** Pages that are pictures of pages — the ones OCR would be for. */
  imageOnly: number[];
  /** Pages with neither text nor a dominant image. */
  withoutText: number[];
  /** True when NO page carries a text layer: the whole document is a scan. */
  fullyScanned: boolean;
}

/** The document-level answer is a COUNT, never a verdict.
 *
 *  🔴 The common real case is HYBRID: a real recitation PDF has 7 pages of text
 *  and 5 scanned pages in one file. Calling that document "scanned" or "not
 *  scanned" is wrong either way, so the unit of judgement is the page. */
export function scanDocument(pages: readonly PageScan[]): DocumentScan {
  const list = [...pages];
  const embedded = list.filter((page) => page.kind === "embedded");
  return {
    pages: list,
    imageOnly: list.filter((page) => page.kind === "image-only").map((page) => page.unit),
    withoutText: list.filter((page) => page.kind === "no-text").map((page) => page.unit),
    fullyScanned: list.length > 0 && embedded.length === 0 && list.some((page) => page.kind === "image-only"),
  };
}
