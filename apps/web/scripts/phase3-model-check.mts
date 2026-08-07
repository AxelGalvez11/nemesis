/**
 * Does the canonical model carry everything the Word structure reader found?
 *
 * The recovery script proved the READER recovers structure. This proves the
 * structure survives the step that used to throw it away — that blocks, markers,
 * heading paths and table cells are all still there after `docxToModel`, and
 * that the text derived from the model loses no words against the text the
 * reader rendered directly.
 *
 * Run from apps/web:
 *   npx tsx scripts/phase3-model-check.mts <dir> [maxFiles]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";

// Straight at the source file, not the package barrel: a `.mts` script is strict
// ESM and cannot take named imports through the workspace package's TS entry.
import {
  countDocument,
  describeLocator,
  documentToText,
  locate,
} from "../../../packages/shared/src/document-model.ts";
import { docxToModel } from "../lib/notebooks/docx-model.ts";
import { readDocxStructure, renderDocx } from "../lib/notebooks/docx-structure.ts";

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
const reader = { cells: 0, headings: 0, listItems: 0, tables: 0 };
const model = { cells: 0, headings: 0, listItems: 0, tables: 0, blocks: 0 };
let markedHeaders = 0, tablesWithHeader = 0, blocksWithPath = 0;
let fabricatedLocators = 0;
const wordLoss: string[] = [];

for (const file of files) {
  const name = file.split("/").pop() ?? file;
  try {
    const zip = unzipSync(new Uint8Array(readFileSync(file)));
    const part = zip["word/document.xml"];
    if (!part) { failed += 1; continue; }
    const numbering = zip["word/numbering.xml"] ? strFromU8(zip["word/numbering.xml"]) : null;
    const structure = readDocxStructure(strFromU8(part), numbering);

    reader.headings += structure.counts.headings;
    reader.listItems += structure.counts.listItems;
    reader.tables += structure.counts.tables;
    reader.cells += structure.counts.tableCells;

    const doc = docxToModel(structure, null);
    const counts = countDocument(doc);
    model.headings += counts.headings;
    model.listItems += counts.listItems;
    model.tables += counts.tables;
    model.cells += counts.tableCells;
    model.blocks += counts.blocks;
    blocksWithPath += doc.blocks.filter((b) => b.headingPath.length > 0).length;

    for (const block of doc.blocks) {
      if (block.kind === "table" && (block.table?.headerRows ?? 0) > 0) {
        tablesWithHeader += 1;
        markedHeaders += block.table?.headerRows ?? 0;
      }
      // 🔴 THE RULE, CHECKED ON EVERY BLOCK OF EVERY REAL FILE, NOT A FIXTURE.
      // A .docx locator that contains a digit is a fabricated one.
      if (/\d/.test(describeLocator(locate(doc, block)).replace(/[^\d›·\s\w]/g, ""))) {
        const line = describeLocator(locate(doc, block));
        // A heading path may legitimately contain a number ("Section 3 Dosing").
        // Only a UNIT number is fabricated, and a body unit prints none — so the
        // check is whether the line starts with a unit phrase at all.
        if (/^(page|slide|sheet)\s+\d+/i.test(line)) fabricatedLocators += 1;
      }
    }

    // Words must not go missing at the model boundary.
    const strip = (s: string) => s.replace(/[^a-z0-9]/gi, "").length;
    const before = strip(renderDocx(structure));
    const after = strip(documentToText(doc));
    if (before > 0 && after < before * 0.99) {
      wordLoss.push(`${name.slice(0, 46)} reader=${before} model=${after} (${((after / before) * 100).toFixed(0)}%)`);
    }
    read += 1;
  } catch {
    failed += 1;
  }
}

const same = (a: number, b: number) => (a === b ? "✅" : "🔴");
console.log(`\nfiles read ${read}, unreadable ${failed}\n`);
console.log(`                     reader     model`);
console.log(`  headings         ${String(reader.headings).padStart(8)}  ${String(model.headings).padStart(8)}  ${same(reader.headings, model.headings)}`);
console.log(`  list items       ${String(reader.listItems).padStart(8)}  ${String(model.listItems).padStart(8)}  ${same(reader.listItems, model.listItems)}`);
console.log(`  tables           ${String(reader.tables).padStart(8)}  ${String(model.tables).padStart(8)}  ${same(reader.tables, model.tables)}`);
console.log(`  table cells      ${String(reader.cells).padStart(8)}  ${String(model.cells).padStart(8)}  ${same(reader.cells, model.cells)}`);
console.log(`\n  blocks in the model            ${model.blocks}`);
console.log(`  blocks knowing their section   ${blocksWithPath}`);
console.log(`  tables Word MARKED a header on ${tablesWithHeader} (${markedHeaders} header rows)`);
console.log(`  tables with NO marked header   ${model.tables - tablesWithHeader}  <- these now draw no separator, rather than promoting a data row`);
console.log(`\n  fabricated unit locators       ${fabricatedLocators}  ${fabricatedLocators === 0 ? "✅ no .docx block claims a page" : "🔴 RULE VIOLATED"}`);

if (wordLoss.length) {
  console.log(`\n🔴 documents that lost words at the model boundary: ${wordLoss.length}`);
  for (const m of wordLoss.slice(0, 10)) console.log(`   ${m}`);
} else {
  console.log(`\n✅ no document lost words: the model's text is >= 99% of the reader's.`);
}

// ── Phase 4: does chunking hold on real documents? ──────────────────────────
// The unit tests prove the rules; this proves them against 124 real files with
// their real tables, headings and lengths.
{
  const { chunkDocument, chunkedText } = await import("../../../packages/shared/src/document-chunks.ts");
  const { documentToText: toText } = await import("../../../packages/shared/src/document-model.ts");
  let chunks = 0, oversized = 0, withSection = 0, lossy = 0, docsChunked = 0, splitTables = 0;
  for (const file of files) {
    try {
      const zip = unzipSync(new Uint8Array(readFileSync(file)));
      const part = zip["word/document.xml"];
      if (!part) continue;
      const numbering = zip["word/numbering.xml"] ? strFromU8(zip["word/numbering.xml"]) : null;
      const doc = docxToModel(readDocxStructure(strFromU8(part), numbering), null);
      const cs = chunkDocument(doc);
      chunks += cs.length;
      oversized += cs.filter((c) => c.oversized).length;
      withSection += cs.filter((c) => c.headingPath.length > 0).length;
      // 🔴 THE LOSS CHECK, ON REAL FILES. A chunker that drops content is the
      // exact failure "never solve capacity by silently deleting" forbids.
      if (chunkedText(cs) !== toText(doc)) lossy += 1;
      // Every table block must land in exactly one chunk, whole.
      const tableIds = new Set(doc.blocks.filter((b) => b.kind === "table").map((b) => b.id));
      for (const id of tableIds) {
        if (cs.filter((c) => c.blockIds.includes(id)).length !== 1) splitTables += 1;
      }
      docsChunked += 1;
    } catch { /* counted above */ }
  }
  console.log(`\n  PHASE 4 chunking over ${docsChunked} real documents:`);
  console.log(`    chunks                  ${chunks}`);
  console.log(`    knowing their section   ${withSection}`);
  console.log(`    oversized (kept whole)  ${oversized}`);
  console.log(`    tables split across chunks ${splitTables}  ${splitTables === 0 ? "✅" : "🔴"}`);
  console.log(`    documents that lost text   ${lossy}  ${lossy === 0 ? "✅ chunking is loss-free" : "🔴"}`);
}
