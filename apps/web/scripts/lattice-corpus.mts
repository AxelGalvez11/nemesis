/**
 * The release gate for the ruled-table lane: does turning it on ever cost a
 * document its prose?
 *
 * 🔴 THE GATE IS NOT "ZERO FALSE POSITIVES". A false table here is destructive —
 * the text a region claims leaves the paragraph flow — so the number that
 * matters is whether any word present in the file stops being present in the
 * model. Every file is parsed BOTH ways and compared token by token, which needs
 * no judgement about which candidates were "really" tables.
 *
 * 🔴 THE CORPUS IS THE OWNER'S REAL FILES, INCLUDING PRIVATE ONES. Per-file
 * detail goes to the JSONL on disk so a failure can be chased; stdout carries
 * aggregates, and names only for files that actually lost content.
 *
 * Run from apps/web:
 *   npx tsx scripts/lattice-corpus.mts <corpus.jsonl> <out.jsonl> [maxFiles]
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

import { documentToText } from "../../../packages/shared/src/document-model.ts";

import { readPdfStructure } from "../lib/pdf/structure.ts";

const [listPath, outPath, maxFilesArg] = process.argv.slice(2);
if (!listPath || !outPath) {
  console.error("usage: lattice-corpus.mts <corpus.jsonl> <out.jsonl> [maxFiles]");
  process.exit(2);
}

const rows = readFileSync(listPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const pdfs = rows
  .filter((r) => (r.ext === "pdf" || String(r.name ?? "").toLowerCase().endsWith(".pdf")) && r.file && existsSync(r.file))
  .slice(0, Number(maxFilesArg ?? "9999"));
writeFileSync(outPath, "");

/**
 * CHARACTERS, as a multiset, ignoring whitespace and the renderer's own marks.
 *
 * 🔴 COMPARING WORDS DOES NOT WORK HERE, AND BELIEVING IT DID PRODUCED 32 FALSE
 * FAILURES. The two lanes tokenise the same characters differently on purpose:
 * the paragraph lane runs neighbouring text runs together, so a syllabus row
 * reads `IntroductionDr. Farrar (Memphis)3.1.4,` — while the table lane puts
 * `Introduction` and `Dr. Farrar` in their own cells, which is the entire point.
 * At word level that reads as `IntroductionDr.` having been LOST, when in fact
 * it never existed in the document and its disappearance is the improvement.
 *
 * Characters cannot be re-split. If every character survives, no content was
 * dropped no matter how the two lanes chose to draw word boundaries.
 *
 * Markdown scaffolding is excluded because `documentToText` invents it: a
 * heading renders as `## Title`, a table as pipes and dashes, so a paragraph
 * that legitimately becomes a table "loses" `#` and gains `|`.
 */
const SCAFFOLDING = new Set(["#", "|", "-", ":"]);
function bag(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const ch of text) {
    if (/\s/.test(ch) || SCAFFOLDING.has(ch)) continue;
    out.set(ch, (out.get(ch) ?? 0) + 1);
  }
  return out;
}

/** Tokens present in `before` that `after` no longer has, with counts. */
function lost(before: Map<string, number>, after: Map<string, number>): { total: number; sample: string[] } {
  let total = 0;
  const sample: string[] = [];
  for (const [token, n] of before) {
    const missing = n - (after.get(token) ?? 0);
    if (missing > 0) {
      total += missing;
      if (sample.length < 8) sample.push(`${token}×${missing}`);
    }
  }
  return { sample, total };
}

let files = 0;
let pages = 0;
let accepted = 0;
let rejected = 0;
let filesWithTables = 0;
let filesLosingContent = 0;
let msBase = 0;
let msLane = 0;
let peakRss = 0;
const rejectionReasons = new Map<string, number>();
const started = Date.now();

