/**
 * Dump the first N blocks our parser produces for any supported file.
 *
 * A general "what did we actually get" probe, used to check specific claims by
 * looking at real output rather than reasoning about the code. It is how the
 * DOCX equation claim was settled: Docling renders OMML as LaTeX, and the
 * question was what we render it as.
 *
 * Run from apps/web:
 *   npx tsx scripts/bakeoff-dump.mts <file> [kindFilter] [limit]
 */
import { readFileSync } from "node:fs";

import { parseDocument } from "../lib/notebooks/parse-document.ts";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const file = process.argv[2];
const kindFilter = process.argv[3] ?? "";
const limit = Number(process.argv[4] ?? "12");
if (!file) throw new Error("usage: bakeoff-dump.mts <file> [kindFilter] [limit]");

const name = file.split("/").pop() ?? file;
const ext = (name.split(".").pop() ?? "").toLowerCase();
const outcome = await parseDocument(
  new Uint8Array(readFileSync(file)),
  name,
  MIME[ext] ?? "application/octet-stream",
  { lookAtFigures: false },
);
if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
const model = outcome.document.model;
if (!model) throw new Error("no structural model — this format has no canonical lane");

const kinds = model.blocks.reduce<Record<string, number>>((acc, b) => {
  acc[b.kind] = (acc[b.kind] ?? 0) + 1;
  return acc;
}, {});
console.log(`${name}: ${model.units.length} units, ${model.blocks.length} blocks`);
console.log(`  kinds: ${JSON.stringify(kinds)}`);

const shown = kindFilter ? model.blocks.filter((b) => b.kind === kindFilter) : model.blocks;
console.log(`  showing ${Math.min(limit, shown.length)} of ${shown.length}${kindFilter ? ` "${kindFilter}"` : ""}:`);
for (const b of shown.slice(0, limit)) {
  console.log(`    [${b.kind.padEnd(9)}] ${JSON.stringify(b.text.replace(/\s+/g, " ").slice(0, 88))}`);
}
