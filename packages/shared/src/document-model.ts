/**
 * The canonical document model: units → blocks.
 *
 * 🔴 WHY THIS EXISTS, AND WHY IT COMES FIRST.
 *
 * Until now the shared parse output was `{ kind, title, text, coverage }`, where
 * `text` was the ENTIRE representation. Everything structural — the table grid,
 * the heading hierarchy, the list numbering, the figure beside the paragraph, the
 * page a sentence sat on — was flattened before it left the parser.
 *
 * That single string is why four separate phases were stuck:
 *
 *   Phase 3 built a Word structure reader whose output was immediately rendered
 *     back to markdown and discarded. The recovery numbers were true about the
 *     reader and false about what any model actually received.
 *   Phase 2 would have had nowhere to put a figure or a bounding box, so PDF
 *     extraction would have been written once against text and again against
 *     structure.
 *   Phase 4 cannot "chunk by structural boundaries" when no boundary survives.
 *   Phase 5 cannot produce a verifiable locator when there is nothing to locate.
 *
 * One model, produced by every format, consumed by everything downstream.
 *
 * ── THE RULE THAT SHAPES EVERY TYPE HERE ──────────────────────────────────
 *
 * **Never fabricate a locator a format cannot provide.** Optional fields in this
 * file are optional because some formats genuinely lack the fact, not because
 * filling them in is inconvenient. A PDF block has a page and may have a
 * rectangle. A Word block has neither and must never be given one — Word
 * paginates at layout time, so "page 7 of a .docx" is a number that did not exist
 * until something rendered it, and every later check of that citation would pass
 * while pointing at nothing.
 *
 * The model makes that structural rather than a convention: a unit carries its
 * own KIND, and `describeLocator` refuses to say "page" about a unit that is not
 * one. There is no code path that prints a page for a Word document, so no future
 * caller can create one by accident.
 *
 * PURE. No I/O, no parsing, no format knowledge — producers live beside their
 * formats and hand back this shape.
 */

/**
 * What one addressable piece of a document is called, per format.
 *
 * 🔴 `body` IS NOT A FALLBACK, IT IS AN ANSWER. A Word file is one continuous
 * flow; saying so is truthful. Saying "page 1 of 1" would not be, and modelling
 * it as "no unit at all" would break the invariant that every block belongs
 * somewhere — which is what makes counts reconcile.
 */
import type { FigureCoverage, FigureSkipReason } from "./extraction-coverage.ts";

export type DocUnitKind = "page" | "slide" | "sheet" | "body" | "image";

/**
 * Which formats can produce this model.
 *
 * 🔴 ADDING ONE MEANS ADDING IT TO `FORMATS` IN document-envelope.ts TOO. That
 * Set is the runtime half of this type, hand-written, and `readDocumentModel`
 * returns null for the WHOLE model when `format` is not in it — so a format
 * added here alone would parse perfectly, store perfectly, and read back as
 * nothing. `document-envelope.test.ts` round-trips every member of this union
 * for exactly that reason; keep the two in step by making that test fail.
 */
export type DocFormat = "pdf" | "docx" | "pptx" | "image" | "xlsx" | "csv";

/**
 * A rectangle in UNIT-RELATIVE coordinates, every value in 0..1.
 *
 * Relative rather than absolute points, because the consumer is a crop request
 * against a render whose resolution is chosen at query time — Phase 2 reinspects
 * regions at high resolution, and a rectangle in 72-dpi points would have to be
 * rescaled at every call site, which is where sign and origin errors live.
 *
 * Origin is TOP-LEFT, matching how every renderer we use hands back a canvas.
 * PDF's own coordinate space is bottom-left; converting it is the producer's job
 * and happens once.
 */
