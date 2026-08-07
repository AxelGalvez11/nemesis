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

import {
  PARSER_VERSION,
  unitsRead,
  type DocumentModel,
  type ExtractionCoverage,
} from "@nemesis/shared";

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

/**
 * The envelope written into `parsed_documents.structure`.
 *
 * 🔴 THE VERSION IS THE POINT, AND PHASE 2 IS WHY IT EXISTED. A row written by
 * the flat extractor must be distinguishable from one written by the structural
 * reader WITHOUT inspecting its shape and guessing, or every later reader ends
 * up sniffing keys and getting it wrong on some edge.
 *
 * 🔴 AND `text-only` IS NOT THE SAME CLAIM AS "THIS DOCUMENT HAD NO STRUCTURE".
 * It says only that the parse which produced this row could not see any. That
 * distinction is what tells a later pass which rows are worth reparsing.
 */
export type StructureEnvelope =
  | {
      v: 1;
      /** The flat string the older extractor returns: no units, no blocks, no locators. */
      shape: "text-only";
      title: string | null;
      text: string;
    }
  | {
      v: 2;
      /** Units and blocks, with geometry and truthful locators where the format supports them. */
      shape: "units-blocks";
      title: string | null;
      /** Kept alongside the model so a reader that only wants text does not have
       *  to reimplement `documentToText` and risk rendering it differently. */
      text: string;
      model: DocumentModel;
    };

export function structureEnvelope(input: {
  title: string | null;
  text: string;
  model?: DocumentModel;
}): StructureEnvelope {
  if (input.model) {
    return { model: input.model, shape: "units-blocks", text: input.text, title: input.title, v: 2 };
  }
  return { shape: "text-only", text: input.text, title: input.title, v: 1 };
}

/**
 * Read an envelope back off a row, or null when it is not one.
 *
 * 🔴 CHECKED, NOT ASSERTED — for the same reason `readCoverage` is. These rows
 * outlive the parser that wrote them, JSON is not a type system, and a `structure`
 * column that was written by an older version, hand-edited, or restored from a
 * backup must fail to parse rather than arrive as a half-typed object whose
 * missing blocks look like a document with no content.
 */
export function readStructureEnvelope(value: unknown): StructureEnvelope | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const title = typeof raw.title === "string" ? raw.title : null;
  const text = typeof raw.text === "string" ? raw.text : null;
  if (text === null) return null;
  if (raw.v === 1 && raw.shape === "text-only") return { shape: "text-only", text, title, v: 1 };
  if (raw.v !== 2 || raw.shape !== "units-blocks") return null;
  const model = readDocumentModel(raw.model);
  if (!model) return null;
  return { model, shape: "units-blocks", text, title, v: 2 };
}

/** A stored model, validated field by field. Null when anything is off. */
function readDocumentModel(value: unknown): DocumentModel | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (!FORMATS.has(raw.format as string)) return null;
  if (!Array.isArray(raw.units) || !Array.isArray(raw.blocks)) return null;

  const units: DocumentModel["units"] = [];
  for (const entry of raw.units) {
    if (typeof entry !== "object" || entry === null) return null;
    const u = entry as Record<string, unknown>;
    if (typeof u.index !== "number" || !UNIT_KINDS.has(u.kind as string)) return null;
    units.push({ index: u.index, kind: u.kind as DocumentModel["units"][number]["kind"] });
  }

  const blocks: DocumentModel["blocks"] = [];
  for (const entry of raw.blocks) {
    if (typeof entry !== "object" || entry === null) return null;
    const b = entry as Record<string, unknown>;
    if (typeof b.id !== "string" || typeof b.text !== "string") return null;
    if (!BLOCK_KINDS.has(b.kind as string)) return null;
    // 🔴 A BLOCK POINTING AT A UNIT THAT IS NOT THERE IS A BROKEN LOCATOR, and a
    // broken locator is worse than a missing one — every later check of it
    // passes while it points at nothing.
    if (typeof b.unit !== "number" || b.unit < 0 || b.unit >= units.length) return null;
    if (!Array.isArray(b.headingPath) || b.headingPath.some((p) => typeof p !== "string")) return null;
    blocks.push(entry as DocumentModel["blocks"][number]);
  }

  return {
    blocks,
    format: raw.format as DocumentModel["format"],
    title: typeof raw.title === "string" ? raw.title : null,
    units,
  };
}

const FORMATS = new Set(["pdf", "docx", "pptx", "image"]);
const UNIT_KINDS = new Set(["page", "slide", "sheet", "body", "image"]);
const BLOCK_KINDS = new Set([
  "heading",
  "paragraph",
  "listItem",
  "table",
  "figure",
  "caption",
  "equation",
  "note",
]);

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
  /**
   * The structural read, when one was produced.
   *
   * 🔴 THIS IS THE COLUMN THAT DECIDES WHETHER PHASE 2 SURVIVES THE REQUEST.
   * Everything downstream — chat, retrieval, study generation, the reader —
   * loads from `parsed_documents`, so a model computed and not written here is a
   * model that dies with the upload. That is precisely the defect Phase 3 had one
   * layer down, where the Word reader's structure was rendered to a string and
   * discarded at the function boundary.
   */
  model?: DocumentModel;
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
      p_structure: structureEnvelope({
        text: input.text,
        title: input.title,
        ...(input.model ? { model: input.model } : {}),
      }) as unknown as Record<string, unknown>,
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
