// A Word document as a ParsedDocument: one unit per top-level section, with the
// headings, lists, tables, pictures and footnotes it actually contains.
//
// WHY THIS IS A REWRITE RATHER THAN AN ADAPTER. ./office-text's `docxXmlToText`
// is a flat tag strip — every tag is deleted and what is left is the text. That
// is lossy in one direction and WRONG in the other:
//
//   lost      headings (a document arrives as one undifferentiated wall),
//             list nesting, table grids, every picture, footnote attribution;
//   invented  tracked deletions read as if they were still in the document, and
//             field instruction text ("PAGE \\* MERGEFORMAT", "TOC \\o …")
//             read as if the author had typed it.
//
// The second one is the serious half: a strip cannot tell a `w:delText` from a
// `w:t`, so a contract with a struck-out clause is indexed as though the clause
// survived. That is not a fidelity gap, it is a false statement about the
// document, and no amount of downstream cleverness recovers from it.
//
// So this walks the real tree (./ooxml-tree), resolves styles through their
// inheritance (./docx-styles), and reports what it found and where. The flat
// path stays where it is: the notebook importer still uses it, and this parser
// is not in that call path.
//
// 🔴 KNOWN GAP, recorded rather than papered over: a hyperlink written as a FIELD
// CODE (`HYPERLINK "https://…"` in `w:instrText`) keeps its visible text but
// loses its target, because field instruction text is excluded wholesale. The
// modern `w:hyperlink` element — what Word has written since 2007 — keeps its
// target through the relationships part.
import { strFromU8 } from "fflate";

import {
  directOutlineLevel,
  headingDepthForStyle,
  isListNumbering,
  numberingForStyle,
  outlineDepth,
  readDocxNumbering,
  readDocxStyles,
} from "./docx-styles";
import { MAX_NESTING, readParagraph, textOf, type PendingVisual, type WalkContext } from "./docx-runs";
import { unzipBounded } from "./office";
import { readMediaParts, sha256Hex, visualRole, type MediaEntry } from "./ooxml-media";
import {
  attr,
  child,
  childrenNamed,
  descendantsNamed,
  firstPath,
  intAttr,
  isElement,
  isOn,
  parseXml,
  type XmlElement,
} from "./ooxml-tree";
import {
  estimateTokens,
  type BlockKind,
  type DocBlock,
  type DocCell,
  type DocTable,
  type DocUnit,
  type DocVisual,
  type DocumentParser,
  type Locator,
  type ParsedDocument,
} from "@nemesis/shared";

/** Bump when the extraction changes: a new value means a NEW parse row, so old
 *  parses stay reproducible rather than being silently reinterpreted. */
export const DOCX_PARSER_VERSION = "docx@1";

export interface DocxParse {
  doc: ParsedDocument;
  /** Visual id → bytes, for the caller to store and write back as `assetPath`. */
  imageBytes: Map<string, Uint8Array>;
}

/** Open a .docx and return it in the normalized shape. Throws on a file that is
 *  not a Word document (the route turns that into a friendly error). */
export function parseDocx(bytes: Uint8Array, _fileName?: string): DocxParse {
  const files = unzipBounded(bytes);
  const documentPart = files["word/document.xml"];
  if (!documentPart) throw new Error("That doesn't look like a Word (.docx) file.");

  const text = (name: string): string | null => {
    const data = files[name];
    return data ? strFromU8(data) : null;
  };

  const root = parseXml(strFromU8(documentPart));
  if (!root) throw new Error("That Word file could not be opened.");
  const body = child(root, "w:body") ?? root;

  const ctx: WalkContext = {
    counts: { deletions: 0, fieldInstructions: 0, footnotesRead: 0, paragraphs: 0 },
    footnotes: new Map(),
    numbering: readDocxNumbering(text("word/numbering.xml")),
    rels: readDocumentRels(text("word/_rels/document.xml.rels")),
    styles: readDocxStyles(text("word/styles.xml")),
  };
  ctx.footnotes = readFootnotes(text("word/footnotes.xml"), ctx);

  const flow = readFlow(body, ctx);
  const media = readMediaParts(files, "word/media/");
  const assembled = assemble(flow, media.entries);

  const notes: string[] = [];
  if (ctx.counts.deletions) {
    notes.push(`${ctx.counts.deletions} tracked deletions were excluded, as the document itself excludes them.`);
  }
  if (ctx.counts.fieldInstructions) {
    notes.push(
      `${ctx.counts.fieldInstructions} field codes were skipped; a hyperlink written as a field code keeps its text but not its target.`,
    );
  }
  if (assembled.visualsMissing) notes.push(`${assembled.visualsMissing} pictures are referenced but not stored in the file.`);
  if (media.unwrapped) notes.push(`${media.unwrapped} pictures were recovered from a metafile wrapper.`);

  const title = coreTitle(text("docProps/core.xml")) ?? assembled.firstHeading;

  return {
    doc: {
      contentHash: sha256Hex(bytes),
      coverage: {
        tablesFound: assembled.tables.length,
        unitsFound: assembled.units.length,
        unitsRead: assembled.units.length - assembled.unitsUnread.length,
        visualsFound: assembled.visuals.length + assembled.visualsMissing,
        // KEPT means retrievable — bytes in hand, or a composited graphic a
        // renderer can go and make. Same meaning as the deck parser's, so a
        // consumer reading coverage never has to know which file this was.
        visualsKept: assembled.imageBytes.size + assembled.compositedCount,
        visualsUnreadable: assembled.visualsUnreadable,
        ...(assembled.unitsUnread.length ? { unitsUnread: assembled.unitsUnread } : {}),
        ...(notes.length ? { notes } : {}),
      },
      kind: "docx",
      meta: {
        fieldCodesSkipped: ctx.counts.fieldInstructions,
        footnotesRead: ctx.counts.footnotesRead,
        numberingDefined: ctx.numbering.present,
        paragraphs: ctx.counts.paragraphs,
        stylesDefined: ctx.styles.byId.size,
        trackedDeletionsDropped: ctx.counts.deletions,
      },
      parserVersion: DOCX_PARSER_VERSION,
      tables: assembled.tables,
      units: assembled.units,
      visuals: assembled.visuals,
      ...(title ? { title } : {}),
    },
    imageBytes: assembled.imageBytes,
  };
}