export interface DocRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One page, slide, sheet, or the single body of a flowing document. */
export interface DocUnit {
  /** 0-based position in the document. */
  index: number;
  kind: DocUnitKind;
  /**
   * The unit's own box, when the format has one. Present for PDF and PPTX,
   * absent for Word. Its only job is to let a relative rect become a crop.
   */
  size?: { width: number; height: number };
  /**
   * What the DOCUMENT calls this unit — a slide's title placeholder, a
   * spreadsheet's sheet name.
   *
   * 🔴 NEVER GENERATED. "Slide 12" is a locator and is derived from `index`;
   * this is the author's own name for the unit, and it is absent when they did
   * not give one. A label invented from a heading would be indistinguishable
   * from one the author wrote, and citations would quote it as the deck's words.
   */
  label?: string;
  /**
   * The source marks this whole unit hidden — a spreadsheet's hidden sheet.
   *
   * 🔴 KEPT, NOT DROPPED, for the same reason as `DocTable.hiddenRows`: a hidden
   * sheet is often the marking scheme or the author's working, and whether a
   * learner should see it is not the parser's decision to make silently. A
   * consumer can exclude it; only the parser can lose it.
   *
   * 🔴 ANYTHING ADDED TO `DocUnit` MUST ALSO BE ADDED TO `readDocumentModel`,
   * which rebuilds units FIELD BY FIELD — `label` and `size` both died there
   * once already. A field not listed there is gone between the database and
   * every consumer, silently.
   */
  hidden?: boolean;
}

export type DocBlockKind =
  | "heading"
  | "paragraph"
  | "listItem"
  | "table"
  | "figure"
  | "caption"
  | "equation"
  | "note"
  /**
   * Running page furniture — the header and footer a document repeats on every
   * page.
   *
   * 🔴 A KIND, NOT A DELETION. An external benchmark scored Page-header and
   * Page-footer at exactly 0.0 F1 because Nemesis had no way to say either, so a
   * course name and "Page 3 of 30" were indistinguishable from body prose. These
   * blocks keep their text, rect, unit, id and locator; what changes is that a
   * consumer can now tell furniture from what the author wrote, and leave it out
   * of ordinary prose flow without guessing.
   */
  | "pageHeader"
  | "pageFooter";

/**
 * A table kept as a grid.
 *
 * 🔴 THE GRID IS THE WHOLE POINT. Flattening a table to lines is worse than
 * dropping it: the cells survive as ordinary text, so a rubric or a dosing table
 * arrives looking like prose and gets answered confidently and wrongly. Measured
 * over 124 real Word files, 8,355 cells were reaching the model this way.
 */
/**
 * One cell, which may cover more than one position in the grid.
 *
 * 🔴 A MERGED CELL IS A STATEMENT ABOUT SCOPE, AND LOSING IT LOSES THE VALUE
 * EVERYWHERE BUT ONE PLACE. Text is seated by its centre, so a name spanning
 * three schedule rows lands in the first and the other two come back empty —
 * indistinguishable from a document that genuinely left them blank. Measured
 * over the 164-document corpus: 607 vertical and 280 horizontal merge pairs
 * across the 270 tables the parser accepts, leaving 221 cells blank purely
 * because something covers them.
 *
 * `row`/`column` are the cell's ORIGIN — the top-left position it occupies.
 * Spans are omitted when 1, so an ordinary cell costs two extra numbers rather
 * than four.
 */
