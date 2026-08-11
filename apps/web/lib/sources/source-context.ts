// The one shape every semantic extractor reads.
//
// 🔴 EXTRACTORS DO NOT READ DOCUMENT ROWS AND DO NOT KNOW WHAT A PDF IS. Schedule extraction and
// knowledge extraction are siblings over this one boundary, so there is exactly one
// `extractScheduleCandidates(context)` and one `extractKnowledgeObjects(context)` — never a
// flat-text variant beside a structured one. A PDF, a slide deck, a Word file, a lecture
// transcript and an OpenStax chapter all arrive here as the same thing.
//
// 🔴 STRUCTURE IS PROGRESSIVE, NOT A SECOND ARCHITECTURE. A structured source yields headings,
// paragraphs, tables and figures. A legacy row yields one coarse text unit, because that is
// genuinely all that survived. Same contract, different evidence. Both exist in production right
// now, which is what makes this testable rather than theoretical.
//
// 🔴 AND NOTHING HERE FLATTENS STRUCTURE BACK INTO A STRING. Repairing the PDF parser and then
// joining its 197 blocks into one blob at the extraction boundary would throw away exactly what
// was just fixed — and this codebase has discarded a computed document model at a boundary three
// times already.

import { blockToText, readStructureEnvelope, type DocBlock, type DocumentModel } from "@nemesis/shared";

import {
  capabilitiesOfStored,
  deriveCapabilities,
  parseQuality,
  type ParseQuality,
  type SourceCapabilities,
} from "./source-capabilities";

/** A quotation, in the shape it can be re-found from after the source is reparsed.
 *
 *  🔴 QUOTE-BASED, NOT OFFSET-BASED, AND THAT IS THE DURABILITY PROPERTY. Character offsets are
 *  specific to one representation: the same sentence sits at a different offset the moment a
 *  better parser runs, and reparsing is exactly what happens as source fidelity improves. An
 *  anchor built from the text itself still resolves, so a calendar event or knowledge object
 *  extracted today survives its source being upgraded tomorrow rather than being orphaned.
 *  Offsets remain useful for highlighting and fast lookup — as accelerators, never as identity. */
export interface TextQuoteAnchor {
  exact: string;
  /** Context either side, to disambiguate a phrase that appears more than once. */
  prefix?: string;
  suffix?: string;
}

/** Where something sits in its source.
 *
 *  🔴 DELIBERATELY NOT CALLED `SourceRef`. That name is already exported by the shared package
 *  AND used by the Canvas model, where it means `{sourceId, excerptId}` and `excerptId` resolves
 *  against a Canvas source's own excerpt list (`${sourceId}:e${n}`, minted in canvas-grounding).
 *  A document block id is not an excerpt id, so reusing the name — or converting between them by
 *  assuming they match — would produce a locator that passes every check and points at nothing.
 *  A broken locator is worse than a missing one.
 *
 *  Every field beyond `sourceId` is optional because every field beyond `sourceId` is something a
 *  particular parse may not know. Absent means unknown; it never means zero. */
export interface CanonicalSourceAnchor {
  sourceId: string;
  /** The block this came from, when the parse produced blocks. */
  unitId?: string;
  /** 1-based page/slide/sheet. 🔴 Present ONLY when the stored model actually knows it. */
  page?: number;
  /** Headings this sits under, outermost first. */
  headingPath?: string[];
  /** The bridge across reparses. */
  quote?: TextQuoteAnchor;
}

/** What kind of thing a unit is. Extractors branch on this and on capabilities — never on the
 *  file format that produced them. */
export type CanonicalSourceUnitType =
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "figure"
  | "equation"
  | "transcript_segment"
  /** The whole-source fallback when nothing finer survived. */
  | "text"
  | "other";

/** A grid, as cells.
 *
 *  🔴 STRUCTURALLY THE SHARED `DocTable`, DECLARED SEPARATELY ON PURPOSE. The two fields here are
 *  the ones that mean the same thing in a Word table, a slide table and a PDF table recovered from
 *  ruled lines. `DocTable` is free to grow geometry, cell spans or per-cell rects as the table
 *  lane lands; an extractor must not start branching on those, so they do not cross this boundary
 *  — the mapping below copies these two fields by name rather than spreading the block's table. */
export interface CanonicalSourceTable {
  rows: string[][];
  /** How many leading rows are headers. 0 means the parse did not know, never "row 0 is data". */
  headerRows: number;
}