/** The parser in the shape everything downstream consumes. Note it drops
 *  `imageBytes`: a caller that intends to store the pictures wants `parseDocx`. */
export const docxParser: DocumentParser = {
  kind: "docx",
  parse: async (bytes: Uint8Array, fileName: string): Promise<ParsedDocument> => parseDocx(bytes, fileName).doc,
  version: DOCX_PARSER_VERSION,
};

// ── the flow: the document as an ordered list of things ─────────────────────

/** How firmly the document itself drew a boundary here. A `w:sectPr` is the
 *  author dividing the document; a page break is where the page turned. */
type BreakStrength = "section" | "page";

type FlowItem =
  | { at: "block"; kind: BlockKind; text: string; depth?: number }
  | { at: "table"; rows: DocCell[][] }
  | { at: "visual"; visual: PendingVisual }
  | { at: "break"; strength: BreakStrength };

/** The body, flattened to blocks/tables/pictures in reading order, with the
 *  boundaries the document drew between them. */
function readFlow(body: XmlElement, ctx: WalkContext): FlowItem[] {
  const out: FlowItem[] = [];
  for (const element of blockLevel(body, 0)) {
    if (element.name === "w:tbl") {
      const table = readTable(element, ctx, 0);
      out.push({ at: "table", rows: table.rows });
      for (const visual of table.visuals) out.push({ at: "visual", visual });
      continue;
    }
    ctx.counts.paragraphs += 1;
    const para = readParagraph(element, ctx);
    const kind = classifyParagraph(element, ctx);
    const text = para.text.trim();
    const breaks = paragraphBreaks(element);
    // 🔴 EMITTED HERE OR NOT AT ALL, AND EVEN WHEN THE PARAGRAPH SAYS NOTHING.
    // Word writes a page break as an otherwise-EMPTY paragraph, which the
    // `if (text)` below drops — so a break looked for any later than this has
    // already been thrown away, and every headingless document reads as one
    // undivided block no matter how carefully the assembly is written.
    if (breaks.before) out.push({ at: "break", strength: "page" });
    if (text) out.push({ at: "block", text, ...kind });
    for (const visual of para.visuals) {
      out.push({ at: "visual", visual: { ...visual, ...(text ? { nearbyText: text } : {}) } });
    }
    for (const id of para.footnotes) {
      const note = ctx.footnotes.get(id);
      if (!note) continue;
      ctx.counts.footnotesRead += 1;
      out.push({ at: "block", kind: "footnote", text: note });
    }
    if (breaks.after) out.push({ at: "break", strength: "page" });
    if (breaks.endsSection) out.push({ at: "break", strength: "section" });
  }
  return out;
}

/**
 * The boundaries one paragraph carries, measured against the runs that hold its
 * text rather than assumed from its position.
 *
 * A break that comes BEFORE any text starts this paragraph on a new page; one
 * that comes after text means the page turned somewhere inside the paragraph,
 * and since a paragraph is never cut in half here the boundary is recorded
 * after it — the whole paragraph stays on the earlier side.
 *
 * 🔴 A RENDERED BREAK IS A BOUNDARY, NEVER A PAGE NUMBER. `w:lastRenderedPageBreak`
 * records where Word last repaginated: absent in a file that was never rendered,
 * stale in one edited since. Counting these would mint confident, wrong page
 * numbers, which is why every unit they produce stays a `section`.
 */
function paragraphBreaks(paragraph: XmlElement): { before: boolean; after: boolean; endsSection: boolean } {
  const state: BreakScan = {
    after: false,
    before: isOn(firstPath(paragraph, "w:pPr", "w:pageBreakBefore")),
    seenText: false,
  };
  scanBreaks(paragraph, state, 0);
  return {
    after: state.after,
    before: state.before,
    // A `w:sectPr` inside a paragraph's properties ENDS that section, so the
    // boundary falls after this paragraph. The `w:sectPr` hanging off `w:body`
    // is the last section's own properties and no boundary at all; it is not a
    // paragraph, so it is never reached from here. Every type counts, including
    // `continuous`, which changes the layout without turning the page: it is
    // still the author saying one part of the document ended and another began.
    endsSection: firstPath(paragraph, "w:pPr", "w:sectPr") !== undefined,
  };
}

