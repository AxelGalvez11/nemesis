/**
 * Docling -> the canonical Nemesis document model.
 *
 * 🔴 DOCLING IS NOT A SECOND SOURCE OF TRUTH. Nothing downstream of this file
 * knows Docling exists. The input is parsed JSON crossing a process boundary
 * (the Python side is a separate process, by design) and the output is exactly
 * `DocumentModel` — the same shape our own parsers produce, consumed by the same
 * chunker, citations, facts and artifacts. If a Docling concept has no home in
 * the model, it is dropped here, deliberately, rather than smuggled through in a
 * side field that only one consumer understands.
 *
 * 🔴 A THIRD-PARTY "SUCCESS" IS NOT NEMESIS "COMPLETE". Docling reports
 * ConversionStatus.SUCCESS for a document it understood partially — a picture it
 * could not decode, a page it produced no text for. `adaptDoclingDocument`
 * therefore returns observations ALONGSIDE the model, and the caller builds
 * coverage from those. This function never returns a coverage verdict itself,
 * because the one thing a parser must not do is grade its own homework.
 *
 * Three details in Docling's format are load-bearing and easy to get wrong:
 *
 *   1. READING ORDER IS THE TREE, NOT THE ARRAYS. `texts`, `tables` and
 *      `pictures` are storage. `body.children` is an ordered list of `$ref`
 *      pointers, and a depth-first walk of it is the reading order. Iterating
 *      `texts[]` directly also re-emits every table cell as a loose paragraph,
 *      because cell text is stored there and referenced from inside the table.
 *
 *   2. COORDINATE ORIGIN VARIES WITHIN ONE DOCUMENT. Text provenance arrives
 *      BOTTOMLEFT (PDF's own space); table cell boxes arrive TOPLEFT. Each box
 *      carries its own `coord_origin` and it is read per box. Assuming either
 *      one flips every rectangle vertically, which is invisible in a text diff
 *      and catastrophic in a citation that highlights a region.
 *
 *   3. PAGE NUMBERS ARE 1-BASED; OUR UNIT INDEX IS 0-BASED.
 */
import type {
  DocBlock,
  DocBlockKind,
  DocFormat,
  DocRect,
  DocTable,
  DocUnit,
  DocUnitKind,
  DocumentModel,
} from "./document-model.ts";

/** Docling label -> our block kind. Unmapped labels are reported, not guessed. */
const LABEL_TO_KIND: Record<string, DocBlockKind> = {
  title: "heading",
  section_header: "heading",
  text: "paragraph",
  paragraph: "paragraph",
  list_item: "listItem",
  caption: "caption",
  formula: "equation",
  code: "paragraph",
  footnote: "note",
  page_header: "note",
  page_footer: "note",
  checkbox_selected: "listItem",
  checkbox_unselected: "listItem",
};

/**
 * Content layers we deliberately drop rather than map.
 *
 * `furniture` — running heads, page numbers — is not part of what the student is
 * reading, and admitting it as a paragraph would put "Page 4 of 37" into chunks
 * and, eventually, into a quotation. `background` is watermarks; `invisible` is
 * hidden text, which is both noise and the classic prompt-injection surface.
 */
const DROPPED_CONTENT_LAYERS = new Set(["furniture", "background", "invisible"]);

/**
 * The lecturer's script, not the slide.
 *
 * 🔴 MEASURED, NOT ASSUMED: on a real 14-slide deck Docling recovered 13,101
 * characters of speaker notes — exactly matching python-pptx ground truth — and
 * `export_to_dict` carries them with `content_layer: "notes"`. But
 * `export_to_markdown` DROPS them, because its default `included_content_layers`
 * is `{BODY}`. Any integration that goes through Markdown loses every speaker
 * note silently, which is why this adapter consumes the JSON export.
 *
 * They map to `note`, never `paragraph`: a note is what the lecturer said, and
 * flattening it into slide text would let a quotation attribute the speaker's
 * aside to the slide itself.
 */
const NOTES_CONTENT_LAYER = "notes";

