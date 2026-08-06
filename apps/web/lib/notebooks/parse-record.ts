/**
 * Writing down what a parse achieved, so it survives the request that made it.
 *
 * 🔴 WHY THIS EXISTS. Before it, the coverage record lived exactly as long as
 * one HTTP response. Reload the page and the fact that 260 of 300 pages were
 * never read was simply gone — the note stayed, the source stayed, and the only
 * thing that disappeared was the caveat. Everything downstream then treated the
 * document as whole, because nothing was left to say otherwise.
 *
 * FOUR IDENTITIES, and this module writes the middle two links:
 *
 *     file       -> content_hash (sha256 of the ORIGINAL bytes)
 *     parse      -> parsed_documents.id  (user_id, content_hash, parser_version)
 *     placement  -> library_sources.id   (folder, title, course)
 *
 * The same file filed into two folders is TWO placements and ONE parse. That is
 * why the parse is keyed on the bytes and not on the row that happens to point
 * at it.
 *
 * 🔴 SERVER ONLY. It uses the service role, which bypasses row-level security.
 * `userId` MUST be the id `verifyDeviceKey` resolved — never a value from the
 * request body, and never anything read out of the document. A document is data;
 * it does not get to say whose it is.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO: build the canonical document model.
 * `structure` gets a versioned envelope holding the flat text this extractor can
 * honestly produce today, and nothing more. Phase 2 replaces its contents; the
 * `v` field is what lets it do so without having to guess what an old row meant.
 */

import { createHash } from "node:crypto";

import { PARSER_VERSION, unitsRead, type ExtractionCoverage } from "@nemesis/shared";

import { adminClient } from "@/lib/server";

/** Matches `parsed_documents.doc_kind`'s CHECK constraint. */
export type ParsedDocKind = "pdf" | "pptx" | "docx" | "xlsx" | "image" | "text" | "html";

/**
 * Where the row sits in the PIPELINE — a different question from what the parse
 * achieved.
 *
 * 🔴 THIS IS A MIRROR OF THE SQL, NOT THE DECISION. `record_parsed_document`
 * derives `state`, `complete` and `failed_stage` from the coverage it is handed,
 * inside the same statement that writes them, so a caller CANNOT ship a headline
 * that disagrees with its own numbers. This function exists only so the mapping
 * can be read and tested in TypeScript; nothing passes its result to the
 * database. If the two ever diverge, the database wins — that is the point of
 * putting it there.
 *
 * Phase 0b stops at parsing, so `chunking`/`embedding`/`ready` are not reachable
 * yet: a parse that read something rests at `parsed` or `partially_parsed`.
 */
export function pipelineStateFor(coverage: ExtractionCoverage): "parsed" | "partially_parsed" | "failed" {
  if (coverage.state === "failed") return "failed";
  return coverage.state === "partial" ? "partially_parsed" : "parsed";
}

/** The envelope written into `parsed_documents.structure`. */
export interface StructureEnvelope {
  /**
   * 🔴 THE VERSION IS THE POINT. Phase 2 will put a real unit/block model in
   * this column. A row written today must be distinguishable from one written
   * then WITHOUT inspecting its shape and guessing, or every later reader ends
   * up sniffing keys and getting it wrong on some edge.
   */
  v: 1;
  /**
   * What kind of parse produced it. `text-only` says exactly what this is: the
   * flat string the current extractor returns, with no units, no blocks and no
   * locators. Naming it is what keeps a later reader from mistaking an absence
   * of structure for a document that had none.
   */
  shape: "text-only";
  title: string | null;
  text: string;
}

export function structureEnvelope(input: { title: string | null; text: string }): StructureEnvelope {
  return { shape: "text-only", text: input.text, title: input.title, v: 1 };
}

/** sha256 of the original bytes, lowercase hex — the file's physical identity. */
export function contentHashOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface PersistParseInput {
  /** The id `verifyDeviceKey` resolved. Never from the request body. */
  userId: string;
  /** The `library_sources` row this extraction was performed for, already proven
   *  to belong to `userId` by the fetch that produced the bytes. */
  sourceId: string;
  contentHash: string;
  docKind: ParsedDocKind;
  coverage: ExtractionCoverage;
  title: string | null;
  text: string;
}

export type PersistParseResult =
  | { ok: true; parsedDocumentId: string; linked: boolean }
  /** The write did not happen. The extraction itself still succeeded, so the
   *  caller returns the text; only the durable record is missing. */
  | { ok: false; reason: "unavailable" };

/**
 * Record the parse, then point the placement at it.
 *
 * 🔴 THE ORDER IS LOAD-BEARING. The parse row is self-contained and truthful on
 * its own; a placement pointing at a row that does not exist is not. So the
 * parse is written first, and if the link then fails the worst outcome is a
 * parse nothing references yet — invisible, never misleading. Doing it the other
 * way round would leave a source claiming a parse that was never written.
 *
 * Never throws. A durable record is worth having and is not worth failing an
 * upload over: a student who cannot add their lecture because a bookkeeping
 * write timed out has lost more than the caveat was worth.
 */
export async function persistParse(input: PersistParseInput): Promise<PersistParseResult> {
  let admin: ReturnType<typeof adminClient>;
  try {
    admin = adminClient();
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  try {
    // The preservation rule — never replace a complete parse with a worse one —
    // lives inside this function, in the database, so two requests racing on the
    // same file cannot resolve it differently. See the migration.
    const { data, error } = await admin.rpc("record_parsed_document", {
      p_content_hash: input.contentHash,
      p_coverage: input.coverage as unknown as Record<string, unknown>,
      p_doc_kind: input.docKind,
      p_error: null,
      p_parser_version: PARSER_VERSION,
      p_structure: structureEnvelope({ text: input.text, title: input.title }) as unknown as Record<string, unknown>,
      p_unit_count: input.coverage.units,
      // What was actually described, not what was found — the number a reader
      // should trust is the one that says how much made it through.
      p_visual_count: input.coverage.figures.described,
      p_user_id: input.userId,
    });
    if (error || typeof data !== "string") {
      console.warn(JSON.stringify({ event: "parse_record_failed", detail: error?.message ?? "no id returned" }));
      return { ok: false, reason: "unavailable" };
    }

    // 🔴 SCOPED TO THE OWNER EVEN THOUGH THE CALLER ALREADY CHECKED. The service
    // role bypasses RLS, so this predicate is the only thing standing between a
    // wrong id and someone else's row. It costs nothing and it cannot be the
    // line that was forgotten.
    const { error: linkError } = await admin
      .from("library_sources")
      .update({ content_hash: input.contentHash, parsed_document_id: data })
      .eq("id", input.sourceId)
      .eq("user_id", input.userId);

    if (linkError) {
      console.warn(JSON.stringify({ event: "parse_link_failed", detail: linkError.message }));
      return { ok: true, linked: false, parsedDocumentId: data };
    }
    return { ok: true, linked: true, parsedDocumentId: data };
  } catch (cause) {
    console.warn(JSON.stringify({
      event: "parse_record_failed",
      detail: cause instanceof Error ? cause.message.slice(0, 200) : "unknown",
    }));
    return { ok: false, reason: "unavailable" };
  }
}

/** For the completion log line — how much of the document is behind the record. */
export function recordSummary(coverage: ExtractionCoverage) {
  return { read: unitsRead(coverage), state: coverage.state, units: coverage.units };
}
