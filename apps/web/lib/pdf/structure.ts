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
 * 🔴 TABLES: THIS USED TO REFUSE, AND NOW IT DOES NOT — THE REASON CHANGED.
 * The refusal was correct while the only option was inferring a grid from glyph
 * positions: a grid asserted over ordinary prose relabels every value in it, and
 * a wrong answer is worse than none. Two things removed that objection.
 *   1. `layout-onnx.ts` — Docling's trained layout model, run in-process, says
 *      WHERE a table is instead of us guessing from spacing.
 *   2. `table-grid.ts` — the cell boundaries come from the ruling lines the PDF
 *      itself draws, and the cell CONTENTS are the same exact `TextItem`s this
 *      file already extracted.
 * So no grid is ever asserted over prose, and no character is ever re-read by a
 * model. A region with no recoverable grid produces NO table and is counted as
 * unread, which is the same refusal as before, now scoped to the cases that
 * still deserve it.
 *
 * It stays off unless `DOCLING_LAYOUT_ONNX` points at the weights.
 *
 * pdf.js is imported lazily so ~1 MB of parser never lands in a bundle that only
 * ever renders notes. Geometry rules live in `./geometry` and are pure.
 */

import {
  buildDocument,
  classifyFurniture,
  projectCells,
  type DocBlock,
  type DocRect,
  type DocTable,
  type DocumentModel,
} from "@nemesis/shared";

import { MAX_UNITS_PER_PARSE } from "@/lib/notebooks/parse-worker";

import { figureToPng } from "./figure-image";
import { MAX_FIGURES_PER_DOC, THIN_UNIT_CHARS, WORTH_LOOKING_AREA } from "./figure-routing";
import { boxToRect, detectLayout, layoutModelPath, layoutSession, type OnnxSessionLike } from "./layout-onnx";
import { pageToModelRgb } from "./rasterize";
import { resolveColumns, type Fragment } from "./table-continuation";
import { headerRowsOf, readRulings, reconstructRegion, type PlacedText } from "./table-grid";
import { latticeRegions, type LatticeBox } from "./table-lattice";
import { cellsOf, trimEmptyCellColumns } from "./table-spans";
import { validateTable, type TableRejection } from "./table-validate";
import {
  columnSplit,
  groupLines,
  groupParagraphs,
  headingLevels,
  readingOrder,
  toRelative,
  unionBox,
  type Box,
  type TextItem,
} from "./geometry";

export interface PdfStructureResult {
  model: DocumentModel;
  /**
   * Figure pixels, keyed `unit:ref`, for the figures that were captured.
   *
   * Empty unless `captureFigures` was asked for. Kept OUT of the model on
   * purpose: the model is persisted as JSON and a megabyte of base64 per figure
   * would make `parsed_documents.structure` unreadable and unusable.
   */
  figureImages: Map<string, CapturedFigure>;
  /**
   * Units the FILE declares, which may exceed what was read.
   *
   * Kept apart from `model.units.length` on purpose: one is what exists, the
   * other is what we looked at, and coverage needs both to say "5,000 of
   * 100,000 pages could be read" instead of quietly renaming the document.
   */
  declaredUnits: number;
  /**
   * Table regions the layout model found but that yielded no recoverable grid.
   *
   * 🔴 THIS IS A COVERAGE FACT, NOT A STATISTIC. A page whose table could not
   * be reconstructed holds content that did not reach the student, and a page
   * with plenty of native text around such a region would otherwise report
   * `complete`. Carried out so the coverage record can say so.
   */
  tableRegionsUnread: number;
  /**
   * The same fact, per page — 0-based unit index, only for pages that lost one.
   *
   * 🔴 THE TOTAL ABOVE IS A SUM, AND A SUM CANNOT BE JOINED. `tableRegionsUnread`
   * has always been produced by reducing this across pages, which leaves a parse
   * verdict able only to refuse the whole file — the difference between refusing
   * a chart and refusing the chapter it sits in. The locality is present at the
   * point of measurement and destroyed at the point of summing, so the fix is to
   * stop destroying it; it cannot be reconstructed afterwards.
   *
   * Both are returned, and the total stays authoritative. See
   * `ExtractionCoverage.lostUnits`: this accounts for as much of the total as
   * the pages could place and never redefines it.
   */
  tableRegionsUnreadByUnit: readonly { unit: number; count: number }[];
  /**
   * Grids the deterministic lane built and then refused to trust, by reason.
   *
   * 🔴 A REFUSED TABLE IS NOT THE SAME AS NO TABLE, and collapsing the two is how
   * a parser reports a clean bill of health over content it could not deliver.
   * Every reason here names a region where ruled structure exists, was
   * reconstructed, and failed validation — so the page kept its prose (correct)
   * and lost its grid (a gap worth surfacing).
   */
  tablesRejected: Record<TableRejection, number>;
}