export interface DocCell {
  /**
   * What the cell shows.
   *
   * For a spreadsheet this is the DISPLAYED value — the cached result of a
   * formula, or the stored value rendered where its number format makes the
   * stored form unintelligible (see `raw`). It is what `rows` projects, what
   * retrieval indexes, and what a person reading the sheet would see.
   */
  text: string;
  /** 0-based grid row of the cell's top-left position. */
  row: number;
  /** 0-based grid column of the cell's top-left position. */
  column: number;
  /** Rows covered, counting its own. Omitted when 1. */
  rowSpan?: number;
  /** Columns covered, counting its own. Omitted when 1. */
  colSpan?: number;
  /**
   * The formula, without its leading `=`. Spreadsheets only.
   *
   * 🔴 A FORMULA AND ITS CACHED RESULT ARE DIFFERENT FACTS AND MAY CONTRADICT
   * EACH OTHER (owner, 2026-08-12). A file written by a program with no formula
   * engine carries `<f>` and no cached value at all — measured: 4 of 15 cells in
   * a workbook openpyxl wrote. A file edited by such a program carries a cached
   * value computed from inputs that have since changed — measured: a fixture
   * whose `B2` is 9,999 while `D2 = B2*C2` still caches 2.5, from when B2 was 10.
   *
   * Neither may be silently chosen as the truth. `text` says what the file
   * claims the answer is; this says what the file says the question was. A
   * consumer that needs to know whether to trust the number has both.
   */
  formula?: string;
  /**
   * The stored value, when `text` is a rendering of it rather than a copy.
   *
   * 🔴 PRESENT ONLY WHEN THEY GENUINELY DIFFER, so its absence means "`text` is
   * what the file stores". A date is held as a serial number — measured:
   * 2026-03-15 is `<v>46096</v>` — and showing "46096" to a student is not a
   * styling shortfall, it is a different value. So dates are rendered and the
   * serial kept here.
   *
   * 🔴 A PERCENTAGE IS NOT DECORATION EITHER, AND CALLING IT THAT WAS WRONG.
   * `0.075` and `7.5%` are the same number and not the same source: Nemesis may
   * quote a cell, teach from it, or ask a learner what it says, and every one of
   * those is wrong if we show a fraction where the document showed a percentage.
   * So percentages, currency and grouped decimals are rendered too, and the
   * stored number lives here. Formats outside those classes are refused rather
   * than approximated — see `format`.
   */
  raw?: string;
  /**
   * The source's own presentation code for the value — a spreadsheet's number
   * format, such as `0.0%` or `"$"#,##0.00`.
   *
   * 🔴 EVIDENCE, NOT STYLING. It is why `text` differs from `raw`, it lets a
   * consumer re-render the value differently, and when the parser could NOT
   * render a format it is the only record that we declined rather than that the
   * cell was plain. Absent means the source stated no format.
   */
  format?: string;
}

