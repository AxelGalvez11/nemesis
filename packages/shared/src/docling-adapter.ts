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
 * 🔴 THAT SEPARATION IS ONLY HONEST IF A CALLER ACTUALLY BUILDS THE RECORD.
 * It did not. For most of this branch's life `observations` was read by exactly
 * one thing — the bake-off harness — which meant a document parsed by Docling
 * would have reached the app with NO coverage record at all and would have
 * rendered as fully read. That is the precise failure this comment claims to
 * prevent, and measurement found it: Docling returns SUCCESS on 8 files where it
 * declared more units than it filled (`BIOL415_Lecture2_2025.pptx`: 2 of 26
 * slides empty). `doclingCoverage` below exists so the caller has something to
 * call. **The flag must not be enabled for any format until a production caller
 * invokes it** — see `docs/docling-bakeoff.md`, "Gate before the flag".
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
import { buildCoverage } from "./extraction-coverage.ts";
import type { CoverageUnitKind, ExtractionCoverage, FigureCoverage, UnitLoss } from "./extraction-coverage.ts";

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
  /**
   * …of which this many were PICTURES, broken out of the lump above.
   *
   * 🔴 MEASURED: 30 of the corpus's 1,941 pictures are dropped this way — 11
   * `furniture` and 19 `invisible`, and 21 of those sit under a group Docling
   * itself named "page header". They are header logos, correctly dropped. But
   * "30 pictures the student will never see" and "1,554 running heads" are not
   * the same fact, and one bucket made the first one unanswerable.
   */
  picturesDroppedAsFurniture: number;
  /** Pictures Docling recorded. NONE of them have been examined by anyone. */
  pictures: number;
  /**
   * …of which this many were found INSIDE a table and had to be dug out.
   *
   * 🔴 MEASURED: 30 pictures, in a table's descendants, reachable no other way.
   * Before the sub-walk below existed they were the largest single cause of
   * picture loss and were disclosed to nobody. Kept as its own counter because
   * a regression here looks identical to "this corpus has fewer tables".
   */
  picturesInsideTables: number;
  /** Pictures with usable geometry — the ones a vision pass could actually crop. */
  picturesWithRect: number;
  /**
   * List items sitting inside a table cell, counted and NOT re-emitted.
   *
   * 🔴 THIS IS ACCOUNTING, NOT A LOSS, AND THE DISTINCTION IS MEASURED. All 200
   * of these in the corpus are children of a `list` group inside a table cell,
   * and for all 163 with non-empty text the same string is already present in
   * that table's `table_cells` — so the content reaches the student inside the
   * grid. Emitting them again as loose list items is precisely the "cell text
   * arrives looking like prose" bug `DocTable` exists to prevent. Counted so
   * that "the adapter kept 98% of list items" can be read as a fact about
   * representation rather than mistaken for a fact about loss.
   */
  listItemsInsideTables: number;
  /** Table captions lifted out of the table's children into the table's text. */
  tableCaptions: number;
  /** Table footnotes recovered as `note` blocks after their table. */
  tableFootnotes: number;
  /**
   * Nodes with a known kind but no text at all, dropped.
   *
   * Not a gap — an empty paragraph carries nothing — but it was a silent path,
   * and a silent path is how the next real loss hides. 4,277 across the corpus.
   */
  droppedEmptyText: number;
  /**
   * Equations Docling located and could not transcribe. A REAL gap.
   *
   * 🔴 27 OF 49 FORMULAS IN THE CORPUS, AND THEY WERE COUNTED NOWHERE. Docling
   * emits a `formula` node with a page number, a bounding box, and `text: ""` —
   * it found an equation and produced nothing for it. The old
   * `if (text || kind === "listItem")` gate dropped those in silence, so a
   * lecture whose every derivation was unreadable reported a clean parse. This
   * feeds `ExtractionCoverage.unreadableRegions` and makes such a file
   * `partial`, which is the honest answer.
   *
   * No block is emitted: there is nothing to put in `text`, and inventing a
   * `figure` to carry it would move an equation into the picture counts. The
   * bounding boxes are therefore discarded — a future vision pass that wants to
   * crop and read them has to re-parse.
   */
  equationsUnreadable: number;
  /**
   * WHICH units those unreadable equations sat on, 0-based, ascending.
   *
   * 🔴 THE BOUNDING BOXES ARE STILL DISCARDED, AS THE NOTE ABOVE SAYS — this
   * keeps the far cheaper half of the same fact. A count alone leaves a parse
   * verdict able only to refuse the whole file; knowing that all 27 unreadable
   * formulas sit on four pages of a thirty-page lecture is what lets the other
   * twenty-six be trusted. The unit is in hand at the instant the counter is
   * incremented and gone immediately after — a fact destroyed at the point of
   * summing, which is exactly what this stops.
   *
   * Never a substitute for the count: see `ExtractionCoverage.lostUnits` for why
   * the total stays authoritative.
   *
   * 🔴 OPTIONAL FOR THE SAME REASON `unitIndexesWithContent` IS, and the reason
   * is not politeness about old data — a REQUIRED field here is a field every
   * caller must state, which means a caller that does not know is pushed into
   * asserting `[]`, and `[]` reads as "nothing was lost anywhere" rather than
   * "we did not record where". Absent means **the locality is unavailable**,
   * never that no equation was lost; `equationsUnreadable` remains the fact.
   * Making it required also fails at runtime rather than at compile time, since
   * observations are constructed through casts in more than one place.
   */
  equationsUnreadableByUnit?: readonly { unit: number; count: number }[];
  /** Units the file claims to have, from Docling's own page table. */
  declaredUnits: number;
  /** Units that received at least one block. `declaredUnits - this` is a gap. */
  unitsWithContent: number;
  /**
   * WHICH units received a block, 0-based and ascending.
   *
   * 🔴 A COUNT CANNOT BE JOINED. `unitsWithContent` answers "how many pages did
   * Docling fill", which is all a single-lane coverage record ever needed. The
   * native/OCR split asks a per-page question — did THIS page have its own text
   * layer, and did Docling fill THIS page — and no arithmetic on two totals can
   * answer it. The set is recorded here so `doclingCoverage` can do the join
   * instead of a caller re-walking `model.blocks` and inventing its own rule.
   *
   * Optional because observations produced before this field existed are still
   * valid input; absent means the split is unavailable, NOT that no unit was
   * filled.
   */
  unitIndexesWithContent?: readonly number[];
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
  /**
   * Cross-references Docling keeps ALONGSIDE `children`, not instead of it.
   *
   * 🔴 MEASURED, BECAUSE THE OBVIOUS FEAR IS WRONG: 121 such refs exist across
   * the 345-file corpus (81 picture captions, 23 table captions, 17 table
   * footnotes) and every single target is ALSO listed in that node's `children`.
   * So nothing is reachable only through these fields, and a walk that followed
   * them as an extra edge would recover nothing and risk emitting things twice.
   * They are read for one narrow purpose — naming exactly which child of a table
   * is its caption or footnote, which a label scan over cells could not do
   * safely.
   */
  captions?: { $ref?: string }[];
  footnotes?: { $ref?: string }[];
  references?: { $ref?: string }[];
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
    picturesDroppedAsFurniture: 0,
    pictures: 0,
    picturesInsideTables: 0,
    picturesWithRect: 0,
    listItemsInsideTables: 0,
    tableCaptions: 0,
    tableFootnotes: 0,
    droppedEmptyText: 0,
    equationsUnreadable: 0,
    equationsUnreadableByUnit: [],
    declaredUnits: 0,
    unitsWithContent: 0,
  };
  /** Accumulated by unit while walking, then flattened once at the end — a map
   *  cannot be the field itself because observations are serialised as JSON. */
  const unreadableEquationsPerUnit = new Map<number, number>();

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

  /** Resolve one `$ref` to its node without visiting it. */
  const nodeAt = (ref: string | undefined): RawNode | undefined => {
    const parsed = parseRef(ref);
    if (!parsed) return undefined;
    return buckets[parsed.bucket]?.[parsed.index];
  };

  const isDropped = (node: RawNode): boolean =>
    !!node.content_layer && DROPPED_CONTENT_LAYERS.has(node.content_layer);

  const refOf = (node: RawNode, fallback: string): string => node.self_ref ?? fallback;

  /**
   * The caption text a TABLE points at, in `captions[]` order.
   *
   * 🔴 TABLES ONLY, ON PURPOSE. A picture's caption is also listed in its
   * `captions[]` — all 81 in the corpus — but a picture's children ARE walked,
   * so that caption already arrives as its own `caption` block in reading order.
   * Folding it into the figure's text as well would both duplicate it and, via
   * the `seen` claim below, delete the block that used to carry it. A table is
   * the only node whose children are deliberately not walked, so it is the only
   * one whose caption needs lifting out.
   */
  const tableCaptionTextOf = (node: RawNode): string => {
    const parts: string[] = [];
    for (const entry of node.captions ?? []) {
      const target = nodeAt(entry.$ref);
      if (!target || isDropped(target)) continue;
      const text = (target.text ?? "").trim();
      if (!text) continue;
      // Claimed by the table, so the general walk must not emit it again if the
      // export ever also reaches it from somewhere else.
      seen.add(refOf(target, entry.$ref ?? ""));
      observations.tableCaptions += 1;
      parts.push(text);
    }
    return parts.join(" ");
  };

  /**
   * Emit ONLY the pictures buried in a table's descendants.
   *
   * 🔴 THIS IS NOT `visit` WITH THE TABLE GUARD REMOVED, AND IT MUST NOT BECOME
   * THAT. Turning the general walk on inside a table re-emits every cell as a
   * loose paragraph — the exact bug the `return` above prevents. This walk emits
   * pictures and nothing else: it descends through groups and pictures, and it
   * NEVER emits a text node, so cell prose cannot escape the grid however deeply
   * a cell nests.
   *
   * Measured: 30 pictures in the corpus live here and were reachable no other
   * way. A picture has no representation in `table_cells` — the grid holds
   * strings — so unlike cell text, leaving it is a real loss of something the
   * student can see on the page.
   *
   * Emitted immediately after their table, which is where a depth-first read of
   * `body.children` would have put them anyway.
   */
  const emitTableFigures = (table: RawNode): void => {
    const queue: (string | undefined)[] = (table.children ?? []).map((c) => c.$ref);
    // Local, so descending past a text node does not mark it `seen` and silently
    // move it if the export reaches it again elsewhere.
    const walked = new Set<string>();
    while (queue.length > 0) {
      const ref = queue.shift();
      const node = nodeAt(ref);
      if (!node) continue;
      const key = refOf(node, ref ?? "");
      if (walked.has(key)) continue;
      walked.add(key);
      if (isDropped(node)) {
        observations.droppedFurniture += 1;
        if (key.startsWith("#/pictures/")) observations.picturesDroppedAsFurniture += 1;
        continue;
      }
      if (key.startsWith("#/pictures/") && !seen.has(key)) {
        seen.add(key);
        observations.picturesInsideTables += 1;
        emitPicture(node);
      }
      for (const child of node.children ?? []) queue.push(child.$ref);
    }
  };

  /** A table's footnotes, as `note` blocks after the table. */
  const emitTableFootnotes = (table: RawNode): void => {
    for (const entry of table.footnotes ?? []) {
      const target = nodeAt(entry.$ref);
      if (!target || isDropped(target)) continue;
      const text = (target.text ?? "").trim();
      if (!text) continue;
      const key = refOf(target, entry.$ref ?? "");
      if (seen.has(key)) continue;
      seen.add(key);
      observations.tableFootnotes += 1;
      seq += 1;
      const rect = rectFor(target);
      blocks.push({
        id: `d${seq - 1}`,
        // `footnote` maps to `note` in LABEL_TO_KIND; a table's footnote is the
        // same thing in a different place, so it keeps the same kind.
        kind: "note",
        unit: unitFor(target),
        text,
        headingPath: headingStack.map((h) => h.text),
        ...(rect ? { rect } : {}),
      });
    }
  };

  /**
   * Count the list items inside a table. Deliberately emit nothing.
   *
   * See `DoclingObservations.listItemsInsideTables`: their text is already in
   * the grid, so this is a representation choice that must be disclosed, not a
   * loss that must be repaired.
   */
  const countTableListItems = (table: RawNode): void => {
    const queue: (string | undefined)[] = (table.children ?? []).map((c) => c.$ref);
    const walked = new Set<string>();
    while (queue.length > 0) {
      const ref = queue.shift();
      const node = nodeAt(ref);
      if (!node) continue;
      const key = refOf(node, ref ?? "");
      if (walked.has(key)) continue;
      walked.add(key);
      if (isDropped(node)) continue;
      if (node.label === "list_item") observations.listItemsInsideTables += 1;
      for (const child of node.children ?? []) queue.push(child.$ref);
    }
  };

  /** Pictures in a dropped subtree, counted on the way past. Emits nothing. */
  const countPicturesUnder = (root: RawNode): void => {
    const queue: (string | undefined)[] = (root.children ?? []).map((c) => c.$ref);
    const walked = new Set<string>();
    while (queue.length > 0) {
      const ref = queue.shift();
      const node = nodeAt(ref);
      if (!node) continue;
      const key = refOf(node, ref ?? "");
      if (walked.has(key)) continue;
      walked.add(key);
      if (key.startsWith("#/pictures/")) observations.picturesDroppedAsFurniture += 1;
      for (const child of node.children ?? []) queue.push(child.$ref);
    }
  };

  /** One figure block. Shared so a recovered picture counts exactly like any other. */
  const emitPicture = (node: RawNode): void => {
    const rect = rectFor(node);
    observations.pictures += 1;
    if (rect) observations.picturesWithRect += 1;
    seq += 1;
    blocks.push({
      id: `d${seq - 1}`,
      kind: "figure",
      unit: unitFor(node),
      text: (node.text ?? "").trim(),
      headingPath: headingStack.map((h) => h.text),
      // 🔴 NO `description`. Docling detects a picture; it does not look at it.
      // Absent means NOBODY LOOKED, which is what makes the figure countable as
      // a gap instead of silently reading as "nothing there".
      figure: { ...(node.self_ref ? { ref: node.self_ref } : {}) },
      ...(rect ? { rect } : {}),
    });
  };

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
      // A dropped PICTURE is worth its own line. See the field's note: the lump
      // is dominated by running heads, and a picture hiding inside it is a
      // different question from a page number hiding inside it.
      if (parsed.bucket === "pictures") observations.picturesDroppedAsFurniture += 1;
      // 🔴 AND THE ONES UNDERNEATH IT. Dropping a node drops its whole subtree,
      // so counting only the node the walk stopped at reported 5 of the corpus's
      // 30 dropped pictures: the other 25 sit under a GROUP whose own layer is
      // furniture — one Docling itself named "page header". A counter that sees
      // a sixth of what it claims to count is worse than no counter.
      countPicturesUnder(node);
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
        //
        // 🔴 `node.text` IS EMPTY ON ALL 649 TABLES IN THE CORPUS — measured, not
        // assumed. Docling does not put the caption on the table node: it puts it
        // in a `caption`-labelled text node, lists it in `captions[]`, AND files
        // it under the table's children, where the deliberate no-recursion below
        // then buried it. So all 23 table captions were lost. Resolving the
        // `captions[]` refs is exact — it cannot pick up a cell by accident the
        // way scanning children for a label would.
        text: tableCaptionTextOf(node) || (node.text ?? "").trim(),
        headingPath: headingStack.map((h) => h.text),
        ...(table ? { table } : {}),
        ...(rect ? { rect } : {}),
      });
      // Cell text lives in `texts` and is referenced from inside the table. It
      // has already been captured in the grid, so the children are NOT visited —
      // doing so is what re-emits every cell as a loose paragraph.
      //
      // But "do not re-emit cell text" was implemented as "do not look inside a
      // table at all", and those are different rules. Three kinds of node live
      // in there that the grid does NOT carry, and each is handled on its own
      // terms rather than by turning the general walk back on:
      emitTableFigures(node); //   a picture — no text representation anywhere
      emitTableFootnotes(node); // a footnote — content, and not a cell
      countTableListItems(node); // a list item — already IN the grid, so counted
      return;
    }

    if (bucket === "pictures") {
      // One emitter for both entry points — a picture found inside a table must
      // be counted and shaped identically to one found in the body, or the
      // figure totals stop matching the blocks.
      emitPicture(node);
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
    } else if (kind === "equation") {
      // 🔴 THE SILENT DROP THAT MATTERED. Docling emits a `formula` node with a
      // page, a bounding box and `text: ""` when its formula model located an
      // equation it could not transcribe: 27 of the corpus's 49 formulas, in 5
      // real course PDFs, every one of them with geometry. The `if (text)` above
      // swallowed all 27 without a counter, so a lecture whose derivations were
      // all unreadable reported a clean parse. It is a gap, it is now counted,
      // and `doclingCoverage` turns it into `unreadableRegions`.
      observations.equationsUnreadable += 1;
      // 🔴 THE UNIT IS RIGHT HERE, AND ONE LINE LATER IT IS GONE. Recording it
      // is the whole of PARSER-003 for this lane: without it a verdict can only
      // refuse the lecture, not the four pages whose derivations were lost.
      unreadableEquationsPerUnit.set(unit, (unreadableEquationsPerUnit.get(unit) ?? 0) + 1);
    } else {
      // Everything else with a known kind and no text: an empty paragraph, which
      // costs the student nothing. Counted anyway — an uncounted branch is how
      // the formula case above stayed invisible for as long as it did.
      observations.droppedEmptyText += 1;
    }
    for (const child of node.children ?? []) visit(child.$ref);
  };

  for (const child of doc.body?.children ?? []) visit(child.$ref);

  // Units. For a paged format the page table is authoritative about how many
  // there are; a page that produced no block is a gap, and recording it is how
  // "Docling said SUCCESS" stops being the same sentence as "we read it all".
  const declared = flowing ? 1 : Math.max(pageSizes.size, usedPages.size, blocks.length ? 1 : 0);
  observations.declaredUnits = declared;
  const filled = flowing
    ? blocks.length > 0
      ? [0]
      : []
    : [...new Set(blocks.map((b) => b.unit))].sort((a, b) => a - b);
  observations.unitsWithContent = filled.length;
  observations.unitIndexesWithContent = filled;
  // Bounded by `declared` for the same reason `filled` is filtered downstream: a
  // node carrying a page outside the page table would otherwise place a loss on
  // a unit the document does not have, and `buildCoverage` would refuse the
  // whole record over one stray index.
  observations.equationsUnreadableByUnit = [...unreadableEquationsPerUnit.entries()]
    .filter(([unit]) => unit >= 0 && unit < declared)
    .sort(([a], [b]) => a - b)
    .map(([unit, count]) => ({ unit, count }));

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