/** A figure found on a page, before it is judged. */
interface RawFigure {
  /** pdf.js's own name for the image object. Repeats identify running art. */
  ref: string;
  box: Box;
  /**
   * The figure's own pixels, if they were captured.
   *
   * 🔴 CAPTURED HERE OR NOT AT ALL. `page.cleanup()` releases `page.objs`, so
   * the bytes are gone the moment this page is finished with — and re-fetching
   * the page later re-parses its whole operator list. Everything that might
   * want to look at a figure has to say so before this loop moves on.
   */
  image?: CapturedFigure;
}

export interface CapturedFigure {
  png: Uint8Array;
  width: number;
  height: number;
}

interface RawPage {
  width: number;
  height: number;
  items: TextItem[];
  figures: RawFigure[];
  /** Reconstructed tables. `fragment` is present for the deterministic lane only. */
  tables: { rect: DocRect; table: DocTable; fragment?: Fragment }[];
  /** Table regions with no recoverable grid — content we could not deliver. */
  tablesUnread: number;
  /**
   * Why each proposed table was refused.
   *
   * 🔴 A REFUSAL IS A FACT, NOT SILENCE. "There was a grid here and we did not
   * trust it" and "there was no grid here" are different, and only the first is
   * a coverage gap worth reporting to a student.
   */
  tablesRejected: TableRejection[];
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

/**
 * Do a claimed lattice region and a model-proposed box cover any of the same page?
 *
 * Any overlap at all, not a majority: the two lanes disagreeing about the edges
 * of one table is the expected case, and emitting both would put the same cells
 * in the document twice under two blocks. A duplicate is indistinguishable
 * downstream from the content genuinely occurring twice.
 *
 * PURE.
 */
function overlaps(region: LatticeBox, box: readonly [number, number, number, number]): boolean {
  return region.x0 < box[2] && box[0] < region.x1 && region.y0 < box[3] && box[1] < region.y1;
}

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
export async function readPdfStructure(
  bytes: Uint8Array,
  options: {
    maxUnits?: number;
    captureFigures?: boolean;
    maxCaptured?: number;
    /**
     * Run the layout model to recover tables. Off unless asked AND the weights
     * are configured — a missing model is "no tables", never an error, so a
     * deployment without them parses exactly as it did before.
     */
    detectTables?: boolean;
    /**
     * Recover ruled tables from the page's own lines. On by default.
     *
     * 🔴 A MEASUREMENT SEAM, NOT A FEATURE FLAG. The deterministic lane needs no
     * model, no artifact and no configuration, so there is no deployment in which
     * it should be off. It exists so `scripts/lattice-corpus.mts` can parse the
     * same file both ways and prove what the lane changed — which is the only way
     * to show that turning it on costs no document its prose.
     */
    latticeTables?: boolean;
  } = {},
): Promise<PdfStructureResult> {
  const maxUnits = options.maxUnits ?? MAX_UNITS_PER_PARSE;
  // Headroom over the vision budget: running art is a DOCUMENT-level fact, only
  // known once every page has been seen, so some of what is captured here will
  // turn out to be a masthead and be discarded. Capturing exactly the budget
  // would mean the mastheads crowded out real figures.
  const maxCaptured = options.maxCaptured ?? MAX_FIGURES_PER_DOC * 2;
  const pdfjs = await loadPdfjs();
  const loading = pdfjs.getDocument({ data: bytes, disableFontFace: true });
  const doc = await loading.promise;
  try {
    // 🔴 THE CAP IS ON UNITS, NOT BYTES, BECAUSE COST TRACKS UNITS.
    // A 33.5 MB deck parses in 50 ms; a 13 MB PDF of 2,116 pages takes 12.3 s.
    // A few hundred kilobytes of generated PDF can declare a hundred thousand
    // pages, so the byte ceiling upstream does not bound this at all.
    const declaredUnits = doc.numPages;
    const readable = Math.min(declaredUnits, maxUnits);

    // Loaded once for the whole document, not per page: the load costs ~470 ms
    // and ~370 MB, so paying it per page would dominate the parse and multiply
    // the memory by the page count.
    let layout: OnnxSessionLike | null = null;
    const modelPath = options.detectTables ? layoutModelPath() : null;
    if (modelPath) {
      try {
        layout = await layoutSession(modelPath);
      } catch (cause) {
        // Weights that will not load mean no tables, exactly as if the lane were
        // switched off. It must not cost the document its parse.
        console.warn(JSON.stringify({ event: "pdf_layout_unavailable", detail: String(cause).slice(0, 160) }));
      }
    }

    const pages: RawPage[] = [];
    let captured = 0;
    for (let n = 1; n <= readable; n += 1) {
      const page = await doc.getPage(n);
      try {
        const read = await readPage(pdfjs, page, {
          capture: options.captureFigures === true && captured < maxCaptured,
          lattice: options.latticeTables !== false,
          layout,
        });
        captured += read.figures.filter((figure) => figure.image).length;
        pages.push(read);
      } finally {
        page.cleanup();
      }
    }
    // 🔴 THE PER-PAGE FORM IS BUILT FIRST AND THE TOTAL IS DERIVED FROM IT, not
    // the other way round. `pages` is indexed by the same 0-based unit the model
    // uses, so this is the one place where the join is free; anywhere later it
    // is impossible.
    const tableRegionsUnreadByUnit = pages
      .map((page, unit) => ({ unit, count: page.tablesUnread }))
      .filter((entry) => entry.count > 0);
    const tableRegionsUnread = tableRegionsUnreadByUnit.reduce((sum, entry) => sum + entry.count, 0);

    const figureImages = new Map<string, CapturedFigure>();
    pages.forEach((page, unit) => {
      for (const figure of page.figures) {
        if (figure.image) figureImages.set(`${unit}:${figure.ref}`, figure.image);
      }
    });
    // 🔴 THE PAGES PAST THE CAP ARE UNREAD, NOT ABSENT, AND THE DIFFERENCE HAS
    // TO SURVIVE THIS RETURN. `declaredUnits` is what the file says it holds;
    // the model describes only what was actually read. A caller that had just
    // the model would report a 100,000-page document as a 5,000-page one that
    // was read completely — which is the exact shape of "solving capacity by
    // silently deleting content".
    const tablesRejected = {} as Record<TableRejection, number>;
    for (const page of pages) {
      for (const reason of page.tablesRejected) tablesRejected[reason] = (tablesRejected[reason] ?? 0) + 1;
    }
    return { declaredUnits, figureImages, model: assemble(pages), tableRegionsUnread, tableRegionsUnreadByUnit, tablesRejected };
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

async function readPage(
  pdfjs: Pdfjs,
  page: Awaited<ReturnType<Awaited<ReturnType<Pdfjs["getDocument"]>["promise"]>["getPage"]>>,
  options: { capture: boolean; layout?: OnnxSessionLike | null; lattice?: boolean } = { capture: false },
): Promise<RawPage> {
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
      ...("fontName" in item && typeof item.fontName === "string" ? { font: item.fontName } : {}),
      // t[5] is the BASELINE. A box drawn from the baseline down would sit under
      // the text; the glyphs occupy roughly one em above it.
      height,
      text: item.str,
      width: item.width || Math.abs(t[0]) * item.str.length * 0.5,
      x: t[4],
      y: t[5] - height,
    });
  }