export interface DoclingObservations {
  /** Docling's own status string, carried verbatim. Never interpreted as truth. */
  status: string;
  /** Nodes whose label we have no mapping for, with counts. Feeds coverage. */
  unmappedLabels: Record<string, number>;
  /** Refs in the tree that pointed at nothing. A structural defect if non-zero. */
  danglingRefs: number;
  /** Nodes dropped because they were page furniture. */
  droppedFurniture: number;
  /** Pictures Docling recorded. NONE of them have been examined by anyone. */
  pictures: number;
  /** Pictures with usable geometry — the ones a vision pass could actually crop. */
  picturesWithRect: number;
  /** Units the file claims to have, from Docling's own page table. */
  declaredUnits: number;
  /** Units that received at least one block. `declaredUnits - this` is a gap. */
  unitsWithContent: number;
}

export interface DoclingAdaptation {
  model: DocumentModel;
  observations: DoclingObservations;
}

interface RawBBox {
  l: number;
  t: number;
  r: number;
  b: number;
  coord_origin?: string;
}

interface RawProv {
  page_no?: number;
  bbox?: RawBBox;
  charspan?: [number, number];
}

interface RawNode {
  self_ref?: string;
  label?: string;
  text?: string;
  level?: number;
  marker?: string;
  enumerated?: boolean;
  content_layer?: string;
  children?: { $ref?: string }[];
  prov?: RawProv[];
  data?: {
    num_rows?: number;
    num_cols?: number;
    grid?: { text?: string }[][];
    table_cells?: {
      text?: string;
      row_span?: number;
      col_span?: number;
      start_row_offset_idx?: number;
      start_col_offset_idx?: number;
      column_header?: boolean;
    }[];
  };
}

interface RawDoc {
  body?: RawNode;
  texts?: RawNode[];
  tables?: RawNode[];
  pictures?: RawNode[];
  groups?: RawNode[];
  pages?: Record<string, { size?: { width?: number; height?: number }; page_no?: number }>;
  name?: string;
}

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/**
 * A Docling box in a page's own space -> our unit-relative, TOP-LEFT rect.
 *
 * Returns undefined rather than a guess when the page size is unknown: a rect is
 * a promise that a crop will land on the right thing, and an unscaled one is a
 * promise we cannot keep.
 */
