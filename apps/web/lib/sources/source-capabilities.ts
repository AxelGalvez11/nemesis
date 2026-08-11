// What a stored source can actually answer, and whether that was the intended result.
//
// 🔴 CAPABILITIES ARE DERIVED FROM WHAT SURVIVED PERSISTENCE — NEVER FROM WHAT A PARSER CLAIMED.
// The question downstream needs answered is not "what did the parser believe it produced?" but
// "what can Canvas and extraction consume after serialisation, persistence, validation and
// reload?". So every function here starts from the raw `parsed_documents.structure` column and
// runs it through `readStructureEnvelope` — the same validator production reads with. A parser
// that builds a heading tree in memory and a serializer that drops it must yield
// `hierarchy: false`, because nothing downstream can use what is no longer there.
//
// This is not a hypothetical failure mode in this codebase. Structure has been computed and then
// discarded at a boundary three separate times; a validator once rebuilt units field-by-field and
// silently deleted `label`; two calendar decoders each deleted what the other added. Deriving
// capability from a claim rather than from the stored bytes is how all of those stayed invisible.
//
// 🔴 THIS LIVES IN apps/web, NOT packages/shared. Only the web app consumes it today. A previous
// attempt put the same idea in `packages/shared`, where an `export *` collision with an existing
// type failed ONLY the mobile typecheck — a boundary the web tsconfig cannot see. A type belongs
// at the narrowest boundary that genuinely owns it; move it outward when a second runtime needs
// it, and verify that move with root `turbo typecheck`.

import { readStructureEnvelope, type DocumentModel } from "@nemesis/shared";

/** What information a stored source can supply. Each field is a promise a caller may rely on. */
export interface SourceCapabilities {
  /** There is readable text. Enough on its own for dates and simple associations. */
  text: boolean;
  /** The parse produced addressable units rather than one undivided string. */
  semanticUnits: boolean;
  /** At least one block is a heading — the document's own signposting survived. */
  headings: boolean;
  /** Blocks know which section they sit under, so a unit can be given context. */
  hierarchy: boolean;
  /** A block can be traced to the page/slide/sheet it came from, so a citation can name it. */
  pageAnchors: boolean;
  /** At least one table survived as a grid rather than as flattened words. */
  tables: boolean;
  /**
   * At least one table came back with a CELL model, so a merged cell is knowable.
   *
   * 🔴 SEPARATE FROM `tables`, AND THE DIFFERENCE IS WHAT A CALLER MAY CONCLUDE FROM A BLANK.
   * Without cells, a position that is empty because a neighbour spans it is indistinguishable
   * from one the document genuinely left blank — so "the instructor for session 3" reads as
   * unstated when the file says otherwise. With cells, an empty cell is a real absence. This is
   * therefore a licence to TRUST a blank, not a claim that the document contains merges.
   *
   * False means unknown, never "this document has no merged cells": a producer that does not
   * report cells has not told us either way.
   */
  mergedCells: boolean;
  /** At least one figure survived as a figure. */
  figures: boolean;
  /** Blocks carry rectangles, so a region of the original can be pointed at or cropped. */
  geometry: boolean;
}

/** Was this outcome expected for a source of this kind?
 *
 *  🔴 A SEPARATE QUESTION FROM CAPABILITY, AND COLLAPSING THEM BREAKS BOTH DIRECTIONS. The
 *  identical capability set — text yes, hierarchy no, figures no — is perfectly healthy for a
 *  pasted note and a regression for a PDF that used to come back with 197 blocks. Derive quality
 *  from capabilities alone and you either false-alarm on every text file or hide every PDF
 *  regression. */
export type ParseQuality = "full" | "degraded" | "failed";

export const NO_CAPABILITIES: SourceCapabilities = {
  figures: false,
  geometry: false,
  headings: false,
  hierarchy: false,
  mergedCells: false,
  pageAnchors: false,
  semanticUnits: false,
  tables: false,
  text: false,
};