  // ── Tables ───────────────────────────────────────────────────────────────
  //
  // 🔴 ONLY `table` REGIONS ARE CONSUMED, DELIBERATELY. The layout model also
  // reports `picture`, `list_item`, `formula` and more, and every one of those
  // already has an owner here — `readFigures` finds the pictures, the paragraph
  // grouper finds the lists. Taking them too would emit the same content twice
  // under two different block kinds, which is worse than not having them: a
  // duplicate is indistinguishable from a second, real occurrence.
  const tables: { rect: DocRect; table: DocTable; fragment?: Fragment }[] = [];
  const tablesRejected: TableRejection[] = [];
  let tablesUnread = 0;

  // ── The deterministic lane, which needs no model and runs on every page ──
  //
  // 🔴 IT RUNS FIRST, AND THAT ORDERING IS LOAD-BEARING. Both lanes remove the
  // text they claim from the paragraph flow, so if the model ran first it would
  // consume a region's items and the lattice would then rebuild a grid from text
  // that is no longer there — or worse, both would emit the same cells under two
  // blocks, which is indistinguishable downstream from the table genuinely
  // occurring twice. The lattice claims what it can prove; the model is offered
  // only what is left.
  const rulings = await readRulings(pdfjs as never, page, viewport);
  const claimedRegions: LatticeBox[] = [];
  if (options.lattice !== false) {
    const consumed = new Set<TextItem>();
    for (const region of latticeRegions(rulings)) {
      // 🔴 A DEEPER SUB-BAND OF A REGION THAT ALREADY CLAIMED ITS TABLE MUST NOT
      // RUN. Suppression happens after this loop, so a second candidate over the
      // same rules would reconstruct from the same still-present items and emit
      // the same cells twice — indistinguishable downstream from the table
      // genuinely occurring twice. Skipping on overlap is the same rule the
      // layout lane below already applies against these claims.
      if (claimedRegions.some((claimed) => overlaps(claimed, [region.x0, region.y0, region.x1, region.y1]))) {
        continue;
      }
      const built = reconstructRegion(region, rulings, items);
      if (!built) continue;
      // 🔴 THE CELLS ARE COMPUTED BEFORE THE ROWS, AND THE ROWS COME FROM THEM.
      // A merged cell is a boundary the page declines to draw, so it is knowable
      // only here, next to the rulings — and `rows` is then the projection of the
      // cells rather than a second thing maintained beside them. Trimming is
      // applied to the cells for the same reason: doing it to the rows alone
      // would leave every span pointing at column numbers that had moved.
      const cells = trimEmptyCellColumns(cellsOf(built.grid, built.table.rows, rulings));
      const trimmed = projectCells(cells);
      // 🔴 PROVISIONALLY ZERO. `headerRowsOf` only asks "is every cell of row 0 filled", which is
      // true of most first RECORDS, and whether this row names the columns cannot be decided from
      // one fragment — one of the two signals is "it is reprinted on the next page". So the claim
      // is withheld here and made in `assemble`, once, against the whole document.
      //
      // 🔴 AND IT MUST BE WITHHELD RATHER THAN GUESSED, BECAUSE `segmentsOf` SKIPS `headerRows`
      // ROWS. A table claiming a header the corroboration later declines to confirm drops its
      // first row from extraction entirely — measured at 14 real data rows across four syllabi,
      // including every first session of a schedule whose header is never printed.
      const candidate: DocTable = { headerRows: 0, rows: trimmed, ...(cells.length > 0 ? { cells } : {}) };
      const verdict = validateTable({
        grid: built.grid,
        inRegion: built.inRegion,
        page: { height: viewport.height, width: viewport.width },
        placed: built.placed,
        region,
        rulings,
        table: candidate,
      });
      if (!verdict.ok) {
        // 🔴 NOTHING HAS BEEN MUTATED AT THIS POINT, DELIBERATELY. The page's
        // items are untouched until a candidate has passed, so a rejection costs
        // a missing table and never a damaged page. Validating after suppression
        // — "claim it, then check, then try to undo" — is the shape of every
        // silent-data-loss bug this codebase has already paid for.
        tablesRejected.push(verdict.reason ?? "content-unaccounted");
        continue;
      }
      const rect = boxToRect([region.x0, region.y0, region.x1, region.y1], viewport.width, viewport.height);
      if (!rect) continue;
      claimedRegions.push(region);
      tables.push({
        fragment: {
          columnPositions: built.grid.cols,
          firstRow: candidate.rows[0] ?? [],
          firstRowComplete: headerRowsOf(trimmed) > 0,
          rowFonts: built.rowFonts,
          unit: -1,               // filled in by `assemble`, which knows the page index
          unitHeight: viewport.height,
          y0: region.y0,
          y1: region.y1,
        },
        rect,
        table: candidate,
      });
      // 🔴 ONLY WHAT THE GRID ACTUALLY SEATED. Suppressing by geometry — every
      // item whose centre falls in the rectangle — would delete any item the grid
      // failed to place, so a reconstruction that quietly dropped a line would
      // delete that line from the document too and the page would still report
      // itself complete.
      for (const item of built.placed) consumed.add(item as TextItem);
    }
    if (consumed.size > 0) {
      const kept = items.filter((item) => !consumed.has(item));
      items.length = 0;
      items.push(...kept);
    }
  }