/**
 * Turn the adapter's observations into a coverage record.
 *
 * This is the caller-side half of "a third-party success is not our complete".
 * It is deliberately a separate function from `adaptDoclingDocument` — the
 * parser reports what it saw, something else decides what that means — but it
 * lives here so there is exactly one correct way to do it rather than a
 * hand-rolled one per call site.
 *
 * 🔴 EVERY PICTURE COUNTS AS `not-examined`, WHICH MAKES A CLEAN DOCLING PARSE
 * `partial`. That is the intended answer, not a bug to tune away. Docling
 * *detects* figures; it does not describe them. Across the corpus that is 1,220
 * pictures in PDFs and 470 in decks that nothing has ever looked at. Marking
 * them `decorative` would be free, would read as `complete`, and would be a lie
 * — `decorative` means "we know it is a bullet or a rule". We do not know that
 * here, because Docling's labels do not tell us. If a vision pass later runs
 * over these, it moves them to `described` and the state rises on its own.
 *
 * 🔴 THE NATIVE/OCR SPLIT NEEDS `nativeText`, AND WITHOUT IT EVERY READ UNIT IS
 * REPORTED AS `unitsNative`. Docling's JSON carries no OCR signal — a key sweep
 * over all 322 exports in the corpus found no ocr/confidence/source field, only
 * the document `origin` block (filename, mimetype, hash) — so a scan that
 * RapidOCR rescued is, in this file alone, indistinguishable from a page with a
 * real text layer. That fallback is WRONG for the scanned PDFs in the corpus and
 * it is kept only so an old caller keeps working.
 *
 * The split IS available whenever the caller can also answer, per page, "did the
 * page have its own text layer" — which for a PDF is
 * `probePdfNativeText` + `nativeTextMap` in apps/web/lib/pdf/native-probe.ts,
 * using the SAME `pageTextLength` / `THIN_PAGE_CHARS` predicate our own lane
 * uses, so the same page cannot classify differently on the two lanes. Pass that
 * map as `nativeText` and the four counts become real. It is a PDF answer: for a
 * flowing document there are no pages to probe, and passing a map for one is
 * refused rather than ignored.
 *
 * The rule is deliberately the SAME SHAPE the native lane uses in `pdfCoverage`,
 * with "Docling produced blocks for this page" standing where "the vision model
 * returned text for this page" stands there:
 *
 *   own text + blocks    -> native      own text + no blocks    -> UNREAD
 *   no own text + blocks -> vision      no own text + no blocks -> unread
 *
 * A page whose text layer we have but which Docling emitted nothing for is
 * unread, not native: the model holds no content for it, and a text layer nobody
 * read is not a read.
 *
 * 🔴 `unitsBoth` IS ALWAYS 0 HERE, AND THE OTHER TWO ARE DEFINITIONS, NOT PROOFS.
 * Docling's default pipeline may OCR a bitmap region on a page that ALSO has a
 * text layer, and the export does not say so, so a page with native text is
 * credited to the text layer and `unitsBoth` can never be observed. Measured
 * over the 164 corpus PDFs (1,474 pages), supplying the map moves 182 pages out
 * of `unitsNative`, and of those 182: 65 had NO text layer at all and can only
 * have come from pixels, 44 had a thin layer and Docling returned more than
 * twice its characters, and 73 had a thin layer Docling roughly echoed — for
 * that last group `vision` is the lane the page belongs to under the predicate,
 * not evidence that anything looked at it. Nothing in the export can tell the
 * three apart, which is why the sidecar returning per-page OCR flags would still
 * be an improvement on this.
 */