interface BreakScan {
  before: boolean;
  after: boolean;
  seenText: boolean;
}

/** Document-order walk for break markers, refusing exactly what ./docx-runs
 *  refuses: a page break inside a tracked deletion is not in the document. */
function scanBreaks(element: XmlElement, state: BreakScan, depth: number): void {
  if (depth > MAX_NESTING) return;
  for (const node of element.children) {
    if (!isElement(node)) continue;
    const { name } = node;
    if (name === "w:pPr" || name === "w:rPr" || name === "w:del" || name === "w:moveFrom") continue;
    if (name === "w:instrText" || name === "w:delInstrText" || name === "w:delText") continue;
    if (name === "w:br") {
      // `w:type` is absent for a line break and "column" for a column break;
      // neither turns a page.
      if (attr(node, "w:type") === "page") markBreak(state);
      continue;
    }
    if (name === "w:lastRenderedPageBreak") {
      markBreak(state);
      continue;
    }
    if (name === "w:t") {
      if (textOf(node).trim()) state.seenText = true;
      continue;
    }
    scanBreaks(node, state, depth + 1);
  }
}

function markBreak(state: BreakScan): void {
  if (state.seenText) state.after = true;
  else state.before = true;
}

/** Paragraphs and tables, reached through the wrappers Word puts around them —
 *  content controls, tracked insertions, custom XML. */
function* blockLevel(container: XmlElement, depth: number): Generator<XmlElement> {
  if (depth > MAX_NESTING) return;
  for (const node of container.children) {
    if (!isElement(node)) continue;
    if (node.name === "w:p" || node.name === "w:tbl") yield node;
    else if (node.name === "w:sdt") {
      const content = child(node, "w:sdtContent");
      if (content) yield* blockLevel(content, depth + 1);
    } else if (node.name === "w:ins" || node.name === "w:moveTo" || node.name === "w:customXml") {
      yield* blockLevel(node, depth + 1);
    }
    // w:del / w:moveFrom at block level are paragraphs the author removed; a
    // deletion is not content, and counting happens where the runs are read.
  }
}

/**
 * What KIND of paragraph this is.
 *
 * Heading before list, deliberately: a numbered heading ("2.1 Scope") carries
 * both, and it is a heading that happens to be numbered, not a list item that
 * happens to be large.
 */
function classifyParagraph(paragraph: XmlElement, ctx: WalkContext): { kind: BlockKind; depth?: number } {
  const styleId = attr(firstPath(paragraph, "w:pPr", "w:pStyle"), "w:val");
  const direct = directOutlineLevel(paragraph);
  // Direct formatting WINS and is final: a paragraph that sets its own outline
  // level to Word's "body text" is saying it is not a heading, whatever its
  // style would otherwise contribute.
  const depth = direct !== undefined ? outlineDepth(direct) : headingDepthForStyle(ctx.styles, styleId);
  if (depth) return { depth, kind: "heading" };

  const numPr = firstPath(paragraph, "w:pPr", "w:numPr");
  let numId = numPr ? attr(child(numPr, "w:numId"), "w:val") : undefined;
  let level = numPr ? intAttr(child(numPr, "w:ilvl"), "w:val") : undefined;
  if (numId === undefined) {
    const fromStyle = numberingForStyle(ctx.styles, styleId);
    if (fromStyle) {
      numId = fromStyle.numId;
      level ??= fromStyle.ilvl;
    }
  }
  if (numId !== undefined && isListNumbering(ctx.numbering, numId, level ?? 0)) {
    return { depth: (level ?? 0) + 1, kind: "listItem" };
  }
  return { kind: "paragraph" };
}

// ── tables ──────────────────────────────────────────────────────────────────

/**
 * A `w:tbl` as a real grid.
 *
 * 🔴 A CONTINUATION IS MATCHED BY COLUMN, NOT BY CELL ORDINAL. Word writes a
 * horizontally merged cell ONCE with a `gridSpan`, so the third `w:tc` of one
 * row can sit under the fifth column of the row above it. Counting cells instead
 * of columns attaches a vertical merge to the wrong cell — silently, and in
 * exactly the wide tables where it matters. The running column index is what
 * makes `w:vMerge` land where the document put it.
 */
