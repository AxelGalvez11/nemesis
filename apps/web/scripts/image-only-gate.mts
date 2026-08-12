/**
 * Gate for #486 — no parse may refuse a document and discard its structure.
 *
 * 🔴 IT CHECKS AN INVARIANT, NOT A REMEMBERED SCORE. A gate that compares
 * against a recorded count needs the count regenerated whenever the corpus
 * changes, and a stale baseline is indistinguishable from a pass. The property
 * here is decidable per file, from the file alone:
 *
 *     the structural reader can build blocks   →  the parse must NOT say `empty`
 *     the structural reader builds nothing     →  `empty` is the honest answer
 *
 * Run over the real course corpus AND the benchmark layout set. Both are needed
 * for different reasons: the course corpus is the product requirement, and the
 * benchmark set holds eight image-only documents that the course corpus only has
 * five of.
 *
 *   npx tsx scripts/image-only-gate.mts <corpus.jsonl|dir> [maxFiles]
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { parseDocument } from "../lib/notebooks/parse-document.ts";
import { readPdfStructure } from "../lib/pdf/structure.ts";

const target = process.argv[2]!;
const limit = Number(process.argv[3] ?? 9999);

function filesFrom(path: string): string[] {
  if (statSync(path).isDirectory()) {
    return readdirSync(path).filter((f) => f.toLowerCase().endsWith(".pdf")).map((f) => join(path, f));
  }
  return readFileSync(path, "utf8")
    .split("\n").filter(Boolean)
    .map((line) => (JSON.parse(line) as { file: string }).file);
}

const files = filesFrom(target).slice(0, limit);

let read = 0;          // produced text — untouched by this change
let carried = 0;       // no text, structure kept
let empty = 0;         // no text, nothing to keep
let crashed = 0;
let unitsKept = 0, blocksKept = 0, figuresKept = 0;
const violations: string[] = [];

for (const file of files) {
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(readFileSync(file)); } catch { continue; }

  let outcome;
  try {
    outcome = await parseDocument(bytes, file.split("/").pop()!, "application/pdf");
  } catch { crashed += 1; continue; }

  if (outcome.ok) { read += 1; continue; }

  if (outcome.reason === "no-text") {
    carried += 1;
    const model = outcome.document.model;
    unitsKept += model?.units.length ?? 0;
    blocksKept += model?.blocks.length ?? 0;
    figuresKept += outcome.document.coverage.figures.found;
    // A carried refusal that carries nothing is the defect wearing the fix's name.
    if (!model || model.blocks.length === 0) violations.push(`CARRIED NOTHING: ${file.split("/").pop()}`);
    continue;
  }

  if (outcome.reason !== "empty") continue;
  empty += 1;
  // 🔴 THE ONE THAT MATTERS. `empty` is a claim that there was nothing to keep.
  // Ask the structural reader directly whether that claim is true.
  try {
    const again = await readPdfStructure(new Uint8Array(readFileSync(file)), { detectTables: true });
    if (again.model.blocks.length > 0) {
      violations.push(
        `DISCARDED STRUCTURE: ${file.split("/").pop()} — ${again.model.units.length} units, ${again.model.blocks.length} blocks`,
      );
    }
  } catch { /* the structural reader cannot open it either — `empty` is right */ }
}

console.log(`\n${"═".repeat(74)}`);
console.log("IMAGE-ONLY STRUCTURE — GATE (#486)");
console.log(`${"═".repeat(74)}`);
console.log(`  files ${files.length}   crashes ${crashed}\n`);
console.log(`  produced text                       ${String(read).padStart(5)}`);
console.log(`  no text, STRUCTURE KEPT (no-text)   ${String(carried).padStart(5)}   ${unitsKept} units, ${blocksKept} blocks, ${figuresKept} figures`);
console.log(`  no text, nothing to keep (empty)    ${String(empty).padStart(5)}`);
console.log(`\n  structure discarded by a refusal    ${String(violations.length).padStart(5)}   (must be 0)`);
for (const v of violations.slice(0, 10)) console.log(`      🔴 ${v}`);

const ok = violations.length === 0 && crashed === 0;
console.log(`\n${ok ? "✅ GATE PASSED" : "🔴 GATE FAILED"}`);
process.exit(ok ? 0 : 1);