export interface DocTable {
  /**
   * The grid as a plain array of rows.
   *
   * 🔴 DERIVED FROM `cells` WHENEVER `cells` IS PRESENT, NEVER MAINTAINED BESIDE
   * IT. Two representations of one table are two things that can disagree, and
   * the disagreement is invisible until a consumer picks the wrong one. This is
   * the projection `projectCells` computes, and `document-model.test.ts` asserts
   * the equality on every table a producer emits — the same arrangement the
   * stored envelope already uses for `text` alongside `model`.
   *
   * 🔴 A COVERED POSITION IS EMPTY HERE, AND THAT IS DELIBERATE. Repeating a
   * spanning value into the positions it covers would put text in the stored
   * grid that the document printed once, and nothing downstream could tell the
   * copy from the original. `resolveCell` answers "what governs this position"
   * for consumers that need it, from the span, without writing the answer down.
   */
  rows: string[][];
  /**
   * The cells, when the producer could tell one from another.
   *
   * Absent for a producer that only knows a rectangular grid, which is a
   * truthful "no merge information" rather than "no merges" — the same
   * distinction `figure.description` makes between unexamined and empty.
   */
  cells?: DocCell[];
  /**
   * How many leading rows are headers.
   *
   * 🔴 0 IS THE HONEST DEFAULT. Word and PowerPoint mark header rows explicitly;
   * a PDF's table is inferred from geometry and usually says nothing. Guessing
   * "row 0 is always a header" would attach the wrong label to every value in
   * every table that starts with data.
   */
  headerRows: number;
  /**
   * What each column is called — even when this fragment did not print them.
   *
   * 🔴 A CONTINUATION PAGE USUALLY HAS NO HEADER, AND WITHOUT THIS ITS COLUMNS
   * ARE ANONYMOUS. A real syllabus prints `Date | Time | Topic | …` once and then
   * runs the schedule across ten more pages that repeat none of it. A consumer
   * holding only `rows` cannot tell which cell held the date, so it falls back to
   * reading the whole row as text — which is exactly the flattening the grid
   * exists to prevent. Filled from this fragment's own header when it has one,
   * and otherwise inherited from the fragment it continues.
   *
   * Absent when no header is known. NEVER invented: unnamed columns are a
   * missing fact, and a guessed name would be attached to every value beneath it.
   */
  columns?: string[];
  /**
   * Whether `columns` was printed here or carried from an earlier fragment.
   *
   * Kept because provenance differs: an inherited name is a deduction about
   * document structure, and a citation that shows it should be able to say so.
   */
  headerSource?: "present" | "inherited";
  /**
   * The unit holding the fragment this one continues, when it is a continuation.
   *
   * Lets a consumer stitch a table split across pages back together without
   * re-deriving adjacency — which is the parser's job, not theirs.
   */
  continuesFromUnit?: number;
  /**
   * Where grid position (0,0) sits in the source's own coordinates. Spreadsheets.
   *
   * 🔴🔴 WITHOUT THIS, EVERY CITATION INTO AN OFFSET SHEET POINTS AT THE WRONG
   * CELL, AND NO ROUND-TRIP TEST CAN SEE IT. A grid coordinate is not a cell
   * reference: a sheet whose data begins at C5 has its first cell at grid (0,0),
   * and calling that "A1" is wrong by two columns and four rows. Stored-versus-
   * read-back comparison passes anyway, because both sides are wrong identically
   * — so the assertion that catches this has to be the A1 STRING, which is what
   * `cellRef` produces and what the fixture `offset-origin.xlsx` exists to prove.
   *
   * Absent means the grid starts at the origin, which is the common case and
   * what every non-spreadsheet producer means.
   */
  origin?: { row: number; column: number };
  /**
   * Grid rows and columns the source marks hidden.
   *
   * 🔴 HIDDEN IS NOT DELETED, AND THE CHOICE OF WHAT TO DO ABOUT IT IS THE
   * CONSUMER'S. A hidden column often holds the working a spreadsheet's author
   * did not want printed; a hidden row is sometimes a withdrawn entry and
   * sometimes the answer key. Dropping them here would decide that silently for
   * every caller, and the content would be unrecoverable. Recording them lets a
   * caller exclude what a person would not see WITHOUT the parser destroying it.
   *
   * Indices are grid-relative, so they compose with `origin` rather than
   * duplicating it.
   */
  hiddenRows?: number[];
  hiddenColumns?: number[];
  /**
   * The source's own name for this table — a spreadsheet's defined table
   * (`ListObject`), never a name we invented. Absent when the file gives none.
   */
  name?: string;
  /**
   * For a delimited text file, the character that actually separated the fields.
   *
   * 🔴 PROVENANCE FOR A DECISION, NOT DECORATION. A `.csv` is not always
   * comma-separated — an export from a locale that uses a comma for decimals
   * writes semicolons — so reading one involves a choice, and this records which
   * choice was made. Absent for a comma file, and absent entirely for every
   * format that has real cell boundaries instead of a separator.
   */
  delimiter?: string;
}

/**
 * A figure, and — separately — whether anyone has looked at it.
 *
 * 🔴 THE TWO FACTS ARE DISTINCT AND THE DISTINCTION IS THE HONESTY LAYER.
 * `description === undefined` means NOT EXAMINED. It does not mean "no content".
 * Measured over 120 real course PDFs: 1,807 figures sit on pages that also carry
 * plenty of text, so the current routing rule never looks at them and coverage
 * still reports those pages complete. A figure with no description must be
 * countable, which is why absence is a value here rather than an empty string.
 */
export interface DocFigure {
  /** The format's own name for it — a relationship id, an XObject name. */
  ref?: string;
  /** What vision saw. ABSENT means nobody looked, not "nothing there". */
  description?: string;
  /** Why it was not examined, when that was a decision rather than an omission. */
  skipped?:
    | "decorative"
    | "too-small"
    | "over-cap"
    | "unsupported"
    /** Vision was not configured, or the provider failed for this figure. */
    | "vision-unavailable"
    /**
     * Something looked and came back with nothing to say.
     *
     * 🔴 DISTINCT FROM NO REASON AT ALL, which is what "nobody looked" is. The
     * content is missing either way — `lostFigures` counts both — but only one
     * of them is a gap in the pipeline, and collapsing them would make a vision
     * pass that silently returned nothing look like a vision pass that ran.
     */
    | "examined-empty";
}

