/**
 * Given a page with NO text layer, does the parser say so — or does it return an
 * empty structure that reads downstream as "this document is blank"?
 *
 * 🔴 THIS IS A SAFETY CHECK, NOT A BENCHMARK SCORE. The pages come from
 * OmniDocBench, which ships page images and no PDFs, so its real metrics cannot
 * be computed against a parser that reads native text and vector rulings. What
 * these pages CAN establish is the refusal behaviour: an empty answer and an
 * unreadable page must not be the same fact, because a document silently
 * reported as complete-and-empty is the exact silent degradation this project
 * keeps paying for.
 *
 * Run from apps/web:
 *   npx tsx scripts/bench-refusal.mts <pdf-dir> <manifest.jsonl> <out.jsonl>
 */

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { pageTextLength, THIN_PAGE_CHARS } from "../lib/pdf/pages.ts";
import { readPdfStructure } from "../lib/pdf/structure.ts";

const [pdfDir, manifestPath, outPath] = process.argv.slice(2);
if (!pdfDir || !manifestPath || !outPath) {
  console.error("usage: bench-refusal.mts <pdf-dir> <manifest.jsonl> <out.jsonl>");
  process.exit(2);
}

// 🔴 RESOLVED AGAINST THE MANIFEST, NOT THE WORKING DIRECTORY. The manifest stores
// relative paths; running from apps/web made every open fail with ENOENT, and the first
// version counted each failure as "the parser claimed text" — reporting 0/50 refusals,
// a harness bug wearing the costume of a parser defect. Twice in one session.
const manifestDir = dirname(resolve(manifestPath));
const manifest = readFileSync(manifestPath, "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .filter((m: { file?: string }) => m.file);

writeFileSync(outPath, "");
const bySource = new Map<string, { total: number; refused: number; claimedText: number; crashed: number }>();

for (const entry of manifest as { file: string; source: string; layout: string; image: string }[]) {
  const record: Record<string, unknown> = { image: entry.image, layout: entry.layout, source: entry.source };
  try {
    const path = isAbsolute(entry.file) ? entry.file : resolve(manifestDir, "..", entry.file);
    const { model, declaredUnits } = await readPdfStructure(new Uint8Array(readFileSync(path)));
    const chars = model.blocks.reduce((sum, b) => sum + b.text.length, 0);
    record.units = model.units.length;
    record.declaredUnits = declaredUnits;
    record.blocks = model.blocks.length;
    record.chars = chars;
    // The page carries text or it does not. `THIN_PAGE_CHARS` is the threshold the
    // reader already uses to call a page unreadable-by-text.
    record.thin = chars < THIN_PAGE_CHARS;
    record.correctlyRefused = chars < THIN_PAGE_CHARS;
  } catch (cause) {
    record.error = String(cause).slice(0, 120);
    // 🔴 A CRASH IS ITS OWN OUTCOME. It is not a refusal, and it is not "the parser
    // claimed text either" — folding it into the latter is what hid the path bug above.
    record.crashed = true;
    record.correctlyRefused = false;
  }
  appendFileSync(outPath, JSON.stringify(record) + "\n");

  const bucket = bySource.get(entry.source) ?? { claimedText: 0, crashed: 0, refused: 0, total: 0 };
  bucket.total += 1;
  if (record.crashed) bucket.crashed += 1;
  else if (record.correctlyRefused) bucket.refused += 1;
  else bucket.claimedText += 1;
  bySource.set(entry.source, bucket);
}

console.log(`\n${"═".repeat(72)}`);
console.log(`REFUSAL CORRECTNESS on pages with no text layer  (NOT an OmniDocBench score)`);
console.log(`${"═".repeat(72)}`);
let total = 0;
let refused = 0;
for (const [source, b] of [...bySource].sort()) {
  total += b.total;
  refused += b.refused;
  console.log(`  ${source.padEnd(22)} ${b.refused}/${b.total} correctly reported as carrying no text` +
    (b.claimedText ? `   🔴 ${b.claimedText} claimed text` : "") +
    (b.crashed ? `   🔴 ${b.crashed} CRASHED` : ""));
}
console.log(`\n  overall ${refused}/${total}`);
const crashed = [...bySource.values()].reduce((n, b) => n + b.crashed, 0);
console.log(refused === total
  ? "  ✅ every image-only page was reported as carrying no readable text"
  : `  🔴 ${total - refused - crashed} claimed text, ${crashed} crashed`);
process.exit(0);
