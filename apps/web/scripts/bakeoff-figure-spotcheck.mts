/**
 * What ARE the figures our PDF lane counts?
 *
 * The corpus totals say Nemesis 375 vs Docling 176 on the same 93 PDFs, and the
 * biggest gaps are all exam reports. That smells like two different quantities
 * wearing one name: our extractor counts image DRAW OPERATIONS from the operator
 * list, while Docling's layout model counts things it believes are figures. A
 * logo repeated beside all 29 questions is 29 draws and arguably 1 figure.
 *
 * This prints every figure block our parser produces for one file, with its
 * geometry, so the question can be settled by looking rather than by arguing.
 * Identical rect SIZES repeating down a document is the signature of decoration.
 *
 * Run from apps/web:
 *   npx tsx scripts/bakeoff-figure-spotcheck.mts <file.pdf>
 */
import { readFileSync } from "node:fs";

import { parseDocument } from "../lib/notebooks/parse-document.ts";

const file = process.argv[2];
if (!file) throw new Error("usage: bakeoff-figure-spotcheck.mts <file.pdf>");

const bytes = new Uint8Array(readFileSync(file));
const outcome = await parseDocument(bytes, file.split("/").pop() ?? "f.pdf", "application/pdf", {
  lookAtFigures: false,
});
if (!outcome.ok) throw new Error(`parse refused: ${outcome.reason}`);

const model = outcome.document.model;
if (!model) throw new Error("no structural model");

const figures = model.blocks.filter((b) => b.kind === "figure");
console.log(`${file.split("/").pop()}: ${model.units.length} units, ${figures.length} figure blocks`);

// Group by rounded size. Decoration repeats at one size; real diagrams vary.
const bySize = new Map<string, { count: number; units: number[]; sample: string }>();
for (const f of figures) {
  const r = f.rect;
  const key = r ? `${(r.width * 100).toFixed(1)}% x ${(r.height * 100).toFixed(1)}%` : "no-geometry";
  const entry = bySize.get(key) ?? { count: 0, units: [], sample: f.figure?.ref ?? "" };
  entry.count += 1;
  entry.units.push(f.unit);
  bySize.set(key, entry);
}

console.log(`\ndistinct figure SIZES: ${bySize.size}`);
for (const [size, e] of [...bySize.entries()].sort((a, b) => b[1].count - a[1].count)) {
  const pages = [...new Set(e.units)].sort((a, b) => a - b);
  console.log(
    `  x${String(e.count).padStart(3)}  ${size.padEnd(22)} on units ${pages.slice(0, 8).join(",")}${pages.length > 8 ? "…" : ""}`,
  );
}

const repeated = [...bySize.values()].filter((e) => e.count > 1).reduce((n, e) => n + e.count, 0);
const distinctOnce = [...bySize.values()].filter((e) => e.count === 1).length;
console.log(
  `\nfigures at a size that repeats: ${repeated} of ${figures.length}` +
    `   |   sizes appearing exactly once: ${distinctOnce}`,
);
console.log(
  repeated / Math.max(1, figures.length) > 0.6
    ? "VERDICT: dominated by repeated-size images — decoration, not diagrams."
    : "VERDICT: sizes mostly vary — plausibly distinct figures.",
);
