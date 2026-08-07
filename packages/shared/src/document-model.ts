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

/** Which formats can produce this model. */
export type DocFormat = "pdf" | "docx" | "pptx" | "image";

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
}

export type DocBlockKind =
  | "heading"
  | "paragraph"
  | "listItem"
  | "table"
  | "figure"
  | "caption"
  | "equation"
  | "note";

/**
 * A table kept as a grid.
 *
 * 🔴 THE GRID IS THE WHOLE POINT. Flattening a table to lines is worse than
 * dropping it: the cells survive as ordinary text, so a rubric or a dosing table
 * arrives looking like prose and gets answered confidently and wrongly. Measured
 * over 124 real Word files, 8,355 cells were reaching the model this way.
 */
export interface DocTable {
  rows: string[][];
  /**
   * How many leading rows are headers.
   *
   * 🔴 0 IS THE HONEST DEFAULT. Word and PowerPoint mark header rows explicitly;
   * a PDF's table is inferred from geometry and usually says nothing. Guessing
   * "row 0 is always a header" would attach the wrong label to every value in
   * every table that starts with data.
   */
  headerRows: number;
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
 * Render a table as markdown.
 *
 * Shared rather than per-producer because a table's text form is what reaches a
 * model, and two renderers would mean a Word table and a PDF table describing the
 * same grid differently — which is a retrieval bug that looks like a model bug.
 */
export function tableToMarkdown(table: DocTable): string {
  if (table.rows.length === 0) return "";
  const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
  const lines = table.rows.map((row) => `| ${row.map(cell).join(" | ")} |`);
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
    return "[Figure — not examined]";
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