function toRect(bbox: RawBBox | undefined, page: { width: number; height: number } | undefined): DocRect | undefined {
  if (!bbox || !page || !(page.width > 0) || !(page.height > 0)) return undefined;
  const l = num(bbox.l);
  const r = num(bbox.r);
  const t = num(bbox.t);
  const b = num(bbox.b);
  if (l === undefined || r === undefined || t === undefined || b === undefined) return undefined;

  const x0 = Math.min(l, r);
  const x1 = Math.max(l, r);
  // 🔴 PER-BOX, NOT PER-DOCUMENT. See the header note: text arrives BOTTOMLEFT
  // and table cells arrive TOPLEFT within the same file.
  const bottomLeft = (bbox.coord_origin ?? "BOTTOMLEFT").toUpperCase() === "BOTTOMLEFT";
  const yTop = bottomLeft ? page.height - Math.max(t, b) : Math.min(t, b);
  const yBot = bottomLeft ? page.height - Math.min(t, b) : Math.max(t, b);

  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x = clamp(x0 / page.width);
  const y = clamp(yTop / page.height);
  const width = clamp((x1 - x0) / page.width);
  const height = clamp((yBot - yTop) / page.height);
  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

/** `#/texts/12` -> ["texts", 12]. Docling's only cross-reference syntax. */
function parseRef(ref: string | undefined): { bucket: string; index: number } | null {
  if (!ref) return null;
  const m = /^#\/([A-Za-z_]+)\/(\d+)$/.exec(ref);
  if (!m) return null;
  return { bucket: m[1]!, index: Number(m[2]) };
}

function tableFrom(node: RawNode): DocTable | undefined {
  const data = node.data;
  if (!data) return undefined;
  const rows = Math.max(0, num(data.num_rows) ?? 0);
  const cols = Math.max(0, num(data.num_cols) ?? 0);
  if (rows === 0 || cols === 0) return undefined;

  const grid: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
  let headerRows = 0;
  for (const cell of data.table_cells ?? []) {
    const r = num(cell.start_row_offset_idx) ?? 0;
    const c = num(cell.start_col_offset_idx) ?? 0;
    if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
    grid[r]![c] = (cell.text ?? "").trim();
    // A header row is one Docling MARKED as such. We never infer "row 0 is a
    // header" — that is the guess `DocTable.headerRows` documents as forbidden.
    if (cell.column_header === true) headerRows = Math.max(headerRows, r + 1);
  }
  return { rows: grid, headerRows };
}

export interface AdaptOptions {
  /** The format we asked for. Decides unit kind; never inferred from content. */
  format: DocFormat;
  /** Docling's conversion status, carried through for the caller's record. */
  status?: string;
  /** Title, when the caller knows one. Docling's `name` is a filename, not a title. */
  title?: string | null;
}

/**
 * Convert one DoclingDocument (already JSON-parsed) into the canonical model.
 *
 * Input is treated as untrusted: it crossed a process boundary from a language
 * with different failure modes, so every field is checked rather than asserted.
 */
export function adaptDoclingDocument(raw: unknown, options: AdaptOptions): DoclingAdaptation {
  const doc = (raw && typeof raw === "object" ? raw : {}) as RawDoc;

  const buckets: Record<string, RawNode[]> = {
    texts: Array.isArray(doc.texts) ? doc.texts : [],
    tables: Array.isArray(doc.tables) ? doc.tables : [],
    pictures: Array.isArray(doc.pictures) ? doc.pictures : [],
    groups: Array.isArray(doc.groups) ? doc.groups : [],
  };

  // Page geometry, keyed by Docling's 1-based page number.
  const pageSizes = new Map<number, { width: number; height: number }>();
  for (const [key, page] of Object.entries(doc.pages ?? {})) {
    const n = num(page?.page_no) ?? Number(key);
    const width = num(page?.size?.width);
    const height = num(page?.size?.height);
    if (Number.isFinite(n) && width && height) pageSizes.set(n, { width, height });
  }

  // A flowing document has one unit and it is NOT a page. Reporting a page for a
  // .docx is a fabrication a citation would then quote.
  const flowing = options.format === "docx";
  const unitKind: DocUnitKind = flowing ? "body" : options.format === "pptx" ? "slide" : "page";

  const observations: DoclingObservations = {
    status: options.status ?? "unknown",
    unmappedLabels: {},
    danglingRefs: 0,
    droppedFurniture: 0,
    pictures: 0,
    picturesWithRect: 0,
    declaredUnits: 0,
    unitsWithContent: 0,
  };

  const blocks: DocBlock[] = [];
  const headingStack: { level: number; text: string }[] = [];
  const usedPages = new Set<number>();
  let seq = 0;

  const unitFor = (node: RawNode): number => {
    if (flowing) return 0;
    const p = num(node.prov?.[0]?.page_no);
    if (p === undefined) return 0;
    usedPages.add(p);
    return Math.max(0, p - 1); // 1-based -> 0-based
  };

  const rectFor = (node: RawNode): DocRect | undefined => {
    const prov = node.prov?.[0];
    if (!prov) return undefined;
    const page = pageSizes.get(num(prov.page_no) ?? -1);
    return toRect(prov.bbox, page);
  };

  const seen = new Set<string>();

  const visit = (ref: string | undefined): void => {
    const parsed = parseRef(ref);
    if (!parsed) {
      observations.danglingRefs += 1;
      return;
    }
    const node = buckets[parsed.bucket]?.[parsed.index];
    if (!node) {
      observations.danglingRefs += 1;
      return;
    }
    // Docling's graph is a tree in practice, but a malformed export could cycle;
    // a parser that hangs on hostile input is a denial of service, not a bug.
    const selfRef = node.self_ref ?? `${parsed.bucket}/${parsed.index}`;
    if (seen.has(selfRef)) return;
    seen.add(selfRef);

    if (node.content_layer && DROPPED_CONTENT_LAYERS.has(node.content_layer)) {
      observations.droppedFurniture += 1;
      return;
    }

    const bucket = parsed.bucket;
    const unit = unitFor(node);
    const rect = rectFor(node);
    const id = `d${seq}`;

    if (bucket === "groups") {
      // A group carries no text of its own; it exists to order its children.
      for (const child of node.children ?? []) visit(child.$ref);
      return;
    }

    if (bucket === "tables") {
      const table = tableFrom(node);
      seq += 1;
      blocks.push({
        id,
        kind: "table",
        unit,
        // A table's text is its caption if it has one; the grid is the content.
        text: (node.text ?? "").trim(),
        headingPath: headingStack.map((h) => h.text),
        ...(table ? { table } : {}),
        ...(rect ? { rect } : {}),
      });
      // Cell text lives in `texts` and is referenced from inside the table. It
      // has already been captured in the grid, so the children are NOT visited —
      // doing so is what re-emits every cell as a loose paragraph.
      return;
    }

    if (bucket === "pictures") {
      observations.pictures += 1;
      if (rect) observations.picturesWithRect += 1;
      seq += 1;
      blocks.push({
        id,
        kind: "figure",
        unit,
        text: (node.text ?? "").trim(),
        headingPath: headingStack.map((h) => h.text),
        // 🔴 NO `description`. Docling detects a picture; it does not look at it.
        // Absent means NOBODY LOOKED, which is what makes the figure countable as
        // a gap instead of silently reading as "nothing there".
        figure: { ...(node.self_ref ? { ref: node.self_ref } : {}) },
        ...(rect ? { rect } : {}),
      });
      for (const child of node.children ?? []) visit(child.$ref);
      return;
    }

    // texts
    const label = node.label ?? "text";
    // A speaker note keeps its own kind whatever label it wears inside the deck.
    const kind: DocBlockKind | undefined =
      node.content_layer === NOTES_CONTENT_LAYER ? "note" : LABEL_TO_KIND[label];
    if (!kind) {
      observations.unmappedLabels[label] = (observations.unmappedLabels[label] ?? 0) + 1;
      for (const child of node.children ?? []) visit(child.$ref);
      return;
    }

    const text = (node.text ?? "").trim();
    if (kind === "heading") {
      // Docling's `level` is absent on `title`; a title is the outermost heading.
      const level = Math.min(9, Math.max(1, num(node.level) ?? (label === "title" ? 1 : 2)));
      while (headingStack.length && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop();
      }
      seq += 1;
      blocks.push({
        id,
        kind,
        unit,
        text,
        headingPath: headingStack.map((h) => h.text),
        level,
        ...(rect ? { rect } : {}),
      });
      if (text) headingStack.push({ level, text });
      for (const child of node.children ?? []) visit(child.$ref);
      return;
    }

    if (text || kind === "listItem") {
      seq += 1;
      blocks.push({
        id,
        kind,
        unit,
        text,
        headingPath: headingStack.map((h) => h.text),
        ...(kind === "listItem" && node.marker ? { marker: node.marker } : {}),
        ...(rect ? { rect } : {}),
      });
    }
    for (const child of node.children ?? []) visit(child.$ref);
  };

  for (const child of doc.body?.children ?? []) visit(child.$ref);

  // Units. For a paged format the page table is authoritative about how many
  // there are; a page that produced no block is a gap, and recording it is how
  // "Docling said SUCCESS" stops being the same sentence as "we read it all".
  const declared = flowing ? 1 : Math.max(pageSizes.size, usedPages.size, blocks.length ? 1 : 0);
  observations.declaredUnits = declared;
  observations.unitsWithContent = flowing
    ? blocks.length > 0
      ? 1
      : 0
    : new Set(blocks.map((b) => b.unit)).size;

  const units: DocUnit[] = Array.from({ length: declared }, (_, index) => {
    const size = pageSizes.get(index + 1);
    return {
      index,
      kind: unitKind,
      ...(size && !flowing ? { size: { width: size.width, height: size.height } } : {}),
    };
  });

  const model: DocumentModel = {
    format: options.format,
    // Never invent a title from the first heading: `DocUnit.label` and titles are
    // the author's words or nothing.
    title: options.title ?? null,
    units,
    blocks,
  };

  return { model, observations };
}