/** One structural element. Blocks are ordered; order is reading order. */
export interface DocBlock {
  /** Stable within one parse of one document, e.g. `b0`, `b1`. */
  id: string;
  kind: DocBlockKind;
  /** Index into `DocumentModel.units`. Every block belongs to exactly one. */
  unit: number;
  /** The block's text. A figure's text is its caption, not its description. */
  text: string;
  /** Enclosing headings, outermost first. Empty at the top level. */
  headingPath: string[];
  /** heading only: 1–9. */
  level?: number;
  /** listItem only: the resolved marker, e.g. "3." or "•". */
  marker?: string;
  /** listItem only: nesting depth. */
  depth?: number;
  table?: DocTable;
  figure?: DocFigure;
  /** Where it sat, when the format provides geometry. Never invented. */
  rect?: DocRect;
}

export interface DocumentModel {
  format: DocFormat;
  title: string | null;
  units: DocUnit[];
  blocks: DocBlock[];
}

/**
 * A pointer back to one block, carrying everything needed to reopen it AND
 * everything needed to describe it without lying.
 *
 * `unitKind` travels with the locator on purpose. A consumer holding only a
 * number would have to decide for itself what to call it, and the first one that
 * guessed "page" would reintroduce the exact fabrication this model prevents.
 */
export interface DocLocator {
  blockId: string;
  unit: number;
  unitKind: DocUnitKind;
  headingPath: string[];
  rect?: DocRect;
}

// ── Construction ───────────────────────────────────────────────────────────

/** Block ids are positional and assigned in one place so they cannot diverge. */
export function blockId(index: number): string {
  return `b${index}`;
}

/**
 * Assemble a model, assigning ids by position.
 *
 * Producers describe blocks; they do not name them. A producer that minted its
 * own ids would eventually mint a duplicate, and a duplicate id in a citation is
 * indistinguishable from a correct one.
 */
export function buildDocument(input: {
  format: DocFormat;
  title: string | null;
  units: DocUnit[];
  blocks: readonly Omit<DocBlock, "id">[];
}): DocumentModel {
  return {
    blocks: input.blocks.map((block, index) => ({ ...block, id: blockId(index) })),
    format: input.format,
    title: input.title,
    units: input.units,
  };
}

/**
 * Fold text a vision model read off a unit back into the document.
 *
 * 🔴 THE MERGED RESULT IS ONE REPRESENTATION, NOT TWO. The alternative — keep
 * the blocks and separately build a flat string that also holds the vision text
 * — leaves a document whose text says one thing and whose citations point into
 * another. That divergence reads downstream exactly like a hallucination and is
 * far harder to trace than a missing paragraph.
 *
 * The added block is a plain paragraph carrying the unit's heading path, placed
 * after that unit's own blocks so reading order survives. Ids are reassigned,
 * because ids are positional and an appended block would otherwise collide.
 *
 * 🔴 IT DOES NOT REPLACE ANYTHING. Native and visual evidence are merged, never
 * alternatives: a page with three paragraphs and a diagram keeps both.
 */
export function withVisionText(doc: DocumentModel, byUnit: ReadonlyMap<number, string>): DocumentModel {
  if (byUnit.size === 0) return doc;
  const added: Omit<DocBlock, "id">[] = [];
  const out: Omit<DocBlock, "id">[] = [];
  let previousUnit: number | null = null;
  // 🔴 THE NOTE INHERITS THE SECTION IT WAS READ INSIDE, DELIBERATELY.
  // An empty heading path would be an accident rather than a decision: anything
  // that selects or extracts by section — retrieval, and every Phase 6 extractor
  // — would silently skip every word vision recovered, which is exactly the
  // content the native pass could not get. The page's own section is a true fact
  // about where that text sat.
  let path: string[] = [];

  const flush = () => {
    if (previousUnit === null) return;
    const text = byUnit.get(previousUnit)?.trim();
    if (text) out.push({ headingPath: [...path], kind: "note", text, unit: previousUnit });
  };

  for (const block of doc.blocks) {
    if (previousUnit !== null && block.unit !== previousUnit) flush();
    previousUnit = block.unit;
    path = block.kind === "heading" ? [...block.headingPath, block.text] : block.headingPath;
    out.push(block);
  }
  flush();

  // A unit with no blocks of its own — a page that is entirely a picture — has
  // nowhere to be appended to above, so it is added here in unit order.
  const covered = new Set(doc.blocks.map((b) => b.unit));
  for (const [unit, text] of [...byUnit.entries()].sort((a, b) => a[0] - b[0])) {
    if (covered.has(unit) || !text.trim()) continue;
    added.push({ headingPath: [], kind: "note", text: text.trim(), unit });
  }

  return buildDocument({
    blocks: [...out, ...added].sort((a, b) => a.unit - b.unit),
    format: doc.format,
    title: doc.title,
    units: doc.units,
  });
}