export interface CanonicalSourceUnit {
  id: string;
  type: CanonicalSourceUnitType;
  text?: string;
  /** The cells, when this unit is a table.
   *
   *  🔴 CELLS, NOT A RENDERING OF CELLS. `text` carries a markdown grid so a model reading the
   *  unit still sees rows and columns, but an extractor that wants "the term in column 1 and its
   *  definition in column 2" must never have to re-split that string on pipe characters. Splitting
   *  a rendering back apart is the flattening this whole boundary exists to prevent. */
  table?: CanonicalSourceTable;
  /** What the DOCUMENT calls the page/slide/sheet this sat on — a slide's title placeholder, a
   *  sheet's name.
   *
   *  🔴 NEVER GENERATED, and never a locator. "Slide 12" is derived from the page number and does
   *  not belong here; this is the author's own name for the unit, absent when they gave none. It
   *  matters because a deck's structure often lives entirely in title placeholders rather than in
   *  heading blocks, so without it every excerpt from a slide deck loses the only label it had. */
  unitLabel?: string;
  anchor: CanonicalSourceAnchor;
}

export interface SourceContext {
  sourceId: string;
  /** "pdf", "docx", "transcript", … Used for parse QUALITY only, never for extraction branching. */
  sourceKind: string;
  capabilities: SourceCapabilities;
  quality: ParseQuality;
  title: string | null;
  /** When the material was delivered, when known — a lecture's date, a syllabus's upload.
   *  🔴 The anchor a relative date like "next Friday" is resolved against; without it
   *  `resolveRelativeDate` refuses to run rather than guessing a year. */
  capturedAt?: string;
  units: CanonicalSourceUnit[];
}

/** How much text either side of a quote is kept. Long enough to disambiguate a repeated phrase,
 *  short enough not to store the document twice. */
const QUOTE_CONTEXT = 32;

/** Build a re-findable anchor for a quotation inside some text.
 *
 *  `from` disambiguates when the same words appear more than once. It is a search hint used at
 *  build time, not stored provenance, so a later reparse that moves the text still resolves. */
export function quoteAnchor(text: string, exact: string, from = 0): TextQuoteAnchor {
  const at = text.indexOf(exact, Math.max(0, from));
  if (at < 0) return { exact };
  const prefix = text.slice(Math.max(0, at - QUOTE_CONTEXT), at);
  const suffix = text.slice(at + exact.length, at + exact.length + QUOTE_CONTEXT);
  return { exact, ...(prefix ? { prefix } : {}), ...(suffix ? { suffix } : {}) };
}

/** Find a quotation again in (possibly reparsed) text. -1 when it is genuinely gone.
 *
 *  Tries the disambiguated form first, then the bare quote — so an anchor still resolves when a
 *  reparse changed only the surrounding whitespace, which is the common case. */
export function resolveQuote(text: string, anchor: TextQuoteAnchor): number {
  if (anchor.prefix || anchor.suffix) {
    const full = `${anchor.prefix ?? ""}${anchor.exact}${anchor.suffix ?? ""}`;
    const at = text.indexOf(full);
    if (at >= 0) return at + (anchor.prefix?.length ?? 0);
  }
  return text.indexOf(anchor.exact);
}

const BLOCK_TO_UNIT: Record<string, CanonicalSourceUnitType> = {
  caption: "paragraph",
  equation: "equation",
  figure: "figure",
  heading: "heading",
  listItem: "list",
  note: "paragraph",
  paragraph: "paragraph",
  table: "table",
};

/**
 * Turn a stored `parsed_documents.structure` value into the extraction boundary.
 *
 * 🔴 READS THE PERSISTED COLUMN THROUGH THE REAL VALIDATOR, for the same reason capabilities do:
 * what an extractor receives must be exactly what survived, not what a parser believed it made.
 */
export function buildSourceContext(input: {
  sourceId: string;
  sourceKind: string;
  /** The raw `parsed_documents.structure` column. */
  structure: unknown;
  capturedAt?: string;
}): SourceContext {
  const envelope = readStructureEnvelope(input.structure);
  const capabilities = capabilitiesOfStored(input.structure);
  const base = {
    capabilities,
    capturedAt: input.capturedAt,
    quality: parseQuality({ capabilities, sourceKind: input.sourceKind }),
    sourceId: input.sourceId,
    sourceKind: input.sourceKind,
    title: envelope?.title ?? null,
  };

  if (!envelope) return { ...base, units: [] };

  // The legacy lane. One coarse unit holding the whole text — extraction still works, because a
  // date needs no heading semantics, and a quote anchor is enough to point back at the sentence.
  if (envelope.shape === "text-only") {
    if (!envelope.text.trim()) return { ...base, units: [] };
    return {
      ...base,
      units: [{
        // 🔴 No page and no heading path, because the stored row does not know them. A citation
        // reading "page 3" because a number was plausible is worse than one that says only "this
        // sentence, in this source" — the second is checkable and the first cannot be caught.
        anchor: { sourceId: input.sourceId, unitId: "u0" },
        id: "u0",
        text: envelope.text,
        type: "text",
      }],
    };
  }

  return { ...base, units: unitsFromModel(envelope.model, input.sourceId) };
}

