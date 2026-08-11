/**
 * What the canonical parse now holds for one file: tables, their column names,
 * and where those names came from.
 *
 * Durable diagnostic — this is the command to run when a document's tables look
 * wrong, and the one that shows whether a continuation page inherited its
 * headers or simply lost them.
 *
 * Run from apps/web:
 *   npx tsx scripts/lattice-check.mts <file.pdf> [--rows]
 */

import { readFileSync } from "node:fs";

import { readPdfStructure } from "../lib/pdf/structure.ts";

const path = process.argv[2];
if (!path) { console.error("usage: lattice-check.mts <file.pdf> [--rows]"); process.exit(2); }
const verbose = process.argv.includes("--rows");

const started = Date.now();
const { model, tableRegionsUnread, tablesRejected } = await readPdfStructure(
  new Uint8Array(readFileSync(path)),
  { detectTables: true },
);
const ms = Date.now() - started;

const tables = model.blocks.filter((b) => b.kind === "table" && b.table);
const paragraphs = model.blocks.filter((b) => b.kind === "paragraph");
const headings = model.blocks.filter((b) => b.kind === "heading");

console.log(`\n${"═".repeat(84)}`);
console.log(`${path.split("/").pop()}  —  ${model.units.length} units, ${ms} ms`);
console.log(`${"═".repeat(84)}`);
console.log(`blocks      : ${model.blocks.length}  (${tables.length} table, ${paragraphs.length} paragraph, ${headings.length} heading)`);
console.log(`rejected    : ${Object.keys(tablesRejected).length ? JSON.stringify(tablesRejected) : "none"}`);
console.log(`unread      : ${tableRegionsUnread}`);
console.log(`rects       : ${model.blocks.filter((b) => b.rect).length}/${model.blocks.length}`);

let inherited = 0;
let named = 0;
console.log(`\n${"─".repeat(84)}\ntables`);
for (const block of tables) {
  const t = block.table!;
  if (t.headerSource === "inherited") inherited += 1;
  if (t.columns) named += 1;
  const source = t.headerSource ?? "none";
  const from = t.continuesFromUnit !== undefined ? ` ←unit ${t.continuesFromUnit}` : "";
  console.log(
    `  unit ${String(block.unit).padStart(2)}  ${t.rows.length}r × ${t.rows[0]?.length ?? 0}c  ` +
    `header=${source.padEnd(9)}${from.padEnd(10)} cols=${t.columns ? JSON.stringify(t.columns.map((c) => c.slice(0, 12))) : "—"}`,
  );
  if (verbose) for (const row of t.rows) console.log("      | " + row.map((c) => c.replace(/\s+/g, " ").slice(0, 15).padEnd(15)).join(" | "));
}
console.log(`\ncolumns known for ${named}/${tables.length} tables (${inherited} inherited)`);
process.exit(0);