/** The locator for a block. Carries a rect only when the block had one. */
export function locate(doc: DocumentModel, block: DocBlock): DocLocator {
  const unit = doc.units[block.unit];
  return {
    blockId: block.id,
    headingPath: block.headingPath,
    unit: block.unit,
    unitKind: unit?.kind ?? "body",
    ...(block.rect ? { rect: block.rect } : {}),
  };
}

/**
 * How a locator is spoken about.
 *
 * 🔴 THIS FUNCTION IS THE ENFORCEMENT POINT FOR THE NO-FABRICATED-LOCATOR RULE.
 * A `body` unit produces no unit phrase at all — the heading path is the whole
 * address, because it is the only part that is true. Every user-facing citation
 * string goes through here so there is exactly one place that could ever be
 * wrong, and a test asserts no `body` locator ever renders a number.
 */
export function describeLocator(locator: DocLocator): string {
  const where =
    locator.unitKind === "body" || locator.unitKind === "image"
      ? ""
      : `${unitNoun(locator.unitKind)} ${locator.unit + 1}`;
  const path = locator.headingPath.length ? locator.headingPath.join(" › ") : "";
  if (where && path) return `${where} · ${path}`;
  return where || path || "this document";
}

function unitNoun(kind: DocUnitKind): string {
  if (kind === "page") return "page";
  if (kind === "slide") return "slide";
  return "sheet";
}

// ── Reading ────────────────────────────────────────────────────────────────

/**
 * Cells → the flat grid, with a covered position left empty.
 *
 * The one definition of what `rows` means, so a producer cannot invent a second.
 * Sized from the cells themselves rather than from a caller's expectation: a
 * span reaching past the last origin still has to fit.
 */
export function projectCells(cells: readonly DocCell[]): string[][] {
  let height = 0;
  let width = 0;
  for (const c of cells) {
    height = Math.max(height, c.row + (c.rowSpan ?? 1));
    width = Math.max(width, c.column + (c.colSpan ?? 1));
  }
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => ""));
  for (const c of cells) {
    const row = grid[c.row];
    if (row && c.column < width) row[c.column] = c.text;
  }
  return grid;
}

/**
 * The cell governing a position, following spans.
 *
 * 🔴 THE FUNCTION THAT MAKES A MERGE MEAN SOMETHING. Reading `rows[r][c]`
 * directly gives "" for every position a span covers, so a consumer asking which
 * instructor teaches the third session of a block gets silence where the
 * document is perfectly clear. Returns null only where nothing covers the
 * position at all.
 */
export function resolveCell(table: DocTable, row: number, column: number): DocCell | null {
  if (!table.cells) {
    const text = table.rows[row]?.[column];
    return text === undefined ? null : { column, row, text };
  }
  for (const c of table.cells) {
    if (row < c.row || row >= c.row + (c.rowSpan ?? 1)) continue;
    if (column < c.column || column >= c.column + (c.colSpan ?? 1)) continue;
    return c;
  }
  return null;
}

/**
 * The text governing a position, or "" where nothing does.
 *
 * 🔴 STRICTLY ADDITIVE, AND THAT IS A DELIBERATE DEFENCE RATHER THAN A
 * CONVENIENCE. A position that already carries text keeps it, and only an EMPTY
 * position can gain a value from a span. So the worst a disagreement between
 * `rows` and `cells` can do — a row stored by a different build, hand-edited, or
 * restored from a backup — is fail to resolve a merge. It can never blank a cell
 * that has text in it, which is the failure mode that would be invisible.
 */
