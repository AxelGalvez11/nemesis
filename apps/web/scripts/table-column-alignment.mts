/**
 * Does every published column NAME line up with the values under it?
 *
 * 🔴 THE SYMPTOM, NOT THE THEORY. `columns` exists so a consumer can ask "which
 * cell held the date" instead of reading a row as a sentence. If the name list
 * is a different length from the row, every answer to that question is off by
 * however many columns — and the failure is silent, because a shifted name is
 * still a plausible name.
 *
 * Runs the REAL production reader, not a reconstruction of it.
 *
 * Run from apps/web:
 *   npx tsx scripts/table-column-alignment.mts <manifest.jsonl>
 */

import { readFileSync } from "node:fs";

import { readPdfStructure } from "../lib/pdf/structure.ts";

const manifest = process.argv[2];
if (!manifest) {
  console.error("usage: table-column-alignment.mts <manifest.jsonl>");
  process.exit(2);
}

const files: string[] = [];
for (const line of readFileSync(manifest, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const row = JSON.parse(line) as { file: string; accepted?: number };
  if ((row.accepted ?? 1) > 0) files.push(row.file);
}

let tables = 0;
let named = 0;
let mismatched = 0;
let ragged = 0;
const byDelta = new Map<number, number>();
const offenders: { file: string; cols: number; names: number; source: string }[] = [];

for (const file of files) {
  let result: Awaited<ReturnType<typeof readPdfStructure>>;
  try {
    result = await readPdfStructure(new Uint8Array(readFileSync(file)), { detectTables: true });
  } catch {
    continue;
  }
  for (const block of result.model.blocks) {
    if (block.kind !== "table" || !block.table) continue;
    tables += 1;
    const table = block.table;
    const width = table.rows[0]?.length ?? 0;
    // A table whose own rows disagree with each other is a separate defect.
    if (table.rows.some((r) => r.length !== width)) ragged += 1;
    if (!table.columns) continue;
    named += 1;
    if (table.columns.length !== width) {
      mismatched += 1;
      const delta = table.columns.length - width;
      byDelta.set(delta, (byDelta.get(delta) ?? 0) + 1);
      if (offenders.length < 12) {
        offenders.push({
          cols: width,
          file: file.split("/").pop() ?? file,
          names: table.columns.length,
          source: table.headerSource ?? "?",
        });
      }
    }
  }
}

console.log(`\ntables emitted            ${tables}`);
console.log(`  with column names       ${named}`);
console.log(`  NAMES ≠ ROW WIDTH       ${mismatched}   ${mismatched ? "🔴" : "✅"}`);
console.log(`  ragged rows within one  ${ragged}   ${ragged ? "🔴" : "✅"}`);
if (byDelta.size) {
  console.log(`\n  names-minus-width distribution:`);
  for (const [d, n] of [...byDelta].sort((a, b) => a[0] - b[0])) console.log(`    ${d > 0 ? "+" : ""}${d}: ${n}`);
}
if (offenders.length) {
  console.log(`\n  examples (file name only, no content):`);
  for (const o of offenders) console.log(`    ${o.names} names over ${o.cols} columns  [${o.source}]  ${o.file.slice(0, 58)}`);
}
