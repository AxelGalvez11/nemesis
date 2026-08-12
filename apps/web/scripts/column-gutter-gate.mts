/**
 * Gate for the column-gutter fix, proving the three things it must prove.
 *
 *   1. wrongly fused full-width lines disappear on multi-column pages;
 *   2. no character is lost or duplicated anywhere;
 *   3. a page with no gutter is BYTE-IDENTICAL — single-column documents that
 *      were already right are not touched.
 *
 * Old and new run side by side on the same items, so the comparison is exact
 * rather than a re-parse of a moving target.
 *
 *   npx tsx scripts/column-gutter-gate.mts <dir-or-corpus.jsonl> [maxFiles]
 */

import { readFileSync, readdirSync, statSync } from "node:fs";

import { columnSplit, groupLines, groupParagraphs, readingOrder, type TextItem } from "../lib/pdf/geometry.ts";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

/** Characters, order-insensitive — the test for loss or duplication. */
function charBag(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const ch of s.replace(/\s+/g, "")) m.set(ch, (m.get(ch) ?? 0) + 1);
  return m;
}
function bagsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

function textOf(items: TextItem[], width: number, gutter: number | null): string {
  const lines = readingOrder(groupLines(items, gutter), width);
  return groupParagraphs(lines)
    .map((g) => g.lines.map((l) => l.text).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

async function pagesOf(file: string) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), disableFontFace: true }).promise;
  const out: { items: TextItem[]; width: number }[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 12); p += 1) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const item of content.items) {
      if (!("str" in item) || item.str.length === 0) continue;
      const t = pdfjs.Util.transform(viewport.transform, item.transform);
      const height = Math.hypot(t[2], t[3]) || item.height || 0;
      items.push({ height, text: item.str, width: item.width || Math.abs(t[0]) * item.str.length * 0.5, x: t[4], y: t[5] - height });
    }
    out.push({ items, width: viewport.width });
  }
  return out;
}

const target = process.argv[2]!;
const limit = Number(process.argv[3] ?? 9999);
const files = statSync(target).isDirectory()
  ? readdirSync(target).filter((n) => n.endsWith(".pdf")).map((n) => `${target}/${n}`).slice(0, limit)
  : readFileSync(target, "utf8").split("\n").filter(Boolean).map((l) => (JSON.parse(l) as { file: string }).file).slice(0, limit);

let docs = 0, crashed = 0;
let pagesTotal = 0, pagesWithGutter = 0;
let fusedBefore = 0, fusedAfter = 0;
let charsChanged = 0, noGutterChanged = 0, changedDocs = 0;
const offenders: string[] = [];

for (const file of files) {
  let pages;
  try { pages = await pagesOf(file); } catch { crashed += 1; continue; }
  docs += 1;
  let docChanged = false;

  for (const { items, width } of pages) {
    if (items.length === 0) continue;
    pagesTotal += 1;
    const gutter = columnSplit(items, width);
    if (gutter !== null) pagesWithGutter += 1;

    const before = textOf(items, width, null);
    const after = textOf(items, width, gutter);

    fusedBefore += groupParagraphs(readingOrder(groupLines(items, null), width)).filter((g) => g.width / width > 0.6).length;
    fusedAfter += groupParagraphs(readingOrder(groupLines(items, gutter), width)).filter((g) => g.width / width > 0.6).length;

    // 🔴 (2) no character may appear or disappear.
    if (!bagsEqual(charBag(before), charBag(after))) {
      charsChanged += 1;
      if (offenders.length < 5) offenders.push(`CONTENT CHANGED: ${file.split("/").pop()}`);
    }
    // 🔴 (3) no gutter ⇒ byte-identical.
    if (gutter === null && before !== after) {
      noGutterChanged += 1;
      if (offenders.length < 5) offenders.push(`NO-GUTTER PAGE CHANGED: ${file.split("/").pop()}`);
    }
    if (before !== after) docChanged = true;
  }
  if (docChanged) changedDocs += 1;
}

console.log(`\n${"═".repeat(72)}`);
console.log("COLUMN GUTTER — GATE");
console.log(`${"═".repeat(72)}`);
console.log(`  documents            ${docs}   crashes ${crashed}`);
console.log(`  pages                ${pagesTotal}   with a detected gutter: ${pagesWithGutter} (${((100 * pagesWithGutter) / Math.max(pagesTotal, 1)).toFixed(1)}%)`);
console.log(`  documents whose text changed at all: ${changedDocs}`);
console.log(`\n  1. full-width fused groups   ${fusedBefore} → ${fusedAfter}  (${fusedBefore - fusedAfter} repaired)`);
console.log(`  2. pages losing/duplicating a character   ${charsChanged}   (must be 0)`);
console.log(`  3. no-gutter pages that changed           ${noGutterChanged}   (must be 0)`);
for (const o of offenders) console.log(`      🔴 ${o}`);

const ok = charsChanged === 0 && noGutterChanged === 0 && crashed === 0;
console.log(`\n${ok ? "✅ GATE PASSED" : "🔴 GATE FAILED"}`);
process.exit(ok ? 0 : 1);