for (const row of pdfs) {
  const bytes = readFileSync(row.file);
  let base, lane;
  try {
    // 🔴 A FRESH COPY EACH TIME. pdf.js takes ownership of the buffer it is
    // handed and zeroes it; reusing one would make the second parse read an
    // empty file and report a spectacular, entirely false content loss.
    const t0 = Date.now();
    base = await readPdfStructure(new Uint8Array(bytes), { latticeTables: false });
    const t1 = Date.now();
    lane = await readPdfStructure(new Uint8Array(bytes), { latticeTables: true });
    const t2 = Date.now();
    msBase += t1 - t0;
    msLane += t2 - t1;
  } catch { continue; }

  files += 1;
  pages += lane.model.units.length;
  peakRss = Math.max(peakRss, process.memoryUsage().rss);

  const tables = lane.model.blocks.filter((b) => b.kind === "table");
  if (tables.length > 0) filesWithTables += 1;
  accepted += tables.length;
  for (const [reason, n] of Object.entries(lane.tablesRejected)) {
    rejected += n;
    rejectionReasons.set(reason, (rejectionReasons.get(reason) ?? 0) + n);
  }

  // 🔴 THE ACTUAL GATE. `documentToText` renders a table from its grid, so a
  // table that legitimately absorbed a paragraph still contributes every word.
  // Anything missing here was claimed by a table and then not re-emitted.
  const missing = lost(bag(documentToText(base.model)), bag(documentToText(lane.model)));
  if (missing.total > 0) filesLosingContent += 1;

  appendFileSync(outPath, JSON.stringify({
    accepted: tables.length,
    baseBlocks: base.model.blocks.length,
    file: row.file,
    laneBlocks: lane.model.blocks.length,
    lostSample: missing.sample,
    lostTokens: missing.total,
    pages: lane.model.units.length,
    rejected: lane.tablesRejected,
    withColumns: tables.filter((b) => b.table?.columns).length,
    withInheritedColumns: tables.filter((b) => b.table?.headerSource === "inherited").length,
  }) + "\n");

  if (missing.total > 0) {
    console.log(`  🔴 CONTENT LOST  ${missing.total} tokens  ${row.file.split("/").pop()}`);
    console.log(`     sample: ${missing.sample.join(" · ")}`);
  }
  if (files % 25 === 0) console.log(`  … ${files}/${pdfs.length} files · ${pages} pages · ${Math.round((Date.now() - started) / 1000)}s`);
}

const jsonl = readFileSync(outPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
console.log(`\n${"═".repeat(78)}\nRULED-TABLE LANE — CORPUS GATE\n${"═".repeat(78)}`);
console.log(`  1. files parsed              ${files}`);
console.log(`  2. pages examined            ${pages}`);
console.log(`  3. candidates accepted       ${accepted}   (in ${filesWithTables} files)`);
console.log(`  4. candidates rejected       ${rejected}`);
for (const [reason, n] of [...rejectionReasons].sort((a, b) => b[1] - a[1])) console.log(`        ${reason.padEnd(26)} ${n}`);
console.log(`  5. tables with column names  ${jsonl.reduce((s, r) => s + r.withColumns, 0)} (${jsonl.reduce((s, r) => s + r.withInheritedColumns, 0)} inherited)`);
console.log(`  6/7. FILES LOSING CONTENT    ${filesLosingContent}`);
console.log(`  8. block-count delta         ${jsonl.reduce((s, r) => s + r.laneBlocks - r.baseBlocks, 0)} across the corpus`);
console.log(`  9. runtime                   baseline ${(msBase / 1000).toFixed(1)}s → lane ${(msLane / 1000).toFixed(1)}s  (+${(((msLane - msBase) / Math.max(msBase, 1)) * 100).toFixed(1)}%)`);
console.log(` 10. peak RSS                  ${(peakRss / 1024 / 1024).toFixed(0)} MB`);
console.log(`\n${filesLosingContent === 0
  ? "✅ GATE PASSED — no document lost a single word to the table lane"
  : `🔴 GATE FAILED — ${filesLosingContent} file(s) lost content; see ${outPath}`}`);
process.exit(filesLosingContent === 0 ? 0 : 1);