export function cellText(table: DocTable, row: number, column: number): string {
  const own = table.rows[row]?.[column] ?? "";
  if (own.trim()) return own;
  return resolveCell(table, row, column)?.text ?? own;
}

/**
 * Render a table as markdown.
 *
 * Shared rather than per-producer because a table's text form is what reaches a
 * model, and two renderers would mean a Word table and a PDF table describing the
 * same grid differently — which is a retrieval bug that looks like a model bug.
 *
 * 🔴 A SPAN IS RESOLVED HERE AND NOWHERE EARLIER. Markdown has no syntax for a
 * merged cell, so the choice is between printing the governing value in each
 * position it covers and printing nothing. Printing nothing is what happens
 * today, and it reads to a model as "this document does not say" — the strongest
 * possible claim, made about the one case where the document is explicit. The
 * value is written into the RENDERING, which is derived and thrown away, and
 * never into `rows`, which is stored: nothing persisted gains a copy, so no
 * later reader can mistake the copy for a second printing.
 */
export function tableToMarkdown(table: DocTable): string {
  if (table.rows.length === 0) return "";
  const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
  const lines = table.rows.map((row, r) => `| ${row.map((_, c) => cell(cellText(table, r, c))).join(" | ")} |`);
  // A separator is only drawn where a header genuinely exists. Drawing one after
  // row 0 regardless is how a table of data acquires a fake header.
  if (table.headerRows > 0 && table.headerRows <= table.rows.length) {
    const width = table.rows[table.headerRows - 1]?.length ?? 0;
    lines.splice(table.headerRows, 0, `| ${Array.from({ length: width }, () => "---").join(" | ")} |`);
  }
  return lines.join("\n");
}

/** One block as text, in the form a model should receive it. */
export function blockToText(block: DocBlock): string {
  if (block.kind === "table" && block.table) return tableToMarkdown(block.table);
  if (block.kind === "heading") return `${"#".repeat(Math.min(block.level ?? 1, 6))} ${block.text}`;
  if (block.kind === "listItem") {
    const indent = "  ".repeat(block.depth ?? 0);
    return `${indent}${block.marker ?? "•"} ${block.text}`.trimEnd();
  }
  if (block.kind === "figure") {
    // 🔴 A FIGURE'S TEXT IS NOT ITS DESCRIPTION. The caption is what the document
    // says; the description is what a model said about it. Merging them makes an
    // inference indistinguishable from the source, which is the failure this
    // whole roadmap exists to prevent.
    const caption = block.text.trim();
    const seen = block.figure?.description?.trim();
    if (caption && seen) return `[Figure: ${caption}]\n${seen}`;
    if (caption) return `[Figure: ${caption}]`;
    if (seen) return `[Figure]\n${seen}`;
    // 🔴 A FIGURE NOBODY READ CONTRIBUTES NO TEXT — IT DOES NOT CONTRIBUTE A
    // SENTENCE SAYING SO. This used to return "[Figure — not examined]", which
    // is application metadata wearing the costume of source text: a sentence
    // that appears nowhere in the document, inserted into the document's own
    // content and then carried into chunks, embeddings, retrieval, Canvas
    // evidence and chat context as if the author had written it.
    //
    // Measured externally before this changed: 8,135 occurrences across 769 of
    // 2,036 documents, and the single largest cause of ParseBench scoring
    // Nemesis as hallucinating text it never read.
    //
    // THE COVERAGE GAP IS NOT HIDDEN BY THIS — it is moved to where it belongs.
    // The block still exists with `kind: "figure"`, `coverage` still counts the
    // figure as skipped and says why, and `figureFacts` still carries
    // `examined: false`. What disappears is only the forged prose. A consumer
    // that wants to tell a learner "there is a figure here" reads the block; it
    // must not learn that from a sentence pretending to be the document.
    return "";
  }
  return block.text;
}

/** The whole document as text. The flat form, derived rather than stored. */
export function documentToText(doc: DocumentModel): string {
  return doc.blocks
    .map(blockToText)
    .filter((line) => line.trim().length > 0)
    .join("\n\n");
}

