/**
 * The normalized document — what EVERY parser produces, whatever the file was.
 *
 * 🔴 THIS IS A UNIVERSAL DOCUMENT MODEL, NOT A SCHOOL ONE. A contract, an
 * invoice, a filing, a manual, a resume, a scanned form and a lecture deck are
 * all the same shape here. Nothing in this file may ask what a document is FOR;
 * that question belongs to the domain layer above it. If a field would read
 * strangely for a mechanical-engineering drawing or a lease agreement, it is in
 * the wrong file.
 *
 * The pipeline it exists to make possible:
 *
 *     source -> detect type -> parser -> NORMALIZED UNITS -> canonical parse
 *                                             -> chunker -> embedder -> index
 *
 * Each format keeps its own natural subdivision while answering in one shape:
 *
 *     PDF   -> page       PPTX -> slide      XLSX -> sheet
 *     DOCX  -> section    MD/TXT -> section  HTML -> section
 *     image -> document   (a single unit; inventing "page 1" would be a lie)
 *
 * so chunking, retrieval and citation work without knowing the file type.
 *
 * 🔴 EVERY LOCATION IN HERE IS MEASURED, NEVER INFERRED. If the parser knows a
 * block came from PDF page 7 or Sheet2!B14:F21, that is recorded. A model's
 * belief about where something "probably" came from is NOT provenance and has no
 * representation in this file. If inferred attribution is ever wanted, it needs
 * its own type with its own confidence — never this one.
 *
 * PURE: no I/O, no parser dependencies, no platform APIs. Shared so the web app,
 * the phone and the edge functions cannot drift on the contract.
 */

/** What kind of file this came from. */
export type DocKind = "pdf" | "pptx" | "docx" | "xlsx" | "image" | "text" | "html";

/** How a document divides. `document` is the honest answer for a file with no
 *  meaningful subdivision — better than inventing a page number. */
export type UnitKind = "page" | "slide" | "sheet" | "section" | "document";

/**
 * WHERE something is, in the document's own terms. Measured only.
 *
 * The shape is uniform so a citation renderer never branches on file type, while
 * the fields that only make sense for one format stay optional rather than being
 * faked for the others.
 */
export interface Locator {
  kind: UnitKind;
  /** 1-based, in the document's own numbering. Absent for `document`, and for a
   *  unit whose position is not meaningfully ordered (a named sheet). */
  index?: number;
  /** The unit's own name where it has one: a sheet name, a slide title, a
   *  section heading. Shown to a person; never used as an identifier. */
  label?: string;
  /** Spreadsheets cite a range. Free text because "B12:F19", a named range and a
   *  table name are all legitimate. */
  range?: string;
  /** Outermost-first heading trail down to this content. What lets a result be
   *  placed in the document rather than floating. */
  headingPath?: string[];
  /** The page's PRINTED number when it differs from its ordinal — roman-numeral
   *  front matter, offprints, appendices. Cite what the reader sees. */
  printedLabel?: string;
}

/** Where a block sits on its page, in fractions of the unit's box (0–1).
 *  Fractions rather than points so a consumer that measures the real rendering
 *  multiplies, exactly as the occlusion pipeline already does. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BlockKind =
  | "heading"
  | "paragraph"
  | "listItem"
  | "table"
  | "figure"
  | "caption"
  | "equation"
  | "code"
  | "quote"
  | "footnote"
  | "formField"
  | "speakerNotes"
  | "other";

/** How the text was obtained. A transcription is not the same as a text layer,
 *  and a consumer that cannot tell them apart cannot report honestly. */
export type ExtractionMethod = "textLayer" | "ooxml" | "cell" | "ocr" | "vision" | "derived";

export interface DocBlock {
  id: string;
  kind: BlockKind;
  /** Reading-order position within its unit, 0-based. */
  ordinal: number;
  /** Heading depth (1–9) or list nesting level. Absent where meaningless. */
  depth?: number;
  text: string;
  box?: Box;
  method: ExtractionMethod;
  /** Set ONLY when the parser has a real basis for doubt — a low-confidence OCR
   *  line, a heading inferred from font size rather than a style. Absent means
   *  "directly extracted", not "certain". */
  confidence?: number;
  /** For `figure`: which visual this block refers to. */
  visualId?: string;
  /** For `table`: which table. */
  tableId?: string;
}

export interface DocCell {
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
  text: string;
  /** Spreadsheets only: the cell's own address, so a citation can name it. */
  ref?: string;
  /** Spreadsheets only: the formula behind a displayed value. Kept because "why
   *  did revenue fall" is often answered by the formula, not the number. */
  formula?: string;
  /** True for a header cell — the thing that makes a table answerable rather
   *  than a grid of numbers. */
  header?: boolean;
}

export interface DocTable {
  id: string;
  locator: Locator;
  /** Caption or nearest heading, where one exists. */
  title?: string;
  rows: DocCell[][];
  method: ExtractionMethod;
}

/**
 * A visual element, described WITHOUT judging its importance.
 *
 * 🔴 NO `educationalRelevance` HERE, ON PURPOSE. Whether a diagram matters
 * educationally, legally or financially is a domain question, and putting it in
 * the parser is how "field-agnostic" quietly becomes "school-shaped". The parser
 * says what it found, where, and how sure it is that it is content rather than
 * furniture; a layer above decides what it is good for.
 */