export function doclingCoverage(
  observations: DoclingObservations,
  options: {
    format: DocFormat;
    unitsInModel: number;
    /**
     * 0-based unit index -> did that page carry its own usable text layer.
     *
     * A unit missing from the map is UNKNOWN, not false. Supplying a map that
     * does not cover every unit Docling filled is refused, because guessing a
     * lane for the uncovered ones is precisely the fabrication this argument
     * exists to remove.
     */
    nativeText?: ReadonlyMap<number, boolean>;
    /**
     * The real figure verdict, when something has looked. Omitted means every
     * picture Docling detected is `not-examined` — the honest default, not a
     * placeholder. Supply this once a vision pass has run over Docling's
     * figures (matched to pixels by `figure-match.ts`) so a described diagram
     * can move the document out of `partial`, the same way `docxCoverage` and
     * `pdfCoverage` already let a described figure move theirs.
     */
    figures?: FigureCoverage;
  },
): ExtractionCoverage | string {
  const unitKind: CoverageUnitKind =
    options.format === "pptx" ? "slide" : options.format === "pdf" ? "page" : "document";

  // A flowing format has one unit by construction; a paginated one should trust
  // the file's own page table, but never below what the model actually holds.
  const declared = Math.max(observations.declaredUnits, options.unitsInModel);
  const units = options.format === "docx" ? Math.max(1, options.unitsInModel) : declared;

  // 🔴 EVERYTHING THAT IS NOT A UNIT COUNT LIVES HERE, ONCE. There are two ways
  // out of this function — with the split and without it — and a field added to
  // only one of them would be reported on some documents and silently missing on
  // others, which is indistinguishable from the parser not having found it.
  const base = {
    unitKind,
    units,
    figures: options.figures ?? {
      found: observations.pictures,
      described: 0,
      skipped: observations.pictures,
      reasons: observations.pictures > 0 ? { "not-examined": observations.pictures } : {},
    },
    // 🔴 KEPT OUT OF `figures`, DELIBERATELY. An equation Docling located and
    // could not transcribe is lost content, but it is not a picture, and putting
    // it in the figure count would make the student's sentence read "27 pictures
    // couldn't be read" about a document missing no pictures at all. Its own
    // field says the true thing, and `deriveState` still makes the file
    // `partial`, which is the part that actually protects the reader.
    unreadableRegions: observations.equationsUnreadable,
    parserVersion: `docling+adapter/${observations.status}`,
  };

  const inRangeFilled = new Set((observations.unitIndexesWithContent ?? []).filter((i) => i >= 0 && i < units));

  if (!options.nativeText) {
    const read = Math.min(observations.unitsWithContent, units);
    // 🔴 LOCALITY ONLY WHEN IT RECONCILES WITH THE COUNT THIS PATH ALREADY
    // COMPUTES. `read` is clamped and `unitsWithContent` is a total, so a filled
    // index outside the page table would make the list and the count disagree —
    // and a disagreement here makes `buildCoverage` refuse the entire record
    // over a locality detail. When they do not reconcile the loss stays
    // unlocated, which is the cautious direction and exactly what `lostUnits`
    // being a partial explanation is for.
    const locatable = observations.unitIndexesWithContent !== undefined && inRangeFilled.size === read;
    const unreadIndexes = locatable ? unitsNotIn(inRangeFilled, units) : [];
    return buildCoverage({
      ...base,
      unitsNative: read,
      unitsUnread: units - read,
      lostUnits: mergeUnitLosses(unreadIndexes, observations.equationsUnreadableByUnit ?? [], units),
    });
  }

  if (options.format === "docx") {
    return "nativeText describes pages; a flowing document has none, so omit it";
  }
  const filled = observations.unitIndexesWithContent;
  if (!filled) {
    return "nativeText needs unitIndexesWithContent, and these observations carry none";
  }

  const filledSet = inRangeFilled;
  const unreadIndexes: number[] = [];
  let native = 0;
  let vision = 0;
  let unread = 0;
  for (let index = 0; index < units; index += 1) {
    // A page Docling produced nothing for is unread whatever its text layer says:
    // the model has no content for it, and a text layer nobody read is not a read.
    if (!filledSet.has(index)) {
      unread += 1;
      // 🔴 THE LOOP ALREADY KNEW WHICH PAGE THIS WAS AND ONLY KEPT THE TALLY.
      // Recorded here so the count and the list are produced by the same pass
      // and cannot drift apart.
      unreadIndexes.push(index);
      continue;
    }
    const hasOwnText = options.nativeText.get(index);
    if (hasOwnText === undefined) {
      return `nativeText has no entry for unit ${index}, which Docling filled`;
    }
    if (hasOwnText) native += 1;
    else vision += 1;
  }

  return buildCoverage({
    ...base,
    unitsNative: native,
    unitsVision: vision,
    // See the header note: never observable from this export, so never claimed.
    unitsBoth: 0,
    unitsUnread: unread,
    lostUnits: mergeUnitLosses(unreadIndexes, observations.equationsUnreadableByUnit ?? [], units),
  });
}