  if (options.layout) {
    try {
      const { rgb, width, height } = await pageToModelRgb(page as never);
      const { regions } = await detectLayout(options.layout, rgb, width, height);
      const wanted = regions
        .filter((r) => r.label === "table")
        // The lattice already answered for this area; a second opinion here can
        // only duplicate it or contradict it, and both are worse than silence.
        .filter((r) => !claimedRegions.some((c) => overlaps(c, r.box)));
      if (wanted.length > 0) {
        const placed: PlacedText[] = items;
        const consumed = new Set<TextItem>();
        for (const region of wanted) {
          const [x0, y0, x1, y1] = region.box;
          // 🔴 THE SAME CELL RECOVERY THE LATTICE LANE USES. A table must not
          // mean two different things depending on which lane found it — a merged
          // cell is a fact about the page's rulings either way, and letting the
          // flag decide whether it is recorded would make the ONNX lane silently
          // lossier than the one beside it.
          const built = reconstructRegion({ x0, x1, y0, y1 }, rulings, placed);
          if (!built) { tablesUnread += 1; continue; }
          const modelCells = trimEmptyCellColumns(cellsOf(built.grid, built.table.rows, rulings));
          const table: DocTable = {
            ...built.table,
            rows: projectCells(modelCells),
            ...(modelCells.length > 0 ? { cells: modelCells } : {}),
          };
          // 🔴 `width`/`height` HERE ARE POINTS, NOT RASTER PIXELS. `pageToModelRgb`
          // returns the page's true size at scale 1 precisely so this rect lands
          // in the same space every other rect in the model uses. Passing the
          // raster's dimensions instead would shrink every table rect by the
          // render scale and put every table citation in the wrong place.
          const rect = boxToRect(region.box, width, height);
          if (rect) tables.push({ rect, table });
          for (const item of items) {
            const cx = item.x + item.width / 2;
            const cy = item.y + item.height / 2;
            if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) consumed.add(item);
          }
        }
        // 🔴 THE TEXT A TABLE ATE MUST LEAVE THE PARAGRAPH FLOW. Without this the
        // page emits BOTH a correct 8-column table AND the same cells flattened
        // into unreadable prose — and because a table is atomic to the chunker,
        // the flattened copy lands in its own chunk that retrieval can still
        // find. The document would get bigger and worse at the same time.
        if (consumed.size > 0) {
          const kept = items.filter((item) => !consumed.has(item));
          items.length = 0;
          items.push(...kept);
        }
      }
    } catch (cause) {
      // The layout lane is an enhancement. A page it cannot read is a page that
      // parses exactly as it did before this existed — never a failed document.
      console.warn(JSON.stringify({ event: "pdf_layout_failed", detail: String(cause).slice(0, 160) }));
    }
  }

  const figures = await readFigures(pdfjs, page, viewport);
  if (options.capture) {
    const pageArea = viewport.width * viewport.height;
    for (const figure of figures) {
      // The same two-signal test the router applies, run here because this is
      // the only moment the bytes exist. Deliberately NOT text sparsity alone:
      // a large figure is captured on a page dense with text, which is the
      // 326-page population production can never see.
      const share = pageArea > 0 ? (figure.box.width * figure.box.height) / pageArea : 0;
      const thin = items.reduce((sum, item) => sum + item.text.length, 0) < THIN_UNIT_CHARS;
      if (share < WORTH_LOOKING_AREA && !thin) continue;
      const converted = figureToPng(await readImageObject(page, figure.ref));
      if (converted.ok) figure.image = { height: converted.height, png: converted.png, width: converted.width };
    }
  }
  return { figures, height: viewport.height, items, tables, tablesRejected, tablesUnread, width: viewport.width };
}

