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

import { supabase } from "@/lib/supabase";
import { buildSourceContext, type SourceContext } from "@/lib/sources/source-context";

/** Where a canvas attachment is filed.
 *
 *  🔴 A NAMED FOLDER, NOT THE ROOT. Filing is not free of consequence: these rows are real
 *  documents that show up wherever documents show up. Putting them somewhere obviously named means
 *  a student who wonders where a file went has an answer, and a student who wants it elsewhere can
 *  move it — rather than material silently appearing mixed in with what they filed deliberately. */
export const CANVAS_FOLDER = "Canvas";

export type CanonicalLoadFailure =
  /** No row, or not this user's. */
  | "not-found"
  /** Filed, but nobody has parsed it yet — the queue may still be holding it. */
  | "not-parsed"
  /** Parsed, but the stored structure did not validate, so there is nothing to read. */
  | "unreadable";

export type CanonicalLoad =
  | { ok: true; context: SourceContext }
  | { ok: false; reason: CanonicalLoadFailure };

/** The embed PostgREST returns for a to-one relation.
 *
 *  🔴 AN ARRAY, even though there is at most one. supabase-js types it as a list and reading it as
 *  an object gives `undefined` at runtime — a structure that is silently always missing, which
 *  would make every source look degraded and nothing would fail. */
type ParsedEmbed = { structure?: unknown; doc_kind?: string | null };

function firstEmbed(value: ParsedEmbed[] | ParsedEmbed | null | undefined): ParsedEmbed | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
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
    .select("id,mime_type,created_at,parsed_document_id,parsed_documents(structure,doc_kind)")
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
    ...(row.created_at ? { capturedAt: row.created_at } : {}),
  });

  // A context with no units is not a degraded parse — it is nothing to read. Saying "unreadable"
  // lets the caller fall back to the text it already has, instead of building a lesson from an
  // empty document and reporting success.
  if (context.units.length === 0) return { ok: false, reason: "unreadable" };

  return { context, ok: true };
}
