/**
 * Reading order on a two-column page, shown rather than scored.
 *
 * 25% of the corpus PDFs (39 of 155) are two-column, and reading order is the
 * dimension that cannot be scored without labels: there is no ground-truth
 * ordering to diff against. What CAN be done is to print both parsers' first
 * blocks for one page and look at whether the sentences continue.
 *
 * The failure this exposes is column interleave: a parser that reads across the
 * gutter produces text that alternates between two unrelated sentences, which is
 * obvious to a person and invisible to a character count.
 *
 * Run from apps/web:
 *   npx tsx scripts/bakeoff-order-spotcheck.mts <file.pdf> [unit]
 */
import { readFileSync } from "node:fs";

import { parseDocument } from "../lib/notebooks/parse-document.ts";

const file = process.argv[2];
const unit = Number(process.argv[3] ?? "0");
if (!file) throw new Error("usage: bakeoff-order-spotcheck.mts <file.pdf> [unit]");

const bytes = new Uint8Array(readFileSync(file));
const outcome = await parseDocument(bytes, file.split("/").pop() ?? "f.pdf", "application/pdf", {
  lookAtFigures: false,
});
if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
const model = outcome.document.model;
if (!model) throw new Error("no structural model");

const onUnit = model.blocks.filter((b) => b.unit === unit);
console.log(`NEMESIS — unit ${unit}, ${onUnit.length} blocks (reading order as produced):\n`);
for (const b of onUnit.slice(0, 12)) {
  const x = b.rect ? `x=${(b.rect.x * 100).toFixed(0)}%` : "x=?";
  console.log(`  [${b.kind.padEnd(9)} ${x.padEnd(7)}] ${b.text.replace(/\s+/g, " ").slice(0, 96)}`);
}
