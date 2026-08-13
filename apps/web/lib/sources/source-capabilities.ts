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

import { readStructureEnvelope, type DocumentModel, type ExtractionCoverage } from "@nemesis/shared";

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
 * Can the recovered TEXT itself be trusted for semantic extraction (causal
 * relationships, associations) — as opposed to `ParseQuality`, which asks
 * whether the PARSE did what a source of this kind should do.
 *
 * 🔴 A DIFFERENT QUESTION FROM `parseQuality`, ON PURPOSE, AND NOT A REPLACEMENT
 * FOR IT. The precise gap, because it is easy to state wrongly:
 * **`parseQuality` never consults coverage.** It takes capabilities and a source
 * kind, nothing else. So it catches a STRUCTURAL collapse and cannot, even in
 * principle, see CONTENT loss inside a parse that came back well structured — a
 * 26-page PDF with 197 blocks and twenty pages unread still reports `"full"`,
 * because it produced addressable units and that is all `parseQuality` asks.
 *
 * Measured over all 11 production rows rather than argued: the six `text-only`
 * PDFs report `quality: "degraded"` — that collapse is already caught, and this
 * verdict adds nothing there. Where it earns its place is the other five, which
 * report `"full"`: three of them carry coverage `state: "partial"` purely
 * because figures were never examined, and one (`9551f235`) has genuinely lost a
 * page of text. Gating on `state` refuses all four; gating on `quality` refuses
 * none of them. `contentIntegrity` refuses exactly the one whose TEXT is
 * incomplete. That 4-vs-1 separation is the whole reason it exists, and neither
 * existing field can express it.
 *
 * Collapsing the two would either re-break the false-alarm problem
 * `parseQuality` was written to avoid, or hide the content-loss signal. They are
 * stored side by side instead.
 *
 * 🔴 THE BASELINE THIS WAS COMPUTED AGAINST — 2026-08-12, recorded because the
 * value ROTS SILENTLY WITHOUT IT. "Can the recovered text be trusted" is a claim
 * about usefulness, and usefulness is not one-dimensional: it depends on the
 * knowledge type, which lives downstream of this layer. Today two structural
 * properties are depended on — SENTENCE INTEGRITY (did prose survive as
 * sentences or as fragments), which decides causal extraction, and TABULAR
 * STRUCTURE (did row/column pairing survive), which decides associations.
 * Reading order matters only for sequence knowledge, which does not exist yet.
 *
 * So `intact` means "intact for those two". Add a knowledge type with different
 * structural needs and a stored `intact` silently starts meaning something
 * narrower than it did, with nothing to flag it. The durable fix is to name
 * verdicts by WHAT SURVIVED rather than by whether it can be trusted; that is
 * agreed and not yet built. Until it is, this docstring is the baseline — read
 * it before treating an old `intact` as an answer to a new question.
 *
 * 🔴 THE SAME EXCLUSION AS `parseQuality`, FOR THE SAME REASON: an unexamined
 * figure (`figures.reasons["not-examined"]`) does not corrupt the TEXT next to
 * it, so it must NOT downgrade this verdict either. Only signals that mean the
 * TEXT itself is incomplete count: a region the parser saw and could not turn
 * into content (`unreadableRegions`), a whole unit never read (`unitsUnread`),
 * or text cut at extraction. If a future change makes this consult `figures`,
 * that is the same false-alarm regression `parseQuality` already measured and
 * rejected — read that docstring again before doing it.
 *
 * 🔴 A KNOWN, STATED LIMIT: THIS CANNOT SEE READING-ORDER LOSS. Two columns
 * merged into one interleaved block reports no unread units, no unreadable
 * regions and no truncation — `state=complete` and every count reconciles —
 * because nothing in this codebase detects that failure today. `intact` here
 * means "no known loss," not "verified whole." Widening the signal set is a
 * parser change, not a change to this function.
 *
 * 🔴 `unitsVision` AND `unitsBoth` DO NOT COUNT AS LOSS, DELIBERATELY. A page
 * read by vision instead of its text layer is still RECOVERED text — the
 * method changed, not the outcome — so it must not downgrade this verdict.
 * Only `unitsUnread` (nothing came back by either method) means the text
 * itself is incomplete.
 *
 * 🔴 NO CONSUMER READS THIS FIELD YET. It exists to cross the boundary as a
 * value ahead of its first reader (causal knowledge extraction), the same way
 * `unreadableKinds` was persisted before anything computed a verdict from it.
 * See `docs/canvas-agent-board.md`, task `PARSER-001`.
 */
export type ContentIntegrity =
  /** Text recovered, and nothing charted here says any of it is missing. */
  | "intact"
  /** Text recovered, but coverage shows content this parse could not deliver. */
  | "lossy"
  /** No usable text at all — nothing here to extract a claim from. */
  | "unreadable"
  /**
   * Coverage was not available to check. 🔴 MUST NOT COLLAPSE INTO `intact`.
   * "We do not know" and "we checked and it is fine" call for the same caution
   * Brain draws between `learner_state = unknown` and mastery — an `intact`
   * verdict is a claim, and this function does not make it without evidence.
   */
  | "unknown";

export function deriveContentIntegrity(input: {
  capabilities: SourceCapabilities;
  /** Null when coverage genuinely was not available — the in-memory fallback
   *  path, or a row parsed before this field existed. Never a stand-in for
   *  "nothing was lost"; that is what `intact` is for. */
  coverage: ExtractionCoverage | null;
}): ContentIntegrity {
  if (!input.capabilities.text) return "unreadable";
  if (!input.coverage) return "unknown";
  const lossy =
    (input.coverage.unreadableRegions ?? 0) > 0 ||
    input.coverage.unitsUnread > 0 ||
    input.coverage.truncation.some((cut) => cut.stage === "extract");
  return lossy ? "lossy" : "intact";
}

/**
 * Is this a document whose content is locked in pixels?
 *
 * 🔴 DERIVED, NEVER STORED, AND THAT IS THE WHOLE DESIGN. "Vision is required
 * here" is not a new fact — it is two facts this module already reads out of the
 * persisted structure: the parse located things, and none of them are readable.
 * A stored flag would be a third copy of an answer the bytes already give, and
 * every stored copy in this codebase has eventually disagreed with its source.
 *
 * True for the case #486 exists for: a scanned handout or slides exported as
 * images, where `figures`/`geometry` are present and `text` is absent. It says
 * a reader that can see pictures would finish the job — NOT that one has run,
 * and not that one is configured.
 *
 * False for a document with no text and no figures either: nothing was found, so
 * there is nothing to say a second reader would rescue.
 */
export function needsVision(capabilities: SourceCapabilities): boolean {
  return !capabilities.text && capabilities.figures;
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
