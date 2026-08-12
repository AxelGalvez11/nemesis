/**
 * CSV INGESTION — GATE.
 *
 *   npx tsx scripts/csv-gate.mts          (cwd MUST be apps/web)
 *
 * 🔴 AN INVARIANT, NOT A REMEMBERED SCORE. Nothing here is compared against a
 * baseline that could go stale; every check is decidable from the file in front
 * of it, so it stays meaningful as fixtures are added:
 *
 *   1. every fixture's model survives `readDocumentModel` (or has no cells at all)
 *   2. every cell resolves from its own A1 reference, through the read-back model
 *   3. no cell was invented: the cell count matches what the reader produced
 *   4. a refusal is RECORDED — an ambiguous file must say so, never quietly split
 *
 * Relative imports, because a standalone tsx script cannot resolve
 * `@nemesis/shared`'s named exports.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { readDocumentModel, structureEnvelope } from "../../../packages/shared/src/document-envelope.ts";
import { csvToModel } from "../lib/notebooks/csv-model.ts";
import { readCsv } from "../lib/notebooks/csv-structure.ts";

const dir = process.argv[2] ?? "lib/notebooks/fixtures/csv";

/** `{row, column}` → the reference a person would type. */
function ref(row: number, column: number): string {
  let n = column + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return `${name}${row + 1}`;
}

function parseRef(value: string): { row: number; column: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(value);
  if (!m) return null;
  let column = 0;
  for (const ch of m[1]!) column = column * 26 + (ch.charCodeAt(0) - 64);
  return { column: column - 1, row: Number(m[2]) - 1 };
}

let files = 0;
let cells = 0;
let resolved = 0;
let refusals = 0;
const violations: string[] = [];

for (const file of readdirSync(dir).filter((f) => f.endsWith(".csv")).sort()) {
  files += 1;
  const grid = readCsv(new Uint8Array(readFileSync(join(dir, file))));
  const model = csvToModel(grid);

  if (grid.delimiterEvidence === "ambiguous-not-split") {
    refusals += 1;
    // 4. A refusal must be VISIBLE. Splitting quietly on a guess is the failure
    //    this rule exists to prevent, and silence is how it would look.
    if (!grid.unsupported.some((u) => u.kind === "ambiguous-delimiter")) {
      violations.push(`${file}: refused to split but recorded no reason`);
    }
    if (grid.columns > 1) violations.push(`${file}: refused to split yet produced ${grid.columns} columns`);
  }

  const envelope = JSON.parse(JSON.stringify(structureEnvelope({ model, text: "", title: null })));
  const back = readDocumentModel(envelope.model);

  if (grid.cells.length === 0) {
    // A file with no cells has no table block, so there is nothing to decode.
    if (back && back.blocks.length > 0) violations.push(`${file}: no cells, yet a block survived`);
    continue;
  }

  // 1. The whole model, through the real validator.
  if (!back) {
    violations.push(`${file}: readDocumentModel returned null — the model does not decode`);
    continue;
  }
  const table = back.blocks.find((b) => b.kind === "table")?.table;
  if (!table) {
    violations.push(`${file}: the table block did not survive the boundary`);
    continue;
  }

  // 3. Nothing invented, nothing lost.
  if ((table.cells ?? []).length !== grid.cells.length) {
    violations.push(`${file}: ${grid.cells.length} cells read, ${(table.cells ?? []).length} stored`);
  }

  // 2. Every cell findable by the reference a citation would carry.
  for (const cell of table.cells ?? []) {
    cells += 1;
    const at = parseRef(ref(cell.row, cell.column));
    if (!at) {
      violations.push(`${file}: ${ref(cell.row, cell.column)} is not a reference`);
      continue;
    }
    const found = table.rows[at.row]?.[at.column];
    if (found === cell.text) resolved += 1;
    else violations.push(`${file}: ${ref(cell.row, cell.column)} resolves to ${JSON.stringify(found)} not ${JSON.stringify(cell.text)}`);
  }
}

console.log("═".repeat(74));
console.log("CSV INGESTION — GATE");
console.log("═".repeat(74));
console.log(`  files ${files}   cells ${cells}   delimiter refusals ${refusals}`);
console.log(`  cell references that resolve ${resolved}`);
console.log(`\n  violations ${violations.length}   (must be 0)`);
for (const violation of violations) console.log(`    ${violation}`);
console.log(violations.length === 0 ? "\n✅ GATE PASSED" : "\n❌ GATE FAILED");
process.exit(violations.length === 0 ? 0 : 1);
