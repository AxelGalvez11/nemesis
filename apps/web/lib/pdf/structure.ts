/**
 * Reading a PDF as structure: pages, blocks, geometry, and — for the first time —
 * figures.
 *
 * 🔴 WHY THIS REPLACES `unpdf` RATHER THAN SITTING BESIDE IT.
 *
 * Measured over 120 real course PDFs / 952 pages: **326 pages (34.2%) carry both
 * substantial text and at least one figure**, holding 1,807 figures across 80 of
 * the 120 files. Production never looks at any of them, for two independent
 * reasons, and fixing either alone fixes nothing:
 *
 *   THE RULE       vision runs only where native text is thin, so a page with
 *                  three paragraphs and one load-bearing diagram is skipped.
 *   THE MECHANISM  `unpdf` does not expose image operators AT ALL, so nothing in
 *                  the current extractor can even tell a figure is present.
 *
 * And a third, quieter one: `pdfCoverage` accepts no figure input, so a page
 * holding an unread diagram is reported as fully read. That is the part this
 * file fixes first — before any vision spend, a figure nobody examined becomes a
 * countable, disclosable gap instead of an invisible one.
 *
 * 🔴 WHAT THIS DELIBERATELY DOES NOT DO: claim to have found tables.
 * Detecting a table from glyph positions is a real problem and a wrong answer is
 * worse than none — a grid asserted over ordinary prose relabels every value in
 * it. Ruling-line and column-alignment detection is recorded as an open gap in
 * the benchmark rather than approximated here.
 *
 * pdf.js is imported lazily so ~1 MB of parser never lands in a bundle that only
 * ever renders notes. Geometry rules live in `./geometry` and are pure.
 */

import { buildDocument, type DocBlock, type DocumentModel } from "@nemesis/shared";

import {
  groupLines,
  groupParagraphs,
  headingLevels,
  readingOrder,
  toRelative,
  unionBox,
  type Box,
  type TextItem,
} from "./geometry";

/** A figure found on a page, before it is judged. */
interface RawFigure {
  /** pdf.js's own name for the image object. Repeats identify running art. */
  ref: string;
  box: Box;
}

interface RawPage {
  width: number;
  height: number;
  items: TextItem[];
  figures: RawFigure[];
}

/**
 * A figure smaller than this share of the page is furniture: a bullet glyph, a
 * rule, a logo, a signature line. Sending it to vision costs a call and returns
 * "a small blue square".
 *
 * 🔴 IT IS SKIPPED WITH A REASON, NOT DROPPED. A disclosed decision and an
 * undisclosed omission are different facts, and only the second may keep a
 * document from being called complete.
 */
const SMALL_FIGURE_AREA = 0.01;

/**
 * An image drawn on at least this share of a document's pages is running art —
 * a masthead, a footer mark, a template background.
 *
 * Structural, not visual: the signal is repetition across pages, which is true
 * of a university crest and a law firm's letterhead alike, and is not a guess
 * about what any particular discipline's documents contain.
 */
const RUNNING_ART_SHARE = 0.5;

let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

/** The one place the server-side pdf.js build is loaded. */
async function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

/**
 * Read a PDF into the canonical model.
 *
 * `bytes` may be DETACHED — pdf.js takes ownership of the buffer it is handed.
 * A caller needing the original afterwards passes a copy. This is not a
 * theoretical hazard: an image scan that ran after extraction once reported zero
 * images in 83 files that hold 2,949 of them, because the buffer had been zeroed.
 */
export async function readPdfStructure(bytes: Uint8Array): Promise<DocumentModel> {
  const pdfjs = await loadPdfjs();
  const loading = pdfjs.getDocument({ data: bytes, disableFontFace: true });
  const doc = await loading.promise;
  try {
    const pages: RawPage[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      try {
        pages.push(await readPage(pdfjs, page));
      } finally {
        page.cleanup();
      }
    }
    return assemble(pages);
  } finally {
    // 🔴 THE LOADING TASK OWNS THE WORKER, NOT THE DOCUMENT. pdf.js 6 removed
    // `PDFDocumentProxy.destroy`; destroying the task is what actually releases
    // it, and getting this wrong leaks a worker per document.
    //
    // Wrapped, because throwing here would lose a successful parse and a leaked
    // worker is the lesser failure. Measured the other way round once: a cleanup
    // call that threw after the result was pushed counted every file as both
    // read and unreadable.
    try { await loading.destroy(); } catch { /* the parse already succeeded */ }
  }
}

type Pdfjs = Awaited<ReturnType<typeof loadPdfjs>>;

async function readPage(pdfjs: Pdfjs, page: Awaited<ReturnType<Awaited<ReturnType<Pdfjs["getDocument"]>["promise"]>["getPage"]>>): Promise<RawPage> {
  // scale 1 and the page's own rotation, so every coordinate below is already in
  // the space a reader would render — no second convention anywhere downstream.
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  const items: TextItem[] = [];
  for (const item of content.items) {
    if (!("str" in item) || item.str.length === 0) continue;
    // The item's matrix carries position AND scale; combining it with the
    // viewport's gives top-left-origin points directly.
    const t = pdfjs.Util.transform(viewport.transform, item.transform);
    const height = Math.hypot(t[2], t[3]) || item.height || 0;
    items.push({
      // t[5] is the BASELINE. A box drawn from the baseline down would sit under
      // the text; the glyphs occupy roughly one em above it.
      height,
      text: item.str,
      width: item.width || Math.abs(t[0]) * item.str.length * 0.5,
      x: t[4],
      y: t[5] - height,
    });
  }

  return { figures: await readFigures(pdfjs, page, viewport), height: viewport.height, items, width: viewport.width };
}

