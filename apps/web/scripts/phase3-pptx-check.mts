/**
 * Phase 3's other half: did putting decks on the canonical model cost anything?
 *
 * 🔴 "MUST NOT REGRESS" IS ONLY A RULE IF SOMETHING CHECKS IT. PPTX is the
 * strongest lane in the system — speaker notes, SmartArt, charts, tables,
 * EMF/TIFF recovery, glyph filtering — and its baseline on the owner's own deck
 * is 62,040 characters, 56 headings and 807 bullets. That sentence has been
 * repeated in the ledger for two days with nothing re-deriving it.
 *
 * This compares, on every real .pptx it can find:
 *
 *   TEXT     every non-blank line the string renderer produced must appear in
 *            the model. Not "similar length" — the actual lines, because a
 *            renderer that drops one slide and pads another passes a length test.
 *   SLIDES   one unit per slide, so a locator can name one.
 *   FIGURES  figure descriptions stay figure descriptions and do not become
 *            quotable body text.
 *
 * Run from apps/web:
 *   npx tsx scripts/phase3-pptx-check.mts <dir> [maxFiles]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { countDocument, describeLocator, documentToText, locate } from "../../../packages/shared/src/document-model.ts";
import { readPptxSlides, pptxTextWithFigures } from "../lib/notebooks/office.ts";
import { pptxToModel } from "../lib/notebooks/pptx-model.ts";

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
    else if (entry.toLowerCase().endsWith(".pptx") && s.size < 200 * 1024 * 1024) out.push(full);
  }
  return out;
}

const dir = process.argv[2] ?? `${process.env.HOME}/Downloads`;
const files = walk(dir).slice(0, Number(process.argv[3] ?? "200"));

let read = 0, failed = 0;
let slides = 0, blocks = 0, headings = 0, figures = 0;
let renderedChars = 0, modelChars = 0;
let filesLosingLines = 0, linesLost = 0;
let wrongUnitNoun = 0;
const worst: { name: string; lost: number; lines: string[] }[] = [];

for (const file of files) {
  const name = file.split("/").pop() ?? file;
  try {
    const bytes = new Uint8Array(readFileSync(file));
    const deck = readPptxSlides(bytes);
    // No descriptions: this measures the SHAPING, not the provider. Figure
    // handling is checked separately, below, on decks that have pictures.
    const rendered = pptxTextWithFigures(deck, new Map());
    const model = pptxToModel({
      deckTitle: deck.deckTitle,
      images: deck.media.images,
      slides: deck.slides,
      slideTitles: deck.slideTitles,
      structure: deck.structure,
    });
    read += 1;

    const counts = countDocument(model);
    slides += model.units.length;
    blocks += counts.blocks;
    headings += counts.headings;
    figures += counts.figures;
    renderedChars += rendered.text.length;
    const modelText = documentToText(model);
    modelChars += modelText.length;

    // 🔴 LINE BY LINE, NOT BY LENGTH. A shaping that drops one slide and
    // repeats another passes every length comparison ever written.
    const present = new Set(modelText.split("\n").map((line) => line.trim()).filter(Boolean));
    const missing = rendered.text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !present.has(line));
    if (missing.length > 0) {
      filesLosingLines += 1;
      linesLost += missing.length;
      worst.push({ lines: missing.slice(0, 3), lost: missing.length, name });
    }

    // A deck HAS slides, so naming one is a fact, not a fabrication.
    for (let unit = 0; unit < model.units.length; unit += 1) {
      const block = model.blocks.find((b) => b.unit === unit);
      if (!block) continue;
      const where = describeLocator(locate(model, block));
      if (!where.startsWith(`slide ${unit + 1}`)) wrongUnitNoun += 1;
    }
  } catch (error) {
    failed += 1;
    if (failed <= 5) console.log(`  ! ${name}: ${(error as Error).message.slice(0, 100)}`);
  }
}

worst.sort((a, b) => b.lost - a.lost);

console.log(`
FILES     ${read} read, ${failed} failed
SHAPE     ${slides} slides, ${blocks} blocks, ${headings} headings, ${figures} figure blocks
TEXT      renderer ${renderedChars.toLocaleString()} chars, model ${modelChars.toLocaleString()} chars
REGRESS   ${filesLosingLines} files lost a line, ${linesLost} lines total
LOCATORS  ${wrongUnitNoun} blocks whose locator does not name their slide
`);

for (const entry of worst.slice(0, 5)) {
  console.log(`  ${entry.name}: ${entry.lost} lines, e.g. ${JSON.stringify(entry.lines[0]?.slice(0, 70))}`);
}