function readTable(
  table: XmlElement,
  ctx: WalkContext,
  depth: number,
): { rows: DocCell[][]; visuals: PendingVisual[] } {
  const rows: DocCell[][] = [];
  const visuals: PendingVisual[] = [];
  if (depth > MAX_NESTING) return { rows, visuals };
  /** Column where a vertical merge started → the cell that owns it. */
  const merges = new Map<number, DocCell>();

  for (const tr of childElementsNamed(table, "w:tr", depth)) {
    const row = rows.length;
    const header = isOn(firstPath(tr, "w:trPr", "w:tblHeader"));
    const cells: DocCell[] = [];
    const touched = new Set<number>();
    let col = 0;

    for (const tc of childElementsNamed(tr, "w:tc", depth)) {
      const span = intAttr(firstPath(tc, "w:tcPr", "w:gridSpan"), "w:val") ?? 1;
      const vMerge = firstPath(tc, "w:tcPr", "w:vMerge");
      const continues = vMerge !== undefined && attr(vMerge, "w:val") !== "restart";
      if (continues) {
        const owner = merges.get(col);
        // The continuation carries no content of its own — it exists to say the
        // cell above reaches this far.
        if (owner) owner.rowSpan = (owner.rowSpan ?? 1) + 1;
        touched.add(col);
        col += span;
        continue;
      }
      const content = cellContent(tc, ctx, depth + 1);
      visuals.push(...content.visuals);
      const cell: DocCell = {
        col,
        row,
        text: content.text,
        ...(span > 1 ? { colSpan: span } : {}),
        ...(header ? { header: true } : {}),
      };
      if (vMerge) {
        merges.set(col, cell);
        touched.add(col);
      } else {
        merges.delete(col);
      }
      cells.push(cell);
      col += span;
    }

    // A column this row said nothing about has ended whatever merge was open.
    for (const key of [...merges.keys()]) if (!touched.has(key)) merges.delete(key);
    rows.push(cells);
  }

  return { rows, visuals };
}

/** One cell's text: its paragraphs, plus any table nested inside it flattened to
 *  tab-separated lines — a nested grid is still the cell's content. */
function cellContent(cell: XmlElement, ctx: WalkContext, depth: number): { text: string; visuals: PendingVisual[] } {
  const lines: string[] = [];
  const visuals: PendingVisual[] = [];
  for (const element of blockLevel(cell, depth)) {
    if (element.name === "w:tbl") {
      const nested = readTable(element, ctx, depth + 1);
      visuals.push(...nested.visuals);
      for (const row of nested.rows) lines.push(row.map((c) => c.text.replace(/\n+/g, " ")).join("\t"));
      continue;
    }
    const para = readParagraph(element, ctx);
    visuals.push(...para.visuals);
    const text = para.text.trim();
    if (text) lines.push(text);
  }
  return { text: lines.join("\n"), visuals };
}

/** Direct children with this name, seen through the wrappers Word interposes
 *  (a tracked row insertion wraps the `w:tr`, a content control wraps a cell). */
function childElementsNamed(container: XmlElement, name: string, depth: number): XmlElement[] {
  const out: XmlElement[] = [];
  if (depth > MAX_NESTING) return out;
  for (const node of container.children) {
    if (!isElement(node)) continue;
    if (node.name === name) out.push(node);
    else if (node.name === "w:sdt") {
      const content = child(node, "w:sdtContent");
      if (content) out.push(...childElementsNamed(content, name, depth + 1));
    } else if (node.name === "w:ins" || node.name === "w:moveTo" || node.name === "w:customXml") {
      out.push(...childElementsNamed(node, name, depth + 1));
    }
  }
  return out;
}

// ── assembly: sections, ids, ordinals ───────────────────────────────────────

interface Draft {
  locator: Locator;
  blocks: DocBlock[];
}

interface Appearance {
  entry: string;
  draft: Draft;
  block: DocBlock;
  nearbyText?: string;
}

interface Assembled {
  units: DocUnit[];
  tables: DocTable[];
  visuals: DocVisual[];
  imageBytes: Map<string, Uint8Array>;
  unitsUnread: number[];
  visualsMissing: number;
  visualsUnreadable: number;
  compositedCount: number;
  firstHeading?: string;
}

// ── the fallback: dividing a document that never divided itself ─────────────

/**
 * Token ceiling for a unit the document did not divide for us.
 *
 * Several times `DEFAULT_TARGET_TOKENS` (the CHUNK size, 400) on purpose. A unit
 * is what a citation NAMES, so a unit one chunk wide would make every citation
 * point at a paragraph and none of them at a place. Roughly three pages of
 * prose: small enough that "section 7 of 22" locates something a reader can go
 * and find, large enough that a unit still holds a whole argument.
 */
export const FALLBACK_UNIT_TOKENS = 2000;

/**
 * How much of the preceding unit a window seam repeats.
 *
 * Same reasoning as ../../../../packages/shared/src/doc-chunk.ts's overlap, one
 * level up: a seam we invented lands mid-argument by construction, and without a
 * tail the sentence that names a thing and the sentence that explains it end up
 * in different units, retrievable only one at a time.
 */
export const FALLBACK_OVERLAP_TOKENS = 120;

/** Kinds that may be repeated across a window seam — the text kinds this parser
 *  emits, and an opt-IN list so anything added later is excluded until someone
 *  decides otherwise. A repeated `figure` would push a phantom `alsoAt` onto its
 *  visual through `groupVisuals`, and a repeated `table` would put the same grid
 *  in the index twice. */
const OVERLAPPABLE: ReadonlySet<BlockKind> = new Set<BlockKind>(["paragraph", "listItem", "footnote"]);

interface FallbackPlan {
  /** Flow indices at which a new unit opens. */
  opensAt: Set<number>;
  /** The subset of `opensAt` the document did NOT authorise — a window seam, and
   *  the only kind of seam that carries an overlap. */
  windowSeams: Set<number>;
}