/** The units in `[0, units)` that are not in `filled`, ascending. */
function unitsNotIn(filled: ReadonlySet<number>, units: number): number[] {
  const missing: number[] = [];
  for (let index = 0; index < units; index += 1) if (!filled.has(index)) missing.push(index);
  return missing;
}

/**
 * One `UnitLoss` per unit, however many kinds of loss landed on it.
 *
 * 🔴 ONE ENTRY PER UNIT IS A STORAGE INVARIANT, NOT A TIDINESS PREFERENCE —
 * `buildCoverage` refuses a duplicate unit outright, so a page that is both
 * unread and holds an unreadable equation must arrive merged or the whole
 * record is rejected over it. Out-of-range indexes are dropped here for the same
 * reason: one stray page number must not cost a document its coverage.
 */
function mergeUnitLosses(
  unreadIndexes: readonly number[],
  regionsByUnit: readonly { unit: number; count: number }[],
  units: number,
): UnitLoss[] {
  const byUnit = new Map<number, UnitLoss>();
  const inRange = (unit: number) => Number.isInteger(unit) && unit >= 0 && unit < units;
  for (const unit of unreadIndexes) {
    if (inRange(unit)) byUnit.set(unit, { unit, unread: true });
  }
  for (const { unit, count } of regionsByUnit) {
    if (!inRange(unit) || !Number.isInteger(count) || count <= 0) continue;
    const existing = byUnit.get(unit);
    byUnit.set(unit, existing ? { ...existing, unreadableRegions: count } : { unit, unreadableRegions: count });
  }
  return [...byUnit.values()].sort((a, b) => a.unit - b.unit);
}