/**
 * One string per unit, in unit order, including units that produced nothing.
 *
 * 🔴 THE EMPTY ENTRIES ARE THE POINT. A document that is 90% photographs of
 * pages joins into a perfectly plausible string, and only the per-unit view
 * shows the holes — which is what decides where vision is spent and what
 * coverage reports as unread. An array that skipped empty units would lose the
 * one fact it exists to carry.
 */
export function unitTexts(doc: DocumentModel): string[] {
  const out = doc.units.map(() => [] as string[]);
  for (const block of doc.blocks) {
    const text = blockToText(block).trim();
    if (text) out[block.unit]?.push(text);
  }
  return out.map((parts) => parts.join("\n"));
}

// ── Counting, for coverage ─────────────────────────────────────────────────

export interface DocumentCounts {
  units: number;
  blocks: number;
  headings: number;
  paragraphs: number;
  listItems: number;
  tables: number;
  tableCells: number;
  figures: number;
  /** Figures nobody has looked at AND nobody decided to skip. */
  figuresUnexamined: number;
  equations: number;
}

/**
 * Count what a document holds.
 *
 * 🔴 `figuresUnexamined` IS THE NUMBER PHASE 2 EXISTS TO DRIVE DOWN, and it is
 * deliberately not the same as "figures without a description". A figure skipped
 * for a stated reason is a disclosed decision; a figure with neither a
 * description nor a reason is an undisclosed gap. Under "Unknown ≠ complete",
 * only the second kind may keep a document from being called complete.
 */
export function countDocument(doc: DocumentModel): DocumentCounts {
  const counts: DocumentCounts = {
    blocks: doc.blocks.length,
    equations: 0,
    figures: 0,
    figuresUnexamined: 0,
    headings: 0,
    listItems: 0,
    paragraphs: 0,
    tableCells: 0,
    tables: 0,
    units: doc.units.length,
  };
  for (const block of doc.blocks) {
    if (block.kind === "heading") counts.headings += 1;
    else if (block.kind === "listItem") counts.listItems += 1;
    else if (block.kind === "equation") counts.equations += 1;
    else if (block.kind === "table") {
      counts.tables += 1;
      for (const row of block.table?.rows ?? []) counts.tableCells += row.length;
    } else if (block.kind === "figure") {
      counts.figures += 1;
      if (!block.figure?.description && !block.figure?.skipped) counts.figuresUnexamined += 1;
    } else counts.paragraphs += 1;
  }
  return counts;
}

/**
 * The model's figures, in the shape coverage records.
 *
 * 🔴 THE MAPPING IS WHERE HONESTY IS DECIDED, so it is written once, here.
 * `decorative` is free — a rule or a bullet costs the student nothing. Anything
 * else, including a figure with no description and no stated reason, is content
 * that was uploaded and not delivered, and `lostFigures` counts it. That is what
 * stops a page with an unread diagram from being reported as fully read.
 */
export function figureCoverageOf(doc: DocumentModel): FigureCoverage {
  const reasons: Partial<Record<FigureSkipReason, number>> = {};
  let found = 0;
  let described = 0;
  for (const block of doc.blocks) {
    if (block.kind !== "figure") continue;
    found += 1;
    if (block.figure?.description) { described += 1; continue; }
    const reason: FigureSkipReason =
      block.figure?.skipped === "examined-empty"
        ? "examined-empty"
        : block.figure?.skipped === "vision-unavailable"
        ? "vision-unavailable"
        : block.figure?.skipped === "decorative" || block.figure?.skipped === "too-small"
        ? "decorative"
        : block.figure?.skipped === "unsupported"
          ? "unreadable-format"
          : block.figure?.skipped === "over-cap"
            ? "over-cap"
            : "not-examined";
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  return { described, found, reasons, skipped: found - described };
}

/** Which units hold a figure nobody examined. Drives per-unit coverage. */
export function unitsWithUnexaminedFigures(doc: DocumentModel): number[] {
  const out = new Set<number>();
  for (const block of doc.blocks) {
    if (block.kind !== "figure") continue;
    if (block.figure?.description || block.figure?.skipped) continue;
    out.add(block.unit);
  }
  return [...out].sort((a, b) => a - b);
}