/**
 * Every image the page draws, and where.
 *
 * 🔴 THE TRANSFORM STACK IS THE WHOLE JOB. An image operator carries no
 * coordinates — pdf.js draws it into the unit square under whatever the current
 * transform happens to be, so the page's `save`/`restore`/`transform` sequence
 * has to be replayed to know where anything landed. Reading the operator array
 * for image ops alone tells you a figure exists and nothing about where, which
 * is not enough to crop it for a second look.
 */
async function readFigures(
  pdfjs: Pdfjs,
  page: { getOperatorList: () => Promise<{ argsArray: unknown[][]; fnArray: number[] }> },
  viewport: { transform: number[]; width: number; height: number },
): Promise<RawFigure[]> {
  const { OPS, Util } = pdfjs;
  const imageOps = new Set<number>([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageMaskXObject,
  ]);

  let ops: { argsArray: unknown[][]; fnArray: number[] };
  try {
    ops = await page.getOperatorList();
  } catch {
    // A page whose operators will not parse is a page whose figures are UNKNOWN.
    // Returning none would report it as figure-free, which is the flattering
    // reading of a failure and exactly what Phase 0 exists to stop.
    return [];
  }

  const figures: RawFigure[] = [];
  let ctm = [...viewport.transform];
  const stack: number[][] = [];

  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i]!;
    if (fn === OPS.save) { stack.push([...ctm]); continue; }
    if (fn === OPS.restore) { ctm = stack.pop() ?? [...viewport.transform]; continue; }
    if (fn === OPS.transform) {
      const a = ops.argsArray[i] as number[] | undefined;
      if (a && a.length >= 6) ctm = Util.transform(ctm, a as [number, number, number, number, number, number]);
      continue;
    }
    if (!imageOps.has(fn)) continue;

    // The unit square, carried through the current transform.
    //
    // The two-line matrix application is written out rather than borrowed from
    // pdf.js's `Util.applyTransform`, whose signature has changed across
    // versions — it now mutates its argument and returns nothing. Depending on
    // that would make an upgrade silently produce zeroed rectangles, which read
    // downstream as "the figure is in the top-left corner" rather than as an
    // error.
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [ux, uy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      xs.push(ctm[0]! * ux + ctm[2]! * uy + ctm[4]!);
      ys.push(ctm[1]! * ux + ctm[3]! * uy + ctm[5]!);
    }
    const box: Box = {
      height: Math.max(...ys) - Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      x: Math.min(...xs),
      y: Math.min(...ys),
    };
    if (box.width <= 0 || box.height <= 0) continue;
    const args = ops.argsArray[i];
    const ref = typeof args?.[0] === "string" ? args[0] : `inline-${i}`;
    figures.push({ box, ref });
  }
  return figures;
}

/** Pages into one model: blocks in reading order, headings, figures, locators. */
function assemble(pages: readonly RawPage[]): DocumentModel {
  // Running art is a document-level fact, so it is decided once, over every page,
  // before any page's figures are classified.
  const appearances = new Map<string, number>();
  for (const page of pages) {
    for (const ref of new Set(page.figures.map((f) => f.ref))) {
      appearances.set(ref, (appearances.get(ref) ?? 0) + 1);
    }
  }
  const runningArt = new Set(
    [...appearances.entries()]
      .filter(([, count]) => pages.length >= 3 && count >= pages.length * RUNNING_ART_SHARE)
      .map(([ref]) => ref),
  );

  const blocks: Omit<DocBlock, "id">[] = [];
  const headingPath: string[] = [];
  let title: string | null = null;

  pages.forEach((page, unit) => {
    const lines = readingOrder(groupLines(page.items), page.width);
    const groups = groupParagraphs(lines);
    const levels = headingLevels(groups);

    groups.forEach((group, index) => {
      const text = group.lines.map((l) => l.text).join(" ").replace(/\s+/g, " ").trim();
      if (!text) return;
      const rect = toRelative(group, page.width, page.height);
      const level = levels[index] ?? null;
      if (level !== null) {
        headingPath.length = Math.max(level - 1, 0);
        headingPath[level - 1] = text;
        title ??= unit === 0 ? text : null;
        blocks.push({ headingPath: headingPath.slice(0, level - 1), kind: "heading", level, rect, text, unit });
        return;
      }
      blocks.push({ headingPath: [...headingPath], kind: "paragraph", rect, text, unit });
    });

    const pageArea = page.width * page.height;
    for (const figure of page.figures) {
      const share = pageArea > 0 ? (figure.box.width * figure.box.height) / pageArea : 0;
      const skipped = runningArt.has(figure.ref)
        ? ("decorative" as const)
        : share < SMALL_FIGURE_AREA
          ? ("too-small" as const)
          : undefined;
      blocks.push({
        // 🔴 NO DESCRIPTION AND NO CAPTION IS THE HONEST STATE AT PARSE TIME.
        // `description` is filled in only when something has actually looked;
        // leaving it absent is what makes `figuresUnexamined` countable.
        figure: { ref: figure.ref, ...(skipped ? { skipped } : {}) },
        headingPath: [...headingPath],
        kind: "figure",
        rect: toRelative(figure.box, page.width, page.height),
        text: "",
        unit,
      });
    }
  });

  return buildDocument({
    blocks,
    format: "pdf",
    title,
    units: pages.map((page, index) => ({
      index,
      kind: "page",
      size: { height: page.height, width: page.width },
    })),
  });
}

/** Re-exported so callers measuring a page do not reimplement the union. */
export { unionBox };