export interface DocVisual {
  id: string;
  locator: Locator;
  /** Storage path of the ORIGINAL asset where one exists, or of a rendered crop
   *  where the visual is drawn rather than embedded. Never bytes. */
  assetPath?: string;
  /** Natural pixel size — what any downstream box arithmetic must multiply by. */
  width?: number;
  height?: number;
  box?: Box;
  /** Identical bytes appearing many times: one visual, many locations. A crest on
   *  every slide is one entry, not seventy. */
  contentHash?: string;
  alsoAt?: Locator[];
  /** The document's own words about it — a caption, alt text, nearby text.
   *  NOT a model's description; that belongs to the understanding layer. */
  caption?: string;
  nearbyText?: string;
  /** Structural, not semantic: is this content or page furniture? Derived from
   *  repetition, size and position — signals that hold in any discipline and any
   *  language. `unknown` is allowed and is better than a guess. */
  role: "content" | "furniture" | "unknown";
  /** True when the visual is drawn from shapes rather than stored as a file, so a
   *  consumer knows an embedded-asset extractor could never have found it. */
  composited?: boolean;
}

/** One page / slide / sheet / section. */
export interface DocUnit {
  locator: Locator;
  blocks: DocBlock[];
  /** True when this unit's text came from pixels — a scan, a photographed slide.
   *  Downstream honesty depends on being able to say so. */
  transcribed?: boolean;
}

/** What was found and what was NOT. A partial parse must never present as
 *  complete, so every count has a "couldn't" beside it. */
export interface DocCoverage {
  unitsFound: number;
  unitsRead: number;
  /** Units with no readable content at all, by locator, so the gap is nameable. */
  unitsUnread?: number[];
  visualsFound: number;
  visualsKept: number;
  /** Formats nothing available can rasterise — reported, never silently dropped. */
  visualsUnreadable: number;
  tablesFound: number;
  /** Text dropped at a ceiling, if any. */
  truncated?: boolean;
  /** Anything the parser wants to admit in words. */
  notes?: string[];
}

/**
 * The canonical parse. Deliberately richer than anything the chunker emits —
 * chunks are a disposable retrieval representation, and nothing may come to
 * treat one as the canonical text of a document.
 */
export interface ParsedDocument {
  /** sha256 of the ORIGINAL bytes. Physical identity, account-scoped in storage. */
  contentHash: string;
  kind: DocKind;
  /** The parser build that produced this. A new value means a NEW parse row, so
   *  historical parses stay reproducible and comparable. */
  parserVersion: string;
  /** The file's own title where it has one — never the storage key. */
  title?: string;
  units: DocUnit[];
  tables: DocTable[];
  visuals: DocVisual[];
  coverage: DocCoverage;
  /** Format-specific facts worth keeping that have no home above: PDF producer,
   *  workbook defined names, DOCX styles. Never used for control flow. */
  meta?: Record<string, string | number | boolean>;
}

/** A parser: bytes in, normalized document out. Every format implements this and
 *  nothing downstream branches on which one ran. */
export interface DocumentParser {
  readonly kind: DocKind;
  readonly version: string;
  parse(bytes: Uint8Array, fileName: string): Promise<ParsedDocument>;
}

/** Render a locator the way a citation should read. Pure and total — an unknown
 *  shape degrades to the document itself rather than inventing a position. */
export function citeLocator(locator: Locator): string {
  const label = locator.printedLabel ?? (locator.index !== undefined ? String(locator.index) : undefined);
  switch (locator.kind) {
    case "page":
      return label ? `page ${label}` : "this document";
    case "slide":
      return label ? `slide ${label}` : "this deck";
    case "sheet": {
      const sheet = locator.label ?? (label ? `sheet ${label}` : "this sheet");
      return locator.range ? `${sheet}!${locator.range}` : sheet;
    }
    case "section":
      return locator.headingPath?.length ? locator.headingPath[locator.headingPath.length - 1]! : "this document";
    case "document":
      return "this document";
  }
}

/**
 * Every block of a parse in reading order, with the MOST SPECIFIC locator that
 * is true of it — what a chunker consumes, so chunking never has to know the
 * file type.
 *
 * 🔴 A TABLE BLOCK TAKES THE TABLE'S OWN LOCATOR, NOT ITS UNIT'S.
 *
 * The first version of this spread the unit's locator onto every block. A unit
 * locator correctly carries no `range` — a sheet is not a range — so every
 * spreadsheet chunk came out with `cell_range` null and a citation that had to
 * degrade from `Forecast!B12:F19` to `Forecast`. The measured range existed in
 * `doc.tables` the whole time and this function threw it away, which made the
 * XLSX parser's most valuable output unreachable from the one place that
 * consumes it.
 *
 * The rule generalises past spreadsheets: where a block names a more precisely
 * located object, that object's MEASURED locator wins over the containing unit's.
 */
export function* walkBlocks(doc: ParsedDocument): Generator<{ block: DocBlock; locator: Locator }> {
  const tables = new Map(doc.tables.map((table) => [table.id, table.locator]));
  const visuals = new Map(doc.visuals.map((visual) => [visual.id, visual.locator]));

  for (const unit of doc.units) {
    for (const block of unit.blocks) {
      const precise = block.tableId ? tables.get(block.tableId) : block.visualId ? visuals.get(block.visualId) : undefined;
      // The precise locator wins on the fields it actually measured, but the
      // unit's heading trail is still the right context unless the object
      // carries its own — a table knows its range, not the section above it.
      const locator: Locator = precise
        ? { ...precise, headingPath: precise.headingPath ?? unit.locator.headingPath }
        : unit.locator;
      yield { block, locator };
    }
  }
}
