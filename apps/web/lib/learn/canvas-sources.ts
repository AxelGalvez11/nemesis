// Reading a canvas's material back out of the database, as it actually survived.
//
// 🔴 THE CANVAS USED TO BUILD ITS GROUNDING FROM THE UPLOAD RESPONSE, AND THAT IS A DIFFERENT
// DOCUMENT FROM THE ONE THAT GOT STORED. The response carries whatever the parser produced in that
// request; `parsed_documents.structure` carries whatever survived being written, read back and
// validated. Those two agree right up until they do not — a column that failed to write, a shape
// the envelope reader rejects, a parse that was later redone by the worker — and while the canvas
// reads the first, nothing anywhere can notice the difference. Every later reader (retrieval, the
// reader, extraction, a second canvas) sees only the stored one.
//
// So this is the single door: a filed source id goes in, and what comes out is the same
// `SourceContext` an extractor gets, derived from the same column, through the same validator.
//
// 🔴 AND IT REPORTS QUALITY RATHER THAN HIDING IT. A source whose structure did not survive is
// still usable — one coarse text unit is enough to learn from — but the caller has to be able to
// say so, because "we could not read the table" and "the document had no table" are different
// facts and only one of them is the document's.

import { UNSORTED_FOLDER } from "@nemesis/shared";

import { supabase } from "@/lib/supabase";
import { buildSourceContext, type SourceContext } from "@/lib/sources/source-context";

/**
 * Where a canvas attachment is filed.
 *
 * 🔴 THE EXISTING INBOX, NOT A NEW "CANVAS" FOLDER, AND THAT IS A PRODUCT DECISION. Filing is a
 * BACKEND requirement: a row is what lets a second canvas recognise the same document, lets
 * retrieval index it, and gives a citation something to point at. It is not an instruction to the
 * student to go and manage the file somewhere.
 *
 * Minting a folder named after the surface would have taught exactly the mental model that was
 * retired — "upload in Canvas, then go to the Library to look after it". The user-facing model
 * stays `Canvas session → Sources → this document`. Chat attachments already land in the Inbox, so
 * using it adds a durable record without adding a workflow.
 */
export const CANVAS_FILING_FOLDER = UNSORTED_FOLDER;

export type CanonicalLoadFailure =
  /** No row, or not this user's. */
  | "not-found"
  /** Filed, but nobody has parsed it yet — the queue may still be holding it. */
  | "not-parsed"
  /** Parsed, but the stored structure did not validate, so there is nothing to read. */
  | "unreadable";

/**
 * WHICH parse this context came out of — the bytes and the reader, never the row.
 *
 * 🔴 IT IS NOT ON `SourceContext`, ON PURPOSE. That type is the EXTRACTION boundary: an extractor
 * must decide what a document teaches from what survived, and handing it a parser version invites a
 * lane to branch on one. This is the REPROCESS boundary — the same row, read for a different
 * question — so it travels beside the context rather than inside it.
 *
 * 🔴 EVERY FIELD IS NULLABLE BECAUSE EVERY FIELD GENUINELY CAN BE. `content_hash` is null on rows
 * whose parse predates the column being linked, and PostgREST hands back an embed that this file
 * already documents as arriving in two different shapes. Null means UNKNOWN, and `needsReprocess`
 * treats an unknown current dimension as a reason to suppress a rebuild rather than cause one — so
 * the failure mode of a missing hash is one skipped opportunity, never a surprise bill.
 */
export interface SourceProvenance {
  sourceId: string;
  /** sha256 of the original bytes, as `parsed_documents` recorded them. */
  contentHash: string | null;
  /** The reader that produced this parse — `PARSER_VERSION`, or a vendor's own string. */
  parserVersion: string | null;
}

export type CanonicalLoad =
  | { ok: true; context: SourceContext; provenance: SourceProvenance }
  | { ok: false; reason: CanonicalLoadFailure };

/** The embed PostgREST returns for a to-one relation.
 *
 *  🔴 BOTH SHAPES ARE HANDLED BECAUSE BOTH OCCUR. supabase-js types a to-one embed as a LIST, and
 *  other code in this repo comments that it always is one — but measured against production on
 *  2026-08-11 this particular embed comes back as a bare OBJECT. Whichever a caller assumes, the
 *  other one silently yields `undefined`, every source looks degraded, and nothing fails loudly. */