/** Capabilities of an already-validated canonical model. */
export function deriveCapabilities(model: DocumentModel): SourceCapabilities {
  const blocks = model.blocks;
  return {
    figures: blocks.some((block) => block.kind === "figure" || block.figure !== undefined),
    geometry: blocks.some((block) => block.rect !== undefined),
    headings: blocks.some((block) => block.kind === "heading"),
    // 🔴 HIERARCHY IS A NON-EMPTY headingPath, NOT THE PRESENCE OF HEADINGS. A document can hold
    // heading blocks while every other block sits at the root — that is a flat list of lines that
    // happen to be bold, and a caller told `hierarchy: true` would ask for a section context that
    // does not exist. Measured on the real production document this matters: 29 of its blocks are
    // headings, but only 2 of those carry a path — the hierarchy is supplied by its paragraphs.
    hierarchy: blocks.some((block) => block.headingPath.length > 0),
    // A cell model on ANY table is what makes a blank cell mean something on that table.
    mergedCells: blocks.some((block) => (block.table?.cells?.length ?? 0) > 0),
    pageAnchors: model.units.length > 0 && blocks.length > 0,
    semanticUnits: blocks.length > 0,
    tables: blocks.some((block) => block.kind === "table" || block.table !== undefined),
    text: blocks.some((block) => block.text.trim().length > 0),
  };
}

/** Capabilities of a stored `parsed_documents.structure` value. The one callers should use. */
export function capabilitiesOfStored(structure: unknown): SourceCapabilities {
  const envelope = readStructureEnvelope(structure);
  if (!envelope) return NO_CAPABILITIES;
  if (envelope.shape === "text-only") {
    // Words, and nothing to locate them by. Not a failure — see `parseQuality` — but the honest
    // description of what a legacy row holds.
    return { ...NO_CAPABILITIES, text: envelope.text.trim().length > 0 };
  }
  const derived = deriveCapabilities(envelope.model);
  // The envelope keeps its own flat text beside the model, so a model whose blocks are all empty
  // can still be readable.
  return { ...derived, text: derived.text || envelope.text.trim().length > 0 };
}

/** Formats that carry structure by construction, so its absence means something was lost. */
const STRUCTURED_BY_NATURE = new Set(["pdf", "docx", "doc", "pptx", "ppt"]);

/** Was this parse what should have happened for a source of this kind?
 *
 *  🔴 `coverage.state` IS DELIBERATELY NOT CONSULTED HERE, AND THE REAL DATA IS WHY. Both
 *  structured production rows are stored `partially_parsed` — yet their coverage reports
 *  `unitsUnread: 0` and `truncation: []`, and the ONLY reason for "partial" is
 *  `figures: {skipped: 3, reasons: {"not-examined": 3}}`: three figures were never sent to
 *  vision. That is a missing figure DESCRIPTION, not missing text, and for schedule or
 *  association extraction it changes nothing. Folding it into quality would mark a perfectly good
 *  197-block parse as degraded and teach everyone to ignore the field. */
export function parseQuality(input: {
  capabilities: SourceCapabilities;
  /** File extension or doc kind — "pdf", "txt", "transcript", … */
  sourceKind: string;
}): ParseQuality {
  if (!input.capabilities.text) return "failed";
  const kind = input.sourceKind.trim().toLowerCase().replace(/^\./, "");
  if (!STRUCTURED_BY_NATURE.has(kind)) return "full";
  // A PDF that came back as bare words has not failed — the text is real and usable — but it is
  // not the intended result, and calling it "full" is how a regression stays invisible.
  return input.capabilities.semanticUnits ? "full" : "degraded";
}

/**
 * How many units the parse read.
 *
 * 🔴 THE HONEST NAME FOR `parsed_documents.unit_count`. That column counts units the parser
 * WALKED — pages, for a PDF — and says nothing about whether structure was persisted. Production
 * proved the trap: a row with `unit_count: 24` whose entire stored structure is one flat string.
 * Use this to talk about pages; use `capabilitiesOfStored` to decide what a source can do.
 */
export function parsedPageCount(row: { unit_count?: number | null }): number {
  return Math.max(0, Math.trunc(row.unit_count ?? 0));
}
