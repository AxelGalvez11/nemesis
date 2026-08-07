/**
 * Phase 2 acceptance: does the structural reader see what production cannot,
 * without losing what production already gets?
 *
 * Three questions, all against the same real corpus the baseline used:
 *
 *   1. FIGURES   Are the 1,807 figures on text-rich pages now present as blocks,
 *                and are the ones nobody examined COUNTABLE rather than silent?
 *   2. TEXT      Does the structural read lose words against `unpdf`, which is
 *                what production ships today? A richer representation that drops
 *                content is a regression whatever else it gains.
 *   3. LAYOUT    How many pages read as two columns, and does anything absurd
 *                come out — a page claiming a column split on a form, say.
 *
 * Run from apps/web:
 *   npx tsx scripts/phase2-structure-check.mts <dir> [maxFiles]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { countDocument, documentToText, describeLocator, locate } from "../../../packages/shared/src/document-model.ts";
import { readPdfStructure } from "../lib/pdf/structure.ts";
import { extractPdfText } from "../lib/pdf/extract.ts";

function walk(root: string, depth = 0): string[] {
  if (depth > 3) return [];
  let entries: string[] = [];
  try { entries = readdirSync(root); } catch { return []; }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = join(root, entry);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) out.push(...walk(full, depth + 1));
    else if (entry.toLowerCase().endsWith(".pdf") && s.size < 60 * 1024 * 1024) out.push(full);
  }
  return out;
}

const dir = process.argv[2] ?? `${process.env.HOME}/Downloads`;
const files = walk(dir).slice(0, Number(process.argv[3] ?? "200"));

let read = 0, failed = 0;
let pages = 0, blocks = 0, headings = 0, paragraphs = 0;
let figures = 0, unexamined = 0, decorative = 0, tooSmall = 0;
let filesWithFigures = 0;
let twoColumnPages = 0;
let wrongUnitNoun = 0, rectsOutOfRange = 0;
const wordLoss: string[] = [];
const slowest: { name: string; ms: number }[] = [];

for (const file of files) {
  const name = file.split("/").pop() ?? file;
  try {
    const bytes = new Uint8Array(readFileSync(file));
    const started = process.hrtime.bigint();
    // 🔴 A COPY EACH. pdf.js detaches the buffer it is handed, so the second
    // reader would otherwise be measured against zeroes and report a total loss.
    const { model } = await readPdfStructure(new Uint8Array(bytes));
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const legacy = await extractPdfText(new Uint8Array(bytes));

    const counts = countDocument(model);
    pages += counts.units;
    blocks += counts.blocks;
    headings += counts.headings;
    paragraphs += counts.paragraphs;
    figures += counts.figures;
    unexamined += counts.figuresUnexamined;
    if (counts.figures > 0) filesWithFigures += 1;
    for (const block of model.blocks) {
      if (block.figure?.skipped === "decorative") decorative += 1;
      if (block.figure?.skipped === "too-small") tooSmall += 1;
      // A PDF block MUST say page — this is the mirror of the .docx check.
      const line = describeLocator(locate(model, block));
      if (!/^page \d+/.test(line)) wrongUnitNoun += 1;
      const r = block.rect;
      if (r && (r.x < 0 || r.y < 0 || r.x + r.width > 1.0001 || r.y + r.height > 1.0001)) rectsOutOfRange += 1;
    }

    // 🔴 MEASURED AT THE BLOCK LEVEL, NOT BY RE-RUNNING `columnSplit`.
    // Reconstructing line items from paragraph rectangles and feeding them back
    // through the line grouper measures the script's reconstruction, not the
    // reader — an earlier version did exactly that and reported zero columns
    // everywhere, which looked like a result and was an artefact. What is
    // genuinely observable from the finished model is whether a page's
    // paragraphs fall into two disjoint horizontal bands.
    for (const unit of model.units) {
      const rects = model.blocks
        .filter((b) => b.unit === unit.index && b.kind !== "figure" && b.rect && b.text.length > 1)
        .map((b) => b.rect!);
      if (rects.length < 4) continue;
      const split = 0.5;
      const left = rects.filter((r) => r.x + r.width <= split);
      const rightSide = rects.filter((r) => r.x > split);
      if (left.length >= 2 && rightSide.length >= 2 && left.length + rightSide.length === rects.length) {
        twoColumnPages += 1;
      }
    }

    const strip = (s: string) => s.replace(/[^a-z0-9]/gi, "").length;
    const before = strip(legacy.pageTexts.join("\n"));
    const after = strip(documentToText(model));
    if (before > 500 && after < before * 0.97) {
      wordLoss.push(`${name.slice(0, 44)} unpdf=${before} structure=${after} (${((after / before) * 100).toFixed(0)}%)`);
    }
    slowest.push({ ms, name });
    read += 1;
  } catch (cause) {
    failed += 1;
    if (failed <= 5) console.log(`  unreadable: ${name.slice(0, 50)} — ${(cause as Error).message.slice(0, 90)}`);
  }
}

slowest.sort((a, b) => b.ms - a.ms);
console.log(`\nfiles read ${read}, unreadable ${failed}, pages ${pages}\n`);
console.log(`  blocks                ${blocks}  (${headings} headings, ${paragraphs} paragraphs, ${figures} figures)`);
console.log(`  files carrying figures ${filesWithFigures} of ${read}`);
console.log(`\n  FIGURES, now visible where production sees nothing:`);
console.log(`    total found         ${figures}`);
console.log(`    running art skipped ${decorative}   <- repeats on >=50% of pages`);
console.log(`    too small skipped   ${tooSmall}   <- under 1% of the page`);
console.log(`    UNEXAMINED          ${unexamined}   <- the honest gap: no description, no stated reason`);
console.log(`\n  LAYOUT:`);
console.log(`    pages read as two columns  ${twoColumnPages} of ${pages}`);
console.log(`\n  RULES:`);
console.log(`    locators not saying page   ${wrongUnitNoun}  ${wrongUnitNoun === 0 ? "✅" : "🔴 a PDF block must carry a page"}`);
console.log(`    rects outside 0..1         ${rectsOutOfRange}  ${rectsOutOfRange === 0 ? "✅" : "🔴"}`);
console.log(`\n  slowest: ${slowest.slice(0, 3).map((s) => `${s.name.slice(0, 32)} ${s.ms.toFixed(0)}ms`).join(", ")}`);

if (wordLoss.length) {
  console.log(`\n🔴 documents whose text shrank against unpdf: ${wordLoss.length}`);
  for (const m of wordLoss.slice(0, 12)) console.log(`   ${m}`);
} else {
  console.log(`\n✅ no document lost words against unpdf.`);
}