type ParsedEmbed = {
  structure?: unknown;
  doc_kind?: string | null;
  coverage?: unknown;
  content_hash?: string | null;
  parser_version?: string | null;
};

function firstEmbed(value: ParsedEmbed[] | ParsedEmbed | null | undefined): ParsedEmbed | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/**
 * The two provenance columns, off whichever shape PostgREST handed back.
 *
 * 🔴 EXPORTED SO THE EMBED-SHAPE TRAP CAN BE TESTED WITHOUT A DATABASE, AND IT IS A REAL TRAP THAT
 * THIS FILE HAS ALREADY BEEN CAUGHT BY — see `ParsedEmbed` above. Assume a list and a bare object
 * yields `undefined`; assume an object and a list does. Either way every field reads back null, the
 * material stamp comes out null, and "we already looked at this material" silently starts standing
 * for ever — a cache that can never expire, produced by a shape mismatch nothing throws on.
 *
 * 🔴 FIELD BY FIELD, NEVER CAST. The columns are snake_case and this type is camelCase, so a cast
 * would compile and hand back an object whose every field is `undefined`.
 */
export function provenanceOf(
  sourceId: string,
  embed: ParsedEmbed[] | ParsedEmbed | null | undefined,
): SourceProvenance {
  const parsed = firstEmbed(embed);
  return {
    contentHash: typeof parsed?.content_hash === "string" && parsed.content_hash ? parsed.content_hash : null,
    parserVersion: typeof parsed?.parser_version === "string" && parsed.parser_version ? parsed.parser_version : null,
    sourceId,
  };
}

/**
 * Load a filed source as the canonical extraction boundary.
 *
 * One round trip: the row and its parse are read together, because a decision made from either
 * one alone is wrong in a familiar way — a parse with no row cannot be anchored to anything, and a
 * row with no parse cannot be read at all.
 */
export async function loadCanonicalSource(librarySourceId: string): Promise<CanonicalLoad> {
  const { data, error } = await supabase
    .from("library_sources")
    // 🔴 `content_hash` AND `parser_version` ARE SELECTED FOR THE REPROCESS QUESTION, NOT THE
    // EXTRACTION ONE. They never reach `buildSourceContext`; they answer "is a stored answer about
    // this document still the answer the current rules would give?" — see `SourceProvenance`.
    .select(
      "id,mime_type,created_at,parsed_document_id,parsed_documents(structure,doc_kind,coverage,content_hash,parser_version)",
    )
    .eq("id", librarySourceId)
    .maybeSingle();

  if (error || !data) return { ok: false, reason: "not-found" };

  const row = data as {
    created_at?: string | null;
    parsed_document_id?: string | null;
    parsed_documents?: ParsedEmbed[] | ParsedEmbed | null;
  };
  const parsed = firstEmbed(row.parsed_documents);
  if (!row.parsed_document_id || !parsed) return { ok: false, reason: "not-parsed" };

  const context = buildSourceContext({
    // 🔴 The DURABLE id, so anchors minted from this context mean the same thing in every canvas
    // and after every reparse. A canvas-local "s1" here would make them meaningless elsewhere.
    sourceId: librarySourceId,
    sourceKind: parsed.doc_kind ?? "unknown",
    structure: parsed.structure,
    // 🔴 SELECTED ALONGSIDE structure, ON PURPOSE. This is the one production door onto
    // `contentIntegrity` (see source-context.ts): omitting this column here is indistinguishable
    // from a row that genuinely has no coverage yet, and both read back as "unknown" rather than a
    // guessed-healthy verdict — but only the second one is honest.
    coverage: parsed.coverage,
    ...(row.created_at ? { capturedAt: row.created_at } : {}),
  });

  // A context with no units is not a degraded parse — it is nothing to read. Saying "unreadable"
  // lets the caller fall back to the text it already has, instead of building a lesson from an
  // empty document and reporting success.
  if (context.units.length === 0) return { ok: false, reason: "unreadable" };

  // 🔴 BUILT FROM THE RAW EMBED, NOT FROM `parsed`, SO ONE FUNCTION OWNS THE SHAPE HANDLING. Two
  // readers of a value that arrives in two shapes is two chances to pick the wrong one.
  return { context, ok: true, provenance: provenanceOf(librarySourceId, row.parsed_documents) };
}
