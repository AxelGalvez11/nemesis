/**
 * Corpus gate for running-furniture classification.
 *
 * Two questions, both of which must be answered on real documents:
 *
 *   1. WHAT DOES IT CATCH? Counting detections alone proves nothing — a rule
 *      that fires constantly looks productive and is destroying the document.
 *      So every distinct classified string is printed, to be read.
 *
 *   2. 🔴 WHAT DOES IT COST? Furniture leaves the chunk stream, so this reports
 *      exactly which characters stopped being retrievable. Nothing leaves the
 *      MODEL — the gate asserts that too.
 *
 * Run from apps/web:
 *   npx tsx scripts/furniture-gate.mts <corpus.jsonl> [maxFiles]
 */

import { readFileSync } from "node:fs";

import { chunkDocument } from "../../../packages/shared/src/document-chunks.ts";
import { documentFurniture, findFurniture } from "../../../packages/shared/src/document-furniture.ts";
import type { DocumentModel } from "../../../packages/shared/src/document-model.ts";

import { readPdfStructure } from "../lib/pdf/structure.ts";

const [listPath, maxArg] = process.argv.slice(2);
if (!listPath) {
  console.error("usage: furniture-gate.mts <corpus.jsonl> [maxFiles]");
  process.exit(2);
}

const files = readFileSync(listPath, "utf8")
  .split("\n").filter(Boolean)
  .map((l) => (JSON.parse(l) as { file: string }).file)
  .slice(0, maxArg ? Number(maxArg) : undefined);

let docs = 0;
let multipage = 0;
let withFurniture = 0;
let headers = 0;
let footers = 0;
let blocksBefore = 0;
let blocksAfter = 0;
let modelShrank = 0;
const strings = new Map<string, number>();

for (const file of files) {
  let model: DocumentModel | undefined;
  try { ({ model } = await readPdfStructure(new Uint8Array(readFileSync(file)))); } catch { continue; }
  if (!model) continue;
  docs += 1;
  if (model.units.length >= 3) multipage += 1;

  const before = model.blocks.length;
  const found = findFurniture(model);
  // 🔴 CLASSIFICATION MUST NOT MUTATE THE MODEL.
  if (model.blocks.length !== before) modelShrank += 1;

  if (found.size > 0) {
    withFurniture += 1;
    for (const { block, where } of documentFurniture(model)) {
      if (where === "pageHeader") headers += 1;
      else footers += 1;
      const key = `${where === "pageHeader" ? "H" : "F"}  ${block.text.trim().replace(/\s+/g, " ").slice(0, 62)}`;
      strings.set(key, (strings.get(key) ?? 0) + 1);
    }
  }

  blocksBefore += model.blocks.filter((b) => b.text.trim()).length;
  blocksAfter += chunkDocument(model).reduce((n, c) => n + c.blockIds.length, 0);
}

console.log(`\n${"═".repeat(74)}`);
console.log("RUNNING FURNITURE — CORPUS GATE");
console.log(`${"═".repeat(74)}`);
console.log(`  documents parsed              ${docs}   (multi-page: ${multipage})`);
console.log(`  documents with furniture      ${withFurniture}  (${((100 * withFurniture) / Math.max(multipage, 1)).toFixed(1)}% of multi-page)`);
console.log(`  header blocks / footer blocks ${headers} / ${footers}`);
console.log(`  blocks with text              ${blocksBefore}`);
console.log(`  blocks reaching chunks        ${blocksAfter}   (${(100 * (blocksBefore - blocksAfter) / Math.max(blocksBefore, 1)).toFixed(2)}% withheld)`);
console.log(`  🔴 documents whose MODEL shrank ${modelShrank}   (must be 0 — classify never deletes)`);

console.log(`\n  every distinct string classified, most frequent first — READ THESE:`);
for (const [s, n] of [...strings].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(`    ${String(n).padStart(4)}×  ${s}`);
}
process.exit(modelShrank === 0 ? 0 : 1);