/**
 * Where to cut a document that offers no headings.
 *
 * 🔴 A TABLE CANNOT BE SPLIT BY ANY OF THIS, STRUCTURALLY RATHER THAN BY CHECK.
 * A `w:tbl` is one flow item, so a cut placed between items has no way to land
 * inside a grid. A single table larger than the ceiling therefore becomes its
 * own oversized-but-whole unit, which `chunkDocument` then packs by rows with
 * the header repeated — the right place for that work, and the reason nothing
 * here tries to do it.
 *
 * Preference order, strongest first: a `w:sectPr` is the author dividing the
 * document, a page break is where the page turned, and a window is ours. The
 * strongest signal the document actually carries divides EVERY unit, because an
 * authored boundary is a statement about the document; weaker signals only
 * subdivide what is still over the ceiling.
 *
 * The brief's "paragraph groups" and "token window" collapse into one stage
 * here, and the collapse is honest rather than lazy: an empty paragraph never
 * reaches the flow at all, so "group paragraphs" cannot mean "cut at a blank
 * line". It can only mean N consecutive items, which is the window.
 */
function planFallback(flow: readonly FlowItem[]): FallbackPlan {
  /** Flow indices of the items that carry content, in reading order. */
  const items: number[] = [];
  /** Token cost of each, parallel to `items`. */
  const tokens: number[] = [];
  /** Positions in `items` a section / page boundary falls immediately before. */
  const sectionAt = new Set<number>();
  const pageAt = new Set<number>();
  let pendingSection = false;
  let pendingPage = false;

  flow.forEach((item, index) => {
    if (item.at === "break") {
      if (item.strength === "section") pendingSection = true;
      else pendingPage = true;
      return;
    }
    // A break before the first item, or a run of them, divides nothing: there is
    // no content on the earlier side for a unit to hold.
    if (items.length) {
      if (pendingSection) sectionAt.add(items.length);
      if (pendingPage) pageAt.add(items.length);
    }
    pendingSection = false;
    pendingPage = false;
    items.push(index);
    tokens.push(estimateTokens(flowText(item)));
  });

  const prefix = [0];
  for (const cost of tokens) prefix.push((prefix[prefix.length - 1] ?? 0) + cost);
  const spanTokens = (from: number, to: number): number => (prefix[to] ?? 0) - (prefix[from] ?? 0);

  const authored = sectionAt.size ? sectionAt : pageAt;
  let starts = [0, ...[...authored].sort((a, b) => a - b)];
  // Page breaks are held back when the document also has section breaks: they
  // are the finer signal, and a section short enough to stand does not need it.
  if (sectionAt.size && pageAt.size) starts = subdivideAt(starts, items.length, spanTokens, pageAt);
  const windowed = subdivideByWindow(starts, items.length, spanTokens, tokens);

  const flowIndex = (position: number): number => items[position] ?? 0;
  return {
    opensAt: new Set(windowed.starts.slice(1).map(flowIndex)),
    windowSeams: new Set([...windowed.seams].map(flowIndex)),
  };
}

/** Insert every candidate boundary that falls inside a span still over the
 *  ceiling. A span that already fits is left alone — see `planFallback`. */
function subdivideAt(
  starts: readonly number[],
  end: number,
  spanTokens: (from: number, to: number) => number,
  candidates: ReadonlySet<number>,
): number[] {
  const sorted = [...candidates].sort((a, b) => a - b);
  const out: number[] = [];
  starts.forEach((from, at) => {
    const to = starts[at + 1] ?? end;
    out.push(from);
    if (spanTokens(from, to) <= FALLBACK_UNIT_TOKENS) return;
    for (const candidate of sorted) if (candidate > from && candidate < to) out.push(candidate);
  });
  return out;
}

/**
 * The last resort: fill a unit until the next item would overflow it. Every
 * window holds AT LEAST ONE item, which is what keeps an item bigger than the
 * whole budget intact instead of orphaning an empty unit.
 *
 * 🔴 SO A SINGLE ITEM OVER THE CEILING IS STILL AN UNBOUNDED UNIT, AND THAT IS
 * NOT ONLY THE LONG TABLE CASE. A document whose whole body is ONE paragraph —
 * how a plain-text or OCR conversion often arrives, with `w:br` line breaks
 * instead of paragraph marks — is one flow item, so it gets one unit however
 * long it is. Bounding it would mean cutting a paragraph into several blocks,
 * which changes what a block MEANS for every document and duplicates the
 * hard split ../../../../packages/shared/src/doc-chunk.ts already performs at
 * the chunk level. Recorded here rather than half-fixed.
 */
function subdivideByWindow(
  starts: readonly number[],
  end: number,
  spanTokens: (from: number, to: number) => number,
  tokens: readonly number[],
): { starts: number[]; seams: Set<number> } {
  const out: number[] = [];
  const seams = new Set<number>();
  starts.forEach((from, index) => {
    const to = starts[index + 1] ?? end;
    out.push(from);
    if (spanTokens(from, to) <= FALLBACK_UNIT_TOKENS) return;
    let opened = from;
    let running = 0;
    for (let at = from; at < to; at += 1) {
      const cost = tokens[at] ?? 0;
      if (at > opened && running + cost > FALLBACK_UNIT_TOKENS) {
        out.push(at);
        seams.add(at);
        opened = at;
        running = 0;
      }
      running += cost;
    }
  });
  return { seams, starts: out };
}