/**
 * The decoded image behind a paint operator, or null.
 *
 * 🔴 `page.objs.has()` RETURNS FALSE FOR IMAGES THAT ARE AVAILABLE, AND THAT
 * COST 75% OF THIS PHASE'S FIGURES. Measured on the real corpus: gating on
 * `has()` captured pixels for **78 of 305** routed figures. pdf.js resolves
 * image objects asynchronously *after* `getOperatorList()` returns, so a
 * synchronous check is a race the reader loses most of the time — and it loses
 * it silently, as "this figure had no pixels" rather than as an error.
 *
 * The callback form waits. A bounded wait, because an object that never resolves
 * would otherwise hold a page open for the length of the parse: a figure we
 * waited for and did not get is `undecoded`, which is a stated reason.
 */
const IMAGE_WAIT_MS = 3_000;

function readImageObject(
  page: { objs: { get: (name: string, callback: (value: unknown) => void) => void } },
  ref: string,
): Promise<Parameters<typeof figureToPng>[0]> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: Parameters<typeof figureToPng>[0]) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // 🔴 NOT `unref`ed. An unreferenced timer does not hold the event loop open,
    // so when the only thing outstanding is an image object that never resolves,
    // Node empties the loop and the await NEVER SETTLES — the parse simply stops
    // mid-document with no error. Observed exactly once, on the real corpus.
    const timer = setTimeout(() => done(null), IMAGE_WAIT_MS);
    try {
      page.objs.get(ref, (value) => {
        clearTimeout(timer);
        done(value as Parameters<typeof figureToPng>[0]);
      });
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
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
  // 🔴 COLUMN NAMES ARE A DOCUMENT-LEVEL FACT AND CANNOT BE DECIDED PER PAGE.
  // A schedule prints `Date | Time | Topic | …` once and then runs over eleven
  // more pages that repeat none of it, so a page looking only at itself sees
  // anonymous columns and a consumer falls back to reading whole rows as text —
  // the flattening the grid exists to prevent. Resolved here, once, in document
  // order, over the fragments every page contributed.
  const fragments: Fragment[] = [];
  const owners: { rect: DocRect; table: DocTable; fragment?: Fragment }[] = [];
  pages.forEach((page, unit) => {
    for (const entry of page.tables) {
      if (!entry.fragment) continue;
      fragments.push({ ...entry.fragment, unit });
      owners.push(entry);
    }
  });
  resolveColumns(fragments).forEach((resolved, i) => {
    const owner = owners[i]!;
    owner.table = {
      ...owner.table,
      // The header row is skipped by consumers, so it may only be declared once the document has
      // corroborated that row 0 names the columns. An inherited header lives on ANOTHER fragment,
      // so this one's first row is data.
      headerRows: resolved.headerSource === "present" ? 1 : 0,
      ...(resolved.columns ? { columns: resolved.columns } : {}),
      ...(resolved.headerSource ? { headerSource: resolved.headerSource } : {}),
      ...(resolved.continuesFromUnit !== null ? { continuesFromUnit: resolved.continuesFromUnit } : {}),
    };
  });

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
    // 🔴 FIND THE GUTTER BEFORE ANYTHING IS FUSED. `columnSplit` refuses any
    // boundary that a line crosses, so asking it after `groupLines` asks it
    // about lines that may already straddle the very gutter being looked for.
    // Raw items cannot straddle it — a run of text sits in one column — so this
    // is the only point where the question can be answered honestly.
    //
    // A page with no real gutter returns null and `groupLines` behaves exactly
    // as before.
    const gutter = columnSplit(page.items, page.width);
    const lines = readingOrder(groupLines(page.items, gutter), page.width);
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

    // 🔴 AFTER THE PAGE'S PROSE, NOT INTERLEAVED WITH IT — A STATED LIMITATION.
    // The text a table consumed has already been removed from `page.items`, so
    // nothing is duplicated; but a page with a paragraph BELOW its table will
    // order the table first. On the documents this exists for — reference charts
    // that are essentially all table — that costs nothing, and a table's own
    // rect still carries its true position for citations. Interleaving by
    // vertical position is the right fix and is deliberately not smuggled in
    // here alongside the change that makes tables exist at all.
    for (const { rect, table } of page.tables) {
      blocks.push({
        headingPath: [...headingPath],
        kind: "table",
        rect,
        table,
        // A table's text is its grid; `documentToText` renders it from `table`.
        text: "",
        unit,
      });
    }

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

  // 🔴 NAMED AFTER THE MODEL EXISTS, BECAUSE THE EVIDENCE IS CROSS-PAGE. Running
  // furniture is only visible by comparing every page against every other, which
  // is a property of the whole document rather than of the page being read. This
  // relabels blocks and changes nothing else — text, rect, unit, id and locator
  // are carried through, so a citation written against this parse still resolves.
  return classifyFurniture(buildDocument({
    blocks,
    format: "pdf",
    title,
    units: pages.map((page, index) => ({
      index,
      kind: "page",
      size: { height: page.height, width: page.width },
    })),
  }));
}

/** Re-exported so callers measuring a page do not reimplement the union. */
export { unionBox };
