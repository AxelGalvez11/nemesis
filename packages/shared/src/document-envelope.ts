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
    // 🔴 `label` AND `size` ARE REBUILT, NOT DROPPED — AND DROPPING THEM WAS A LIVE
    // DEFECT, NOT A TIDY OMISSION. This validator rebuilt each unit from `index` and
    // `kind` alone, so every other field died here. `label` is the author's own name
    // for the unit — a slide's title placeholder, a sheet's name — and the Deno
    // indexer reads exactly that field to fill `library_chunks.unit_label`
    // (`source-index/index.ts`), where it would have read `undefined` every time.
    //
    // 🔴 LATENT, NOT ACTIVE, AND THE DIFFERENCE MATTERS WHEN YOU GO LOOKING. No row
    // with a NULL label exists to find, because the envelope bug below meant nothing
    // was ever indexed at all. This defect was MASKED by that one and would have
    // surfaced the moment it was fixed — which is the argument for fixing both in one
    // change rather than discovering the second in production afterwards.
    //
    // `size` is what turns a unit-relative rect into a crop, so losing it silently
    // disables every citation that wanted to point at a region.
    //
    // This is the same failure `readCoverage` documents one file over: a field this
    // reader does not know about is a field that dies between the database and the
    // screen. Anything added to `DocUnit` must be added here too.
    units.push({
      index: u.index,
      kind: u.kind as DocumentModel["units"][number]["kind"],
      ...(typeof u.label === "string" ? { label: u.label } : {}),
      ...(isSize(u.size) ? { size: u.size } : {}),
      // A spreadsheet's hidden sheet. Added here in the SAME change that added it
      // to `DocUnit`, because the whole point of the note above is that the two
      // are one edit — a hidden sheet that read back as visible would put the
      // marking scheme in front of the student.
      ...(u.hidden === true ? { hidden: true } : {}),
    });
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
    // 🔴 THE WHOLE ENTRY, AND THE ASYMMETRY WITH `units` ABOVE IS DELIBERATE — DO NOT
    // "TIDY" THIS BRANCH TO MATCH THAT ONE. A block is checked and then kept intact, so
    // `table`, `figure`, `rect`, `level`, `marker` and `depth` all survive. The unit
    // branch rebuilds from named fields, which is exactly why `label` and `size` used to
    // die there. Making the two consistent in the wrong direction — rebuilding blocks
    // from a field list — would silently drop every table grid and every rectangle the
    // moment someone added a field and forgot this function.
    blocks.push(entry as DocumentModel["blocks"][number]);
  }

  return {
    blocks,
    format: raw.format as DocumentModel["format"],
    title: typeof raw.title === "string" ? raw.title : null,
    units,
  };
}

function isSize(value: unknown): value is { width: number; height: number } {
  if (typeof value !== "object" || value === null) return false;
  const size = value as Record<string, unknown>;
  return typeof size.width === "number" && typeof size.height === "number";
}

/**
 * The model inside a stored `parsed_documents.structure`, whatever shape it is in.
 *
 * 🔴 THE FUNCTION THIS EXISTS TO STOP CALLERS GETTING WRONG. `structure` holds an
 * ENVELOPE — `{ v, shape, title, text, model }` — not a bare model. `readDocumentModel`
 * validates a MODEL, so handing it a whole envelope makes it look for `format` at the top
 * level, fail to find it, and return null. Null then reads as "this parse predates the
 * canonical model", which is a sentence about old data rather than about a bug, so the
 * mistake reports itself as a healthy backlog and nothing ever alerts.
 *
 * That is not hypothetical: `supabase/functions/source-index` called
 * `readDocumentModel(parse.structure)` on exactly this column and therefore skipped EVERY
 * document it was given, so no uploaded source was ever indexed for retrieval.
 *
 * A v1 `text-only` envelope genuinely has no model, and null is the right answer there —
 * that parse really does predate the model. The two cases are indistinguishable at the
 * call site, which is why the check belongs here rather than in each caller.
 */
export function storedDocumentModel(value: unknown): DocumentModel | null {
  const envelope = readStructureEnvelope(value);
  if (envelope) return envelope.shape === "units-blocks" ? envelope.model : null;
  // A bare model, for a caller that already unwrapped the envelope.
  return readDocumentModel(value);
}

/** 🔴 THE RUNTIME HALF OF `DocFormat`, AND IT IS HAND-WRITTEN. A format present
 *  in the type and missing here reads back as `null` for the entire document —
 *  the same silent whole-model loss `BLOCK_KINDS` caused. The every-member
 *  round-trip in the test file is what keeps the two honest. */
const FORMATS = new Set(["pdf", "docx", "pptx", "image", "xlsx", "csv", "text", "other"]);
const UNIT_KINDS = new Set(["page", "slide", "sheet", "body", "image"]);
/**
 * 🔴 THIS LIST IS A BOUNDARY, AND AN UNKNOWN KIND KILLS THE WHOLE MODEL.
 * `readDocumentModel` returns null for the entire document when one block fails
 * here, and null is indistinguishable from "this parse predates the canonical
 * model" — so the failure reports as old data rather than as a fault. That is
 * exactly how three complete Word documents were lost once already.
 *
 * Adding a member to `DocBlockKind` without adding it here is therefore not a
 * missing feature, it is silent data loss. `document-envelope.test.ts` asserts
 * this set and the union agree, so the compiler and a test both object.
 */
const BLOCK_KINDS = new Set([
  "heading",
  "paragraph",
  "listItem",
  "table",
  "figure",
  "caption",
  "equation",
  "note",
  "pageHeader",
  "pageFooter",
]);