/** What a flow item will contribute as text, so its cost is measured on the
 *  same string the block ends up carrying. */
function flowText(item: FlowItem): string {
  if (item.at === "block") return item.text;
  if (item.at === "table") return tableText(item.rows);
  if (item.at === "visual") return item.visual.caption ?? "";
  return "";
}

/** A grid as the plain text a `table` block carries: one line per row, columns
 *  tab-separated, each cell's own line breaks flattened. */
function tableText(rows: readonly DocCell[][]): string {
  return rows.map((row) => row.map((cell) => cell.text.replace(/\n+/g, " ")).join("\t")).join("\n");
}

/**
 * Repeat the tail of one unit at the head of the next.
 *
 * Walks backwards while the tail still fits the budget, and carries NOTHING when
 * the single last block already exceeds it — the same rule `overlapStart` uses
 * one level down, and in prose it means the overlap is usually a block or two.
 * The copies are fresh objects: ids and ordinals are assigned after this runs,
 * so a repeated paragraph gets its own block id rather than a duplicate of one.
 */
function carryOverlap(previous: Draft | undefined, next: Draft | undefined): void {
  if (!previous || !next) return;
  const tail: DocBlock[] = [];
  let budget = FALLBACK_OVERLAP_TOKENS;
  for (let at = previous.blocks.length - 1; at >= 0; at -= 1) {
    const block = previous.blocks[at];
    if (!block || !OVERLAPPABLE.has(block.kind)) break;
    const cost = estimateTokens(block.text);
    if (cost > budget) break;
    budget -= cost;
    tail.unshift({ ...block });
  }
  if (tail.length) next.blocks = [...tail, ...next.blocks];
}

/**
 * The flow, cut into sections.
 *
 * A "top-level" heading is the SHALLOWEST depth the document actually uses, not
 * literally depth 1 — a report whose outline starts at Heading 2 has top-level
 * headings at depth 2, and splitting only on depth 1 would return the whole file
 * as a single section. Anything before the first heading is its own unit:
 * a title page belongs to the document, not to the chapter that follows it.
 *
 * A document with NO headings — a contract of numbered clauses, a form, a filing,
 * a long plain report, all of which are ordinary rather than exotic — gets the
 * bounded fallback instead (see `planFallback`), because one unit means one
 * locator and every citation in a sixty-page file would say the same thing.
 * The fallback runs ONLY when no heading style is used anywhere, so a document
 * that does have headings is cut exactly where it always was.
 */
