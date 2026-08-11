/**
 * WHAT DOES A FAILING "reading order" RULE ACTUALLY MEAN? Built because the
 * number said 44.80 and the cause turned out not to be ordering at all.
 *
 * For every order rule it asks one question the score cannot: is the expected
 * text ABSENT, PRESENT BUT FRAGMENTED, or PRESENT AND OUT OF SEQUENCE. Those are
 * three different defects with three different fixes, and a single pass rate
 * averages them into one misleading figure.
 *
 *   npx tsx scripts/reading-order-diagnosis.mts <parsebench-root> [category] [maxDocs]
 */

/**
 * For each failing `order` rule, is the expected text ABSENT from our output, or
 * PRESENT but in the wrong place? That single distinction decides whether fix 3
 * is a reordering problem at all.
 */

import { readFileSync } from "node:fs";

import { documentToText } from "../../../packages/shared/src/document-model.ts";

import { readPdfStructure } from "../lib/pdf/structure.ts";

const root = process.argv[2]!;
const category = process.argv[3] ?? "multicolumns";
const limit = Number(process.argv[4] ?? 12);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();

// rules, grouped by pdf
const byPdf = new Map<string, { before: string; after: string }[]>();
for (const line of readFileSync(`${root}/data/text_content.jsonl`, "utf8").split("\n").filter(Boolean)) {
  const d = JSON.parse(line) as { pdf: string; type: string; rule: string };
  if (d.type !== "order" || !d.pdf.includes(category)) continue;
  let r: { before?: string; after?: string };
  try { r = JSON.parse(d.rule) as { before?: string; after?: string }; } catch { continue; }
  if (!r.before || !r.after) continue;
  const list = byPdf.get(d.pdf) ?? [];
  list.push({ after: r.after, before: r.before });
  byPdf.set(d.pdf, list);
}

let bothPresent = 0;
let beforeMissing = 0;
let afterMissing = 0;
let wrongOrder = 0;
let docs = 0;
let fragmented = 0;
const examples: string[] = [];

for (const [pdf, rules] of [...byPdf].slice(0, limit)) {
  let model;
  try { ({ model } = await readPdfStructure(new Uint8Array(readFileSync(`${root}/data/${pdf}`)))); } catch { continue; }
  if (!model) continue;
  docs += 1;
  const text = norm(documentToText(model));

  for (const { before, after } of rules) {
    const b = text.indexOf(norm(before).slice(0, 40));
    const a = text.indexOf(norm(after).slice(0, 40));
    // 🔴 IS IT ABSENT, OR PRESENT BUT BROKEN? A sentence split across interleaved
    // columns matches a SHORT prefix and fails a long one. That distinction is
    // the difference between "we never read it" and "we read it out of order".
    if (b < 0) { if (text.includes(norm(before).slice(0, 16))) fragmented += 1; }
    if (b < 0 && a < 0) { beforeMissing += 1; afterMissing += 1; continue; }
    if (b < 0) { beforeMissing += 1; continue; }
    if (a < 0) { afterMissing += 1; continue; }
    bothPresent += 1;
    if (b > a) {
      wrongOrder += 1;
      if (examples.length < 5) {
        examples.push(`${pdf.split("/").pop()}  “${norm(before).slice(0, 40)}” at ${b} AFTER “${norm(after).slice(0, 40)}” at ${a}`);
      }
    }
  }
}

const total = bothPresent + beforeMissing + afterMissing;
console.log(`\ncategory=${category}  documents=${docs}  order rules examined=${total}`);
console.log(`  both strings present:        ${bothPresent}`);
console.log(`    of those, WRONG SEQUENCE:  ${wrongOrder}  ← a true reading-order defect`);
console.log(`    of those, correct order:   ${bothPresent - wrongOrder}`);
console.log(`  'before' text not extracted: ${beforeMissing}`);
console.log(`    of those, a SHORT prefix DOES appear (present but fragmented): ${fragmented}`);
console.log(`  'after'  text not extracted: ${afterMissing}`);
if (examples.length) {
  console.log(`\n  real misordering examples:`);
  for (const e of examples) console.log(`    ${e}`);
}
