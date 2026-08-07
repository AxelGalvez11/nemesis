/**
 * Phase 3 baseline: what the DOCX tag strip throws away, on real files.
 *
 * `docxXmlToText` turns `</w:p>` into a newline and deletes every other tag.
 * So the structure below is present in the file, is read by the extractor, and
 * is discarded before any model, index or citation sees it:
 *
 *   headings     `<w:pStyle w:val="Heading1">` — gone, so a document has no
 *                hierarchy and no locator finer than "the file"
 *   numbering    `<w:numPr>` points into numbering.xml, which is never opened,
 *                so "step 4" is unrecoverable
 *   tables       cells survive as text but each becomes its own orphan line, so
 *                a grid reads confidently WRONG rather than absent
 *   hyperlinks   `<w:hyperlink r:id>` targets live in the rels part
 *   figures      `<w:drawing>` / `<w:object>` are dropped entirely
 *
 * Run from apps/web:
 *   npx tsx scripts/phase3-docx-baseline.mts <dir> [maxFiles]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";

interface Doc {
  name: string;
  paragraphs: number;
  headings: number;
  headingLevels: Set<string>;
  numberedParagraphs: number;
  tables: number;
  tableCells: number;
  hyperlinks: number;
  drawings: number;
  error?: string;
}

function walk(root: string, depth = 0): string[] {
  if (depth > 3) return [];
  let entries: string[] = [];
  try { entries = readdirSync(root); } catch { return []; }
  const out: string[] = [];
  for (const entry of entries) {
    // Word's lock files start with ~$ and are not documents.
    if (entry.startsWith(".") || entry.startsWith("~$")) continue;
    const full = join(root, entry);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) out.push(...walk(full, depth + 1));
    else if (entry.toLowerCase().endsWith(".docx") && s.size < 60 * 1024 * 1024) out.push(full);
  }
  return out;
}

function count(xml: string, re: RegExp): number {
  return (xml.match(re) ?? []).length;
}

const dir = process.argv[2] ?? `${process.env.HOME}/Downloads`;
const max = Number(process.argv[3] ?? "200");
const files = walk(dir).slice(0, max);
const docs: Doc[] = [];

for (const file of files) {
  const name = file.split("/").pop() ?? file;
  const base: Doc = {
    drawings: 0, headingLevels: new Set(), headings: 0, hyperlinks: 0, name,
    numberedParagraphs: 0, paragraphs: 0, tableCells: 0, tables: 0,
  };
  try {
    const zip = unzipSync(new Uint8Array(readFileSync(file)));
    const doc = zip["word/document.xml"];
    if (!doc) { docs.push({ ...base, error: "no word/document.xml" }); continue; }
    const xml = strFromU8(doc);

    base.paragraphs = count(xml, /<w:p[ >]/g);
    for (const m of xml.matchAll(/<w:pStyle\b[^>]*w:val="([^"]*)"/g)) {
      const val = m[1] ?? "";
      if (/^heading/i.test(val) || /^Heading/.test(val)) {
        base.headings += 1;
        base.headingLevels.add(val);
      }
    }
    base.numberedParagraphs = count(xml, /<w:numPr>/g);
    base.tables = count(xml, /<w:tbl>/g);
    base.tableCells = count(xml, /<w:tc>/g);
    base.hyperlinks = count(xml, /<w:hyperlink\b/g);
    base.drawings = count(xml, /<w:drawing>|<w:object>/g);
    docs.push(base);
  } catch (caught) {
    docs.push({ ...base, error: (caught as Error)?.message?.slice(0, 60) ?? "unknown" });
  }
}

const ok = docs.filter((d) => !d.error);
const sum = (pick: (d: Doc) => number) => ok.reduce((t, d) => t + pick(d), 0);
const any = (pick: (d: Doc) => number) => ok.filter((d) => pick(d) > 0).length;

console.log(`\nfiles read            ${ok.length} of ${docs.length}`);
console.log(`paragraphs            ${sum((d) => d.paragraphs)}`);
console.log(`\nSTRUCTURE PRESENT IN THE FILES AND DISCARDED BY THE TAG STRIP`);
console.log(`  headings            ${String(sum((d) => d.headings)).padStart(6)}   in ${any((d) => d.headings)} files`);
console.log(`  numbered paragraphs ${String(sum((d) => d.numberedParagraphs)).padStart(6)}   in ${any((d) => d.numberedParagraphs)} files`);
console.log(`  tables              ${String(sum((d) => d.tables)).padStart(6)}   in ${any((d) => d.tables)} files`);
console.log(`  table cells         ${String(sum((d) => d.tableCells)).padStart(6)}   <- each becomes an orphan line`);
console.log(`  hyperlinks          ${String(sum((d) => d.hyperlinks)).padStart(6)}   in ${any((d) => d.hyperlinks)} files`);
console.log(`  figures             ${String(sum((d) => d.drawings)).padStart(6)}   in ${any((d) => d.drawings)} files`);

const withStructure = ok.filter((d) => d.headings + d.numberedParagraphs + d.tables > 0).length;
console.log(`\n🔴 files losing structure: ${withStructure} of ${ok.length} (${((withStructure / Math.max(ok.length, 1)) * 100).toFixed(0)}%)`);

console.log(`\nworst by table cells:`);
for (const d of [...ok].sort((a, b) => b.tableCells - a.tableCells).slice(0, 8)) {
  if (d.tableCells === 0) break;
  console.log(`  ${String(d.tables).padStart(3)} tables / ${String(d.tableCells).padStart(5)} cells  ${d.name.slice(0, 58)}`);
}
console.log(`\nworst by headings:`);
for (const d of [...ok].sort((a, b) => b.headings - a.headings).slice(0, 5)) {
  if (d.headings === 0) break;
  console.log(`  ${String(d.headings).padStart(4)} headings, ${d.headingLevels.size} distinct levels  ${d.name.slice(0, 50)}`);
}
const failed = docs.filter((d) => d.error);
if (failed.length) console.log(`\nunreadable (${failed.length}): ${failed.slice(0, 4).map((d) => d.name.slice(0, 30)).join(", ")}`);
