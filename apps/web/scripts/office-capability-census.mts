/**
 * What survives the whole chain for Word and PowerPoint — measured, not assumed.
 *
 * 🔴 THE PARSER PASSING IS NOT THE QUESTION. Structure in this codebase has died
 * at a boundary six times: computed and discarded at the client edge three times,
 * `label` and `size` rebuilt away by a unit validator, and four of a calendar
 * ref's six fields dropped by a decoder. Every one of those had a parser that
 * worked. So each capability here is checked AFTER the model has been through
 * `structureEnvelope` and back out through `storedDocumentModel` — the same
 * validator production reads rows with.
 *
 * A capability that is absent is reported as absent. It is NOT reported as
 * "unsupported", because this cannot tell a parser that dropped a footnote from
 * a document that has none — that distinction needs a file known to contain one,
 * which is what the `--expect` pass is for.
 *
 * Prints counts only. No document text: these are the owner's real files.
 *
 * Run from apps/web:
 *   npx tsx scripts/office-capability-census.mts <manifest.jsonl> <docx|pptx>
 */

import { readFileSync } from "node:fs";

import { readStructureEnvelope, structureEnvelope } from "../../../packages/shared/src/document-envelope.ts";
import { documentToText, type DocumentModel } from "../../../packages/shared/src/document-model.ts";
import { extractDocxModel, readPptxSlides } from "../lib/notebooks/office.ts";
import { pptxToModel } from "../lib/notebooks/pptx-model.ts";

const [manifest, want] = process.argv.slice(2);
if (!manifest || (want !== "docx" && want !== "pptx")) {
  console.error("usage: office-capability-census.mts <manifest.jsonl> <docx|pptx>");
  process.exit(2);
}

const files: string[] = [];
for (const line of readFileSync(manifest, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const row = JSON.parse(line) as { file: string; ext: string };
  if (row.ext === want) files.push(row.file);
}

/** Every capability, counted as "files in which at least one survived". */
const survived: Record<string, number> = {};
const bump = (key: string, on: boolean) => {
  survived[key] ??= 0;
  if (on) survived[key] += 1;
};

let parsed = 0;
let failed = 0;
let lostInStorage = 0;

for (const file of files) {
  let model: DocumentModel;
  try {
    const bytes = new Uint8Array(readFileSync(file));
    if (want === "docx") {
      model = extractDocxModel(bytes);
    } else {
      const deck = readPptxSlides(bytes);
      model = pptxToModel(
        {
          deckTitle: deck.deckTitle,
          images: deck.media.images,
          slides: deck.slides,
          slideTitles: deck.slideTitles,
          structure: deck.structure,
        },
        new Map(),
      );
    }
  } catch {
    failed += 1;
    continue;
  }
  parsed += 1;

  // ── THE BOUNDARY. Everything below is measured on the far side of it. ──────
  const stored = JSON.parse(JSON.stringify(structureEnvelope({
    model,
    text: documentToText(model),
    title: model.title,
  })));
  const envelope = readStructureEnvelope(stored);
  const read = envelope?.shape === "units-blocks" ? envelope.model : null;
  if (!read) { lostInStorage += 1; continue; }

  const blocks = read.blocks;
  const tables = blocks.filter((b) => b.kind === "table" && b.table);

  bump("text", documentToText(read).trim().length > 0);
  bump("title", Boolean(read.title));
  bump("units>1", read.units.length > 1);
  bump("unitLabel", read.units.some((u) => Boolean(u.label)));
  bump("unitSize", read.units.some((u) => Boolean(u.size)));
  bump("headings", blocks.some((b) => b.kind === "heading"));
  bump("headingLevels>1", new Set(blocks.filter((b) => b.kind === "heading").map((b) => b.level)).size > 1);
  bump("hierarchy", blocks.some((b) => b.headingPath.length > 0));
  bump("hierarchyDepth>1", blocks.some((b) => b.headingPath.length > 1));
  bump("listItems", blocks.some((b) => b.kind === "listItem"));
  bump("listMarkers", blocks.some((b) => b.kind === "listItem" && Boolean(b.marker)));
  bump("listNesting", blocks.some((b) => b.kind === "listItem" && (b.depth ?? 0) > 0));
  bump("numberedLists", blocks.some((b) => b.kind === "listItem" && /\d/.test(b.marker ?? "")));
  bump("tables", tables.length > 0);
  bump("tableColumns", tables.some((b) => (b.table!.columns?.length ?? 0) > 0));
  bump("tableHeaderRows", tables.some((b) => b.table!.headerRows > 0));
  bump("mergedCells", tables.some((b) => (b.table!.cells ?? []).some((c) => (c.rowSpan ?? 1) > 1 || (c.colSpan ?? 1) > 1)));
  bump("cellModel", tables.some((b) => Boolean(b.table!.cells)));
  bump("figures", blocks.some((b) => b.kind === "figure"));
  bump("figureRefs", blocks.some((b) => b.kind === "figure" && Boolean(b.figure?.ref)));
  bump("captions", blocks.some((b) => b.kind === "caption"));
  bump("equations", blocks.some((b) => b.kind === "equation"));
  bump("notes", blocks.some((b) => b.kind === "note"));
  bump("geometry", blocks.some((b) => Boolean(b.rect)));
}

console.log(`\n${want.toUpperCase()} — ${files.length} files, ${parsed} parsed, ${failed} unreadable, ${lostInStorage} lost at the storage boundary`);
console.log(`(each row: files where the capability survived to the far side of persistence)\n`);
const width = Math.max(...Object.keys(survived).map((k) => k.length));
for (const [key, n] of Object.entries(survived)) {
  const pct = parsed > 0 ? Math.round((n / parsed) * 100) : 0;
  const bar = "█".repeat(Math.round(pct / 4)).padEnd(25);
  console.log(`  ${key.padEnd(width)}  ${String(n).padStart(4)}/${parsed}  ${bar} ${pct}%`);
}