function assemble(flow: readonly FlowItem[], media: ReadonlyMap<string, MediaEntry>): Assembled {
  let minDepth = 0;
  for (const item of flow) {
    if (item.at !== "block" || item.kind !== "heading") continue;
    const depth = item.depth ?? 1;
    if (!minDepth || depth < minDepth) minDepth = depth;
  }
  const fallback = minDepth ? undefined : planFallback(flow);
  /** Indices into `drafts` of the units opened at a window seam. */
  const overlapping: number[] = [];

  const drafts: Draft[] = [];
  const tables: DocTable[] = [];
  const appearances: Appearance[] = [];
  const composited: DocVisual[] = [];
  // 🔴 INDEXED BY DEPTH, NOT PUSHED ONTO. A document whose outline starts at
  // Heading 2 and dips to Heading 3 would otherwise leave "Scope" at position 0,
  // so the next Heading 2 lands UNDER it and every section from there on is
  // filed inside its predecessor. A slot per depth keeps the trail honest, and
  // an unfilled level (Heading 4 with no Heading 3 above it) simply has none.
  const byDepth: (string | undefined)[] = [];
  const path = (): string[] => byDepth.filter((entry): entry is string => entry !== undefined);
  let current: Draft | undefined;
  let firstHeading: string | undefined;

  const open = (label?: string): Draft => {
    const trail = path();
    const locator: Locator = {
      kind: "section",
      index: drafts.length + 1,
      ...(label ? { label } : {}),
      ...(trail.length ? { headingPath: trail } : {}),
    };
    const draft: Draft = { blocks: [], locator };
    drafts.push(draft);
    current = draft;
    return draft;
  };

  for (const [index, item] of flow.entries()) {
    // A break is a boundary, not content: `planFallback` has already read it.
    if (item.at === "break") continue;
    if (item.at === "block" && item.kind === "heading") {
      const depth = item.depth ?? 1;
      byDepth.length = depth;
      byDepth[depth - 1] = item.text;
      firstHeading ??= item.text;
      if (depth <= minDepth) open(item.text);
    }
    // 🔴 THE CUT IS DECIDED BEFORE THE DRAFT IS OPENED. `open` bakes the unit's
    // index into a Locator that tables and pictures then hold BY REFERENCE, so a
    // unit that turns out empty cannot be dropped or renumbered afterwards
    // without falsifying locators already handed out.
    if (fallback?.opensAt.has(index) && current?.blocks.length) {
      open();
      if (fallback.windowSeams.has(index)) overlapping.push(drafts.length - 1);
    }
    const draft = current ?? open();

    if (item.at === "block") {
      draft.blocks.push({
        id: "",
        kind: item.kind,
        method: "ooxml",
        ordinal: 0,
        text: item.text,
        ...(item.depth !== undefined ? { depth: item.depth } : {}),
      });
      continue;
    }

    if (item.at === "table") {
      // The nearest heading above it is the only title a bare `w:tbl` has.
      const nearest = path().at(-1);
      const table: DocTable = {
        id: `u${draft.locator.index ?? 0}:t${tables.length}`,
        locator: draft.locator,
        method: "ooxml",
        rows: item.rows,
        ...(nearest ? { title: nearest } : {}),
      };
      tables.push(table);
      draft.blocks.push({
        id: "",
        kind: "table",
        method: "ooxml",
        ordinal: 0,
        tableId: table.id,
        text: tableText(item.rows),
      });
      continue;
    }

    const block: DocBlock = {
      id: "",
      kind: "figure",
      method: "ooxml",
      ordinal: 0,
      text: item.visual.caption ?? "",
      visualId: "",
    };
    if (item.visual.entry === null) {
      const visual: DocVisual = {
        composited: true,
        id: `u${draft.locator.index ?? 0}:g${composited.length}`,
        locator: draft.locator,
        role: "content",
        ...(item.visual.caption ? { caption: item.visual.caption } : {}),
        ...(item.visual.nearbyText ? { nearbyText: item.visual.nearbyText } : {}),
      };
      composited.push(visual);
      block.visualId = visual.id;
      draft.blocks.push(block);
      continue;
    }
    draft.blocks.push(block);
    appearances.push({
      block,
      draft,
      entry: item.visual.entry,
      ...(item.visual.nearbyText ? { nearbyText: item.visual.nearbyText } : {}),
    });
  }

  const grouped = groupVisuals(appearances, media, drafts.length);
  for (const orphan of grouped.orphans) {
    orphan.draft.blocks = orphan.draft.blocks.filter((block) => block !== orphan.block);
  }

  // 🔴 OVERLAP AT A WINDOW SEAM AND NOWHERE ELSE. A section break or a page
  // break is a boundary the AUTHOR drew, and repeating text across one would be
  // inventing continuity the document denies. A window seam is ours. Run after
  // the orphan sweep so nothing about to be removed is copied forward.
  for (const at of overlapping) carryOverlap(drafts[at - 1], drafts[at]);

  const units: DocUnit[] = [];
  const unitsUnread: number[] = [];
  let blockId = 0;
  for (const draft of drafts) {
    draft.blocks.forEach((block, ordinal) => {
      block.id = `b${blockId++}`;
      block.ordinal = ordinal;
    });
    if (!draft.blocks.length) unitsUnread.push(draft.locator.index ?? units.length + 1);
    units.push({ blocks: draft.blocks, locator: draft.locator });
  }

  return {
    compositedCount: composited.length,
    imageBytes: grouped.imageBytes,
    tables,
    units,
    unitsUnread,
    visuals: [...grouped.visuals, ...composited],
    visualsMissing: grouped.orphans.length,
    visualsUnreadable: grouped.unreadable,
    ...(firstHeading ? { firstHeading } : {}),
  };
}

/**
 * Identical bytes are ONE picture in many places — a logo used in six sections is
 * one visual with five `alsoAt` locators. The same rule ./slide-media applies to
 * a deck, for the same reason: without it a document's own letterhead outnumbers
 * its figures.
 */
function groupVisuals(
  appearances: readonly Appearance[],
  media: ReadonlyMap<string, MediaEntry>,
  totalUnits: number,
): {
  visuals: DocVisual[];
  imageBytes: Map<string, Uint8Array>;
  orphans: Appearance[];
  unreadable: number;
} {
  interface Distinct {
    name: string;
    entry: MediaEntry;
    locators: Locator[];
    blocks: DocBlock[];
    caption?: string;
    nearbyText?: string;
  }
  const byContent = new Map<string, Distinct>();
  const orphans: Appearance[] = [];

  for (const appearance of appearances) {
    const entry = media.get(appearance.entry);
    if (!entry) {
      orphans.push(appearance);
      continue;
    }
    const key = entry.fact.contentKey || appearance.entry;
    const existing = byContent.get(key);
    const caption = appearance.block.text.trim();
    if (existing) {
      if (!existing.locators.includes(appearance.draft.locator)) existing.locators.push(appearance.draft.locator);
      existing.blocks.push(appearance.block);
      if (!existing.caption && caption) existing.caption = caption;
      if (!existing.nearbyText && appearance.nearbyText) existing.nearbyText = appearance.nearbyText;
      // Keep the earliest-named copy so the choice is stable across runs.
      if (appearance.entry < existing.name) existing.name = appearance.entry;
    } else {
      byContent.set(key, {
        blocks: [appearance.block],
        entry,
        locators: [appearance.draft.locator],
        name: appearance.entry,
        ...(caption ? { caption } : {}),
        ...(appearance.nearbyText ? { nearbyText: appearance.nearbyText } : {}),
      });
    }
  }

  const visuals: DocVisual[] = [];
  const imageBytes = new Map<string, Uint8Array>();
  let unreadable = 0;

  for (const distinct of byContent.values()) {
    const home = distinct.locators[0];
    if (!home) continue;
    const { fact } = distinct.entry;
    if (!fact.mime) unreadable += 1;
    visuals.push({
      id: distinct.name,
      locator: home,
      role: visualRole(fact, distinct.locators.length, totalUnits),
      ...(distinct.locators.length > 1 ? { alsoAt: distinct.locators.slice(1) } : {}),
      ...(fact.contentKey ? { contentHash: fact.contentKey } : {}),
      ...(fact.width !== null ? { width: fact.width } : {}),
      ...(fact.height !== null ? { height: fact.height } : {}),
      ...(distinct.caption ? { caption: distinct.caption } : {}),
      ...(distinct.nearbyText ? { nearbyText: distinct.nearbyText } : {}),
    });
    for (const block of distinct.blocks) block.visualId = distinct.name;
    if (distinct.entry.bytes) imageBytes.set(distinct.name, distinct.entry.bytes);
  }

  return { imageBytes, orphans, unreadable, visuals };
}