/**
 * The same boundary, built from a model held in memory rather than read out of a column.
 *
 * 🔴 THE FALLBACK PATH, AND IT EXISTS SO THERE IS STILL ONLY ONE SET OF RULES. A file that has
 * just been uploaded has a model in the response before anything has been stored, and a caller
 * that could not read the stored parse — the write failed, the row is not there yet — should still
 * get structure rather than dropping to flat text. Routing that case through a SECOND
 * model-to-excerpts implementation is exactly how "what the canvas cites" and "what an extractor
 * reads" drift apart while every test on both sides passes.
 *
 * 🔴 AND IT IS NOT A SUBSTITUTE FOR THE STORED PARSE. What is in hand here has not survived being
 * written and read back, so a caller that has the choice must prefer `buildSourceContext`.
 */
export function sourceContextFromModel(input: {
  sourceId: string;
  sourceKind: string;
  model: DocumentModel;
  capturedAt?: string;
}): SourceContext {
  const capabilities = deriveCapabilities(input.model);
  return {
    capabilities,
    capturedAt: input.capturedAt,
    quality: parseQuality({ capabilities, sourceKind: input.sourceKind }),
    sourceId: input.sourceId,
    sourceKind: input.sourceKind,
    title: input.model.title,
    units: unitsFromModel(input.model, input.sourceId),
  };
}

function unitsFromModel(model: DocumentModel, sourceId: string): CanonicalSourceUnit[] {
  return model.blocks.map((block) => ({
    anchor: {
      // The model's `unit` is a 0-based index into pages/slides/sheets; a reader counts from 1.
      page: block.unit + 1,
      sourceId,
      unitId: block.id,
      ...(block.headingPath.length > 0 ? { headingPath: block.headingPath } : {}),
    },
    id: block.id,
    text: unitText(block),
    type: BLOCK_TO_UNIT[block.kind] ?? "other",
    // Copied field by field rather than spread, so geometry or cell spans added to `DocTable` as
    // the table lane lands cannot silently cross this boundary and start being branched on.
    ...(block.table ? { table: { headerRows: block.table.headerRows, rows: block.table.rows } } : {}),
    ...(model.units[block.unit]?.label?.trim() ? { unitLabel: model.units[block.unit]!.label!.trim() } : {}),
  }));
}

/**
 * What one block reads as at this boundary.
 *
 * 🔴 THIS USED TO BE `block.text`, AND THAT MADE EVERY TABLE INVISIBLE. Not flattened — gone.
 * Every canonical table builder in the codebase (`pdf/structure.ts`, `pptx-model.ts`,
 * `docx-model.ts`, the docling adapter) stores `text: ""` on a table block, because the grid IS
 * the content and `blockToText` renders it from `block.table`. Copying `block.text` verbatim
 * therefore handed extractors an empty string, and `readableUnits` — correctly — dropped it. The
 * one structure the ruled-table work exists to recover could not reach a single extractor.
 *
 * So the rendering is delegated to the same function the rest of the system renders with, with
 * exactly two deliberate departures:
 */
function unitText(block: DocBlock): string {
  // 1. A HEADING IS NOT MARKDOWN HERE. `blockToText` prefixes "### ", which would then be part of
  //    any quote anchor built from it and would fail to match the source on a later reparse. The
  //    unit's `type` already carries the fact that it is a heading.
  if (block.kind === "heading") return block.text;

  // 2. OUR OWN DISCLOSURE IS NOT THE DOCUMENT'S CONTENT. `blockToText` renders a figure nobody
  //    looked at as the literal string "[Figure — not examined]". Letting that through would make
  //    it a readable unit an extractor could quote and a citation could point at — a model citing
  //    our admission of ignorance as though it were evidence. That a figure exists and was not
  //    examined is already carried by `coverage`, which is where a disclosure belongs.
  if (block.kind === "figure" && !block.text.trim() && !block.figure?.description?.trim()) return "";

  return blockToText(block);
}

/** An anchor to a quotation inside one of a context's units, carrying whatever provenance that
 *  unit actually has. The single place an extractor should build one. */
export function anchorInUnit(unit: CanonicalSourceUnit, exact: string, from = 0): CanonicalSourceAnchor {
  return { ...unit.anchor, quote: quoteAnchor(unit.text ?? "", exact, from) };
}

/** Everything readable, in order — an extractor's usual entry point. */
export function readableUnits(context: SourceContext): CanonicalSourceUnit[] {
  return context.units.filter((unit) => (unit.text ?? "").trim().length > 0);
}

/** The heading a unit sits under, or null. Cheap section context for an extractor that wants to
 *  know what part of a document a date or a term came from. */
export function sectionOf(unit: CanonicalSourceUnit): string | null {
  const path = unit.anchor.headingPath;
  return path && path.length > 0 ? path[path.length - 1]! : null;
}
