/**
 * Corpus safety gate for the figure-placeholder removal.
 *
 * 🔴 THE CLAIM BEING PROVED IS "ONLY AN ADDITION WAS REMOVED". This change edits
 * rendering, not parsing — the `DocumentModel` is byte-identical before and
 * after — so the gate can be exact rather than statistical:
 *
 *     old rendering, with the placeholder deleted  ===  new rendering
 *
 * Character for character. Any difference beyond the placeholder is real content
 * that moved or vanished, and that is a failure.
 *
 * 🔴 COMPARE CHARACTERS, NOT WORDS. Words let two different splits of the same
 * characters look equal; that mistake produced 32 false failures on this corpus
 * once already.
 *
 * Run from apps/web:
 *   npx tsx scripts/figure-placeholder-gate.mts <corpus.jsonl> [maxFiles]
 */

import { readFileSync } from "node:fs";

import {
  blockToText,
  documentToText,
  type DocBlock,
  type DocumentModel,
} from "../../../packages/shared/src/document-model.ts";

import { readPdfStructure } from "../lib/pdf/structure.ts";

const PLACEHOLDER = "[Figure — not examined]";

/** Exactly what `blockToText` used to do for a figure, kept here as the baseline. */
function legacyBlockToText(block: DocBlock): string {
  if (block.kind === "figure") {
    const caption = block.text.trim();
    const seen = block.figure?.description?.trim();
    if (caption && seen) return `[Figure: ${caption}]\n${seen}`;
    if (caption) return `[Figure: ${caption}]`;
    if (seen) return `[Figure]\n${seen}`;
    return PLACEHOLDER;
  }
  return blockToText(block);
}

function legacyDocumentToText(doc: DocumentModel): string {
  return doc.blocks
    .map(legacyBlockToText)
    .filter((line) => line.trim().length > 0)
    .join("\n\n");
}

const [listPath, maxArg] = process.argv.slice(2);
if (!listPath) {
  console.error("usage: figure-placeholder-gate.mts <corpus.jsonl> [maxFiles]");
  process.exit(2);
}

const files = readFileSync(listPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => (JSON.parse(l) as { file: string }).file)
  .slice(0, maxArg ? Number(maxArg) : undefined);

let checked = 0;
let withPlaceholder = 0;
let placeholdersRemoved = 0;
let contentChanged = 0;
let crashed = 0;
const offenders: string[] = [];

for (const file of files) {
  let model: DocumentModel | undefined;
  try {
    ({ model } = await readPdfStructure(new Uint8Array(readFileSync(file))));
  } catch {
    crashed += 1;
    continue;
  }
  if (!model) continue;
  checked += 1;

  const before = legacyDocumentToText(model);
  const after = documentToText(model);

  const count = before.split(PLACEHOLDER).length - 1;
  if (count > 0) {
    withPlaceholder += 1;
    placeholdersRemoved += count;
  }

  // Delete the placeholder AND the paragraph separator it brought with it,
  // which is the whole of what the change removes.
  const expected = before
    .split("\n\n")
    .filter((part) => part !== PLACEHOLDER)
    .join("\n\n");

  if (expected !== after) {
    contentChanged += 1;
    if (offenders.length < 5) {
      const i = [...expected].findIndex((c, k) => c !== after[k]);
      offenders.push(`${file.split("/").pop()} — first divergence at char ${i}`);
    }
  }
}

console.log(`\n${"═".repeat(72)}`);
console.log("FIGURE PLACEHOLDER — CORPUS SAFETY GATE");
console.log(`${"═".repeat(72)}`);
console.log(`  documents parsed            ${checked}`);
console.log(`  crashes                     ${crashed}`);
console.log(`  documents that contained it ${withPlaceholder}`);
console.log(`  placeholders removed        ${placeholdersRemoved}`);
console.log(`  documents whose real content changed  ${contentChanged}`);
for (const o of offenders) console.log(`      🔴 ${o}`);
const ok = contentChanged === 0 && crashed === 0;
console.log(`\n${ok ? "✅ ZERO CONTENT LOSS — only the invented sentence was removed" : "🔴 GATE FAILED"}`);
process.exit(ok ? 0 : 1);
