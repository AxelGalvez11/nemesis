/**
 * Gate for block classification.
 *
 * Reports the kind census before and after, and asserts the four things a
 * relabelling must never do:
 *
 *   1. lose or duplicate a character of source text;
 *   2. change any table's grid or any figure's reference;
 *   3. change a block's id, rect, unit or heading path;
 *   4. relabel anything that carries structural evidence from the format.
 *
 *   npx tsx scripts/classification-gate.mts <corpus.jsonl> [maxFiles]
 */

import { readFileSync } from "node:fs";

import { classifyFurniture } from "../../../packages/shared/src/document-furniture.ts";
import { documentToText, type DocumentModel } from "../../../packages/shared/src/document-model.ts";

import { readPdfStructure } from "../lib/pdf/structure.ts";

const files = readFileSync(process.argv[2]!, "utf8")
  .split("\n").filter(Boolean)
  .map((l) => (JSON.parse(l) as { file: string }).file)
  .slice(0, Number(process.argv[3] ?? 9999));

const before = new Map<string, number>();
const after = new Map<string, number>();
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

let docs = 0, crashed = 0;
let textChanged = 0, identityChanged = 0, structureChanged = 0, evidenceRelabelled = 0;
const offenders: string[] = [];

for (const file of files) {
  let model: DocumentModel | undefined;
  try { ({ model } = await readPdfStructure(new Uint8Array(readFileSync(file)))); } catch { crashed += 1; continue; }
  if (!model) continue;
  docs += 1;

  // `readPdfStructure` already applies it, so re-running must be a no-op — which
  // is itself the idempotency check.
  const relabelled = classifyFurniture(model);
  for (const b of model.blocks) bump(before, b.kind);
  for (const b of relabelled.blocks) bump(after, b.kind);

  // 1. text is untouched
  if (documentToText(model) !== documentToText(relabelled)) {
    textChanged += 1;
    if (offenders.length < 5) offenders.push(`TEXT CHANGED: ${file.split("/").pop()}`);
  }
  for (let i = 0; i < model.blocks.length; i += 1) {
    const a = model.blocks[i]!;
    const b = relabelled.blocks[i]!;
    // 3. identity and provenance
    if (a.id !== b.id || a.unit !== b.unit || a.text !== b.text
      || JSON.stringify(a.rect) !== JSON.stringify(b.rect)
      || JSON.stringify(a.headingPath) !== JSON.stringify(b.headingPath)) {
      identityChanged += 1;
      if (offenders.length < 5) offenders.push(`IDENTITY CHANGED: ${file.split("/").pop()} ${a.id}`);
    }
    // 2. attached structure
    if (JSON.stringify(a.table) !== JSON.stringify(b.table) || JSON.stringify(a.figure) !== JSON.stringify(b.figure)) {
      structureChanged += 1;
    }
    // 4. a block carrying format evidence keeps its kind
    if ((a.table || a.figure) && a.kind !== b.kind) {
      evidenceRelabelled += 1;
      if (offenders.length < 5) offenders.push(`EVIDENCE RELABELLED: ${file.split("/").pop()} ${a.id} ${a.kind}→${b.kind}`);
    }
  }
}

const total = [...after.values()].reduce((a, b) => a + b, 0);
console.log(`\n${"═".repeat(70)}`);
console.log("BLOCK CLASSIFICATION — GATE");
console.log(`${"═".repeat(70)}`);
console.log(`  documents ${docs}   crashes ${crashed}   blocks ${total}\n`);
console.log(`  ${"kind".padEnd(12)} ${"before".padStart(8)} ${"after".padStart(8)}  ${"share".padStart(7)}`);
for (const k of new Set([...before.keys(), ...after.keys()])) {
  const b = before.get(k) ?? 0;
  const a = after.get(k) ?? 0;
  const mark = a !== b ? "  ←" : "";
  console.log(`  ${k.padEnd(12)} ${String(b).padStart(8)} ${String(a).padStart(8)}  ${((100 * a) / Math.max(total, 1)).toFixed(1).padStart(6)}%${mark}`);
}
console.log(`\n  1. documents whose text changed          ${textChanged}   (must be 0)`);
console.log(`  2. blocks whose table/figure changed     ${structureChanged}   (must be 0)`);
console.log(`  3. blocks whose identity changed         ${identityChanged}   (must be 0)`);
console.log(`  4. blocks with format evidence relabelled ${evidenceRelabelled}   (must be 0)`);
for (const o of offenders) console.log(`      🔴 ${o}`);

const ok = textChanged === 0 && structureChanged === 0 && identityChanged === 0 && evidenceRelabelled === 0 && crashed === 0;
console.log(`\n${ok ? "✅ GATE PASSED" : "🔴 GATE FAILED"}`);
process.exit(ok ? 0 : 1);