// ── the other parts ─────────────────────────────────────────────────────────

/**
 * Relationship id → where it points.
 *
 * ./slide-media's `parseSlideRels` cannot be reused here for two reasons, both
 * fatal: it resolves targets relative to `ppt/slides/`, and it DROPS external
 * relationships — which is exactly where a hyperlink's URL lives.
 */
export function readDocumentRels(xml: string | null): Map<string, { target: string; external: boolean }> {
  const out = new Map<string, { target: string; external: boolean }>();
  const root = xml ? parseXml(xml) : null;
  if (!root) return out;
  for (const relationship of childrenNamed(root, "Relationship")) {
    const id = attr(relationship, "Id");
    const target = attr(relationship, "Target");
    if (!id || !target) continue;
    const external = attr(relationship, "TargetMode") === "External";
    out.set(id, { external, target: external ? target : resolvePartName(target) });
  }
  return out;
}

/** A target written relative to `word/` (where document.xml lives), as a zip
 *  entry name — the one namespace the rest of this file works in. */
function resolvePartName(target: string): string {
  const clean = target.replace(/^\.\//, "");
  if (clean.startsWith("/")) return clean.slice(1);
  if (clean.startsWith("../")) return clean.slice(3);
  return `word/${clean}`;
}

/**
 * Footnote id → its text.
 *
 * Read with EMPTY relationships on purpose: a footnote's own hyperlinks resolve
 * against `word/_rels/footnotes.xml.rels`, and handing it the document's
 * relationships would attach confident, wrong URLs. Without them the words
 * survive and no destination is claimed.
 */
function readFootnotes(xml: string | null, ctx: WalkContext): Map<string, string> {
  const out = new Map<string, string>();
  const root = xml ? parseXml(xml) : null;
  if (!root) return out;
  const local: WalkContext = { ...ctx, footnotes: new Map(), rels: new Map() };
  for (const footnote of childrenNamed(root, "w:footnote")) {
    const id = attr(footnote, "w:id");
    const type = attr(footnote, "w:type");
    // The separator rules are page furniture Word stores as footnotes.
    if (!id || (type && type !== "normal")) continue;
    const lines: string[] = [];
    for (const paragraph of childElementsNamed(footnote, "w:p", 0)) {
      const text = readParagraph(paragraph, local).text.trim();
      if (text) lines.push(text);
    }
    if (lines.length) out.set(id, lines.join("\n"));
  }
  return out;
}

// ── seams, so the walker can be exercised without a zip ─────────────────────

export interface DocxPartsXml {
  styles?: string;
  numbering?: string;
  rels?: string;
}

function contextFor(parts: DocxPartsXml): WalkContext {
  return {
    counts: { deletions: 0, fieldInstructions: 0, footnotesRead: 0, paragraphs: 0 },
    footnotes: new Map(),
    numbering: readDocxNumbering(parts.numbering ?? null),
    rels: readDocumentRels(parts.rels ?? null),
    styles: readDocxStyles(parts.styles ?? null),
  };
}

/** One `<w:p>` fragment: what it is, what it says, and what it points at. */
export function readParagraphXml(
  xml: string,
  parts: DocxPartsXml = {},
): { kind: BlockKind; depth?: number; text: string; visuals: PendingVisual[]; footnotes: string[] } {
  const element = parseXml(xml);
  if (!element) return { footnotes: [], kind: "paragraph", text: "", visuals: [] };
  const ctx = contextFor(parts);
  const read = readParagraph(element, ctx);
  return { ...classifyParagraph(element, ctx), footnotes: read.footnotes, text: read.text, visuals: read.visuals };
}

/** One `<w:tbl>` fragment as a grid. */
export function readTableXml(xml: string, parts: DocxPartsXml = {}): DocCell[][] {
  const element = parseXml(xml);
  if (!element) return [];
  return readTable(element, contextFor(parts), 0).rows;
}

/** The file's OWN title, from docProps/core.xml. Never the storage key, never
 *  the file name — those are things about the upload, not about the document. */
export function coreTitle(xml: string | null): string | undefined {
  const root = xml ? parseXml(xml) : null;
  if (!root) return undefined;
  for (const element of descendantsNamed(root, "dc:title")) {
    const text = textOf(element).trim();
    if (text) return text;
  }
  return undefined;
}
