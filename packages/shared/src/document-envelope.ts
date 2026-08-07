/**
 * The `parsed_documents.structure` envelope, and the validator that reads it back.
 *
 * 🔴 IT LIVES IN `packages/shared` BECAUSE TWO RUNTIMES READ THESE ROWS. The web
 * app writes them; the Deno indexer (`supabase/functions/source-index`) reads
 * them to build chunks. A second validator on the Deno side would be a second
 * opinion about what a stored model is, and the two would agree exactly until
 * one of them was edited — at which point a row one runtime rejects would be
 * silently accepted, half-typed, by the other.
 */

import type { DocumentModel } from "./document-model.ts";

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
export function readDocumentModel(value: unknown): DocumentModel | null {
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

