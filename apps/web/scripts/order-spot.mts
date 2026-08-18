/**
 * Show one flagged page's blocks in the order the parse produced them, with their x positions.
 *
 * 🔴 A DEFECT RATE IS ONLY AS GOOD AS THE DETECTOR BEHIND IT. `columnInterleave` says 37% of
 * two-column pages are read across the gutter; that number is worth nothing until somebody has
 * looked at one and seen the sentences alternate. This prints the evidence for a person to judge.
 *
 * Run from apps/web:
 *   npx tsx scripts/order-spot.mts <file.pdf>
 */

import { readFileSync } from "node:fs";

import { columnInterleave } from "../lib/notebooks/parse-fidelity.ts";
import { parseDocument } from "../lib/notebooks/parse-document.ts";

const file = process.argv[2];
if (!file) throw new Error("usage: order-spot.mts <file.pdf>");

const bytes = readFileSync(file);
const out = await parseDocument(new Uint8Array(bytes), file, "application/pdf", {
  lookAtFigures: false,
  vendorAllowed: false,
});
if (!out.ok) throw new Error(`parse failed: ${out.reason}`);

const model = out.document.model;
if (!model) throw new Error("no model");

for (const finding of columnInterleave(model).findings.filter((f) => f.interleaved).slice(0, 2)) {
  console.info(`\n=== unit ${finding.unit}: ${finding.crossings} gutter crossings, ${finding.blocksConsidered} blocks`);
  for (const block of model.blocks.filter((b) => b.unit === finding.unit && b.rect && b.text.trim())) {
    const x = Math.round((block.rect?.x ?? 0) * 1000) / 1000;
    console.info(`  x=${String(x).padEnd(7)} ${block.text.replace(/\s+/gu, " ").slice(0, 84)}`);
  }
}
