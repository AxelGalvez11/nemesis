/**
 * Phase 3 acceptance: does the new structure reader actually recover, on real
 * files, the structure the baseline measured as lost?
 *
 * Compares three things per document:
 *   present    counted straight from the XML (the baseline's method)
 *   recovered  what readDocxStructure produced
 *   oldText    what the tag strip produced, for the size comparison
 *
 * Run from apps/web:
 *   npx tsx scripts/phase3-docx-recovery.mts <dir> [maxFiles]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";

import { readDocxStructure, renderDocx } from "../lib/notebooks/docx-structure.ts";
import { docxXmlToText } from "../lib/notebooks/office-text.ts";

function walk(root: string, depth = 0): string[] {
  if (depth > 3) return [];
  let entries: string[] = [];
  try { entries = readdirSync(root); } catch { return []; }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".") || entry.startsWith("~$")) continue;
    const full = join(root, entry);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) out.push(...walk(full, depth + 1));
    else if (entry.toLowerCase().endsWith(".docx") && s.size < 60 * 1024 * 1024) out.push(full);
  }
  return out;
}

const dir = process.argv[2] ?? `${process.env.HOME}/Downloads`;
const files = walk(dir).slice(0, Number(process.argv[3] ?? "200"));

let read = 0, failed = 0;
const present = { cells: 0, headings: 0, numbered: 0, tables: 0 };
const got = { cells: 0, headings: 0, listItems: 0, tables: 0 };
let markersDrawn = 0, blocksWithHeadingPath = 0, blocks = 0;
const mismatches: string[] = [];

for (const file of files) {
  const name = file.split("/").pop() ?? file;
  try {
    const zip = unzipSync(new Uint8Array(readFileSync(file)));
    const docPart = zip["word/document.xml"];
    if (!docPart) { failed += 1; continue; }
    const xml = strFromU8(docPart);
    const numbering = zip["word/numbering.xml"] ? strFromU8(zip["word/numbering.xml"]) : null;

    present.headings += (xml.match(/<w:pStyle\b[^>]*w:val="[Hh]eading\s*\d"/g) ?? []).length;
    present.numbered += (xml.match(/<w:numPr>/g) ?? []).length;
    present.tables += (xml.match(/<w:tbl>/g) ?? []).length;
    present.cells += (xml.match(/<w:tc>/g) ?? []).length;

    const doc = readDocxStructure(xml, numbering);
    got.headings += doc.counts.headings;
    got.listItems += doc.counts.listItems;
    got.tables += doc.counts.tables;
    got.cells += doc.counts.tableCells;
    blocks += doc.blocks.length;
    markersDrawn += doc.blocks.filter((b) => b.kind === "listItem" && b.marker).length;
    blocksWithHeadingPath += doc.blocks.filter((b) => b.headingPath.length > 0).length;

    // The words must not go missing while the structure is gained.
    //
    // 🔴 The old output is compared with its FIELD CODES REMOVED, because the tag
    // strip swept those into the student's text and the new reader deliberately
    // does not. Verified on the two worst gaps before this exclusion existed:
    // `Medication Error Reporting Form.docx` was "missing" exactly one token,
    // FORMCHECKBOX, thirteen times; `IPT and PKPD Review Session.docx` was
    // missing bookmark ids fused onto words, e.g. "477519233174Formulae".
    // Counting those as lost content would make a real improvement look like a
    // regression — and, worse, would set the bar at reproducing junk.
    //
    // Genuine loss is still caught: this is what found the OMML equations, where
    // `Equations.docx` was silently dropping 72% of its content because the
    // characters live in <m:t>, not <w:t>.
    const FIELD_CODES = /\b(FORMCHECKBOX|FORMTEXT|FORMDROPDOWN|HYPERLINK|PAGEREF|TOC|SEQ|REF|MERGEFIELD)\b|\b\d{9,}\b/g;
    const strip = (s: string) => s.replace(FIELD_CODES, " ").replace(/[^a-z0-9]/gi, "").length;
    const oldChars = strip(docxXmlToText(xml));
    const newChars = strip(renderDocx(doc));
    if (oldChars > 0 && newChars < oldChars * 0.98) {
      mismatches.push(`${name.slice(0, 46)} old=${oldChars} new=${newChars} (${((newChars / oldChars) * 100).toFixed(0)}%)`);
    }
    read += 1;
  } catch {
    failed += 1;
  }
}

const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${((a / b) * 100).toFixed(0)}%`);
console.log(`\nfiles read ${read}, unreadable ${failed}\n`);
console.log(`                    present   recovered   rate`);
console.log(`  headings          ${String(present.headings).padStart(7)}   ${String(got.headings).padStart(9)}   ${pct(got.headings, present.headings)}`);
console.log(`  numbered paras    ${String(present.numbered).padStart(7)}   ${String(got.listItems).padStart(9)}   ${pct(got.listItems, present.numbered)}`);
console.log(`  tables            ${String(present.tables).padStart(7)}   ${String(got.tables).padStart(9)}   ${pct(got.tables, present.tables)}`);
console.log(`  table cells       ${String(present.cells).padStart(7)}   ${String(got.cells).padStart(9)}   ${pct(got.cells, present.cells)}`);
console.log(`\n  blocks produced             ${blocks}`);
console.log(`  list items with a marker    ${markersDrawn}  <- previously 0, the numbers were not in the text`);
console.log(`  blocks knowing their section ${blocksWithHeadingPath}  <- previously 0, there was no hierarchy`);

if (mismatches.length) {
  console.log(`\n🔴 documents that LOST words (structure must not cost content): ${mismatches.length}`);
  for (const m of mismatches.slice(0, 10)) console.log(`   ${m}`);
} else {
  console.log(`\n✅ no document lost words: every file's text is >= 98% of the tag strip's output.`);
}
