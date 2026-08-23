// Deterministic parse audit of real lecture files. No vision key needed:
// text, tables, structure, and figure EXTRACTION are all local + pure.
// Writes extracted figures to <outDir>/figures for eyeballing.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";

import { documentToText, figureCoverageOf, type DocBlock, type DocumentModel } from "../../../packages/shared/src/document-model.ts";
import { extractDocxModel, readPptxSlides, pptxTextWithFigures } from "../lib/notebooks/office.ts";
import { pptxToModel } from "../lib/notebooks/pptx-model.ts";
import { normalizedFigures } from "../lib/notebooks/figure-assets.ts";
import { readPdfStructure } from "../lib/pdf/structure.ts";
import { kindFor } from "../lib/notebooks/parse-document.ts";
import type { FigureLabel } from "../lib/learn/figure-labels.ts";

const OUT = process.argv[2] || "/tmp/lecture-out";
mkdirSync(`${OUT}/figures`, { recursive: true });

function countBlocks(blocks: DocBlock[]) {
  const by: Record<string, number> = {};
  for (const b of blocks) by[b.kind] = (by[b.kind] || 0) + 1;
  return by;
}
function tableShapes(blocks: DocBlock[]) {
  return blocks.filter((b) => b.kind === "table").slice(0, 6).map((b: any) => {
    const rows = b.table?.rows?.length ?? 0;
    const cols = b.table?.rows?.[0]?.length ?? 0;
    return `${rows}x${cols}`;
  });
}

async function audit(path: string) {
  const bytes = new Uint8Array(readFileSync(path));
  const name = basename(path);
  const kind = kindFor(name, "");
  const rep: any = { file: name, sizeKB: Math.round(bytes.byteLength / 1024), kind };

  if (kind === "pptx") {
    const deck = readPptxSlides(bytes);
    const figs = normalizedFigures(deck.imageBytes, deck.media.images);
    const model = pptxToModel(
      { deckTitle: deck.deckTitle, images: deck.media.images, slides: deck.slides, slideTitles: deck.slideTitles, structure: deck.structure },
      new Map<string, string>(), new Map<string, FigureLabel[]>(),
    );
    const text = pptxTextWithFigures(deck, new Map()).text;
    rep.deckTitle = deck.deckTitle;
    rep.slides = deck.slides.length;
    rep.textChars = text.length;
    rep.blockCounts = countBlocks(model.blocks);
    rep.tableShapes = tableShapes(model.blocks);
    rep.figures = { kept: figs.length, totalBytes: figs.reduce((a, f) => a + f.bytes.byteLength, 0), dims: figs.slice(0, 8).map((f) => `${f.width}x${f.height} ${f.mime}`) };
    rep.coverage = deck.coverage;
    // dump up to 10 largest figures for eyeballing + DeepSeek
    const big = [...figs].sort((a, b) => b.bytes.byteLength - a.bytes.byteLength).slice(0, 10);
    rep.figureFiles = big.map((f, i) => {
      const ext = f.mime.includes("png") ? "png" : f.mime.includes("jpeg") ? "jpg" : "bin";
      const fn = `${OUT}/figures/${name.replace(/[^a-z0-9]/gi, "_")}_fig${i}_${f.width}x${f.height}.${ext}`;
      writeFileSync(fn, f.bytes);
      return fn;
    });
    rep.textHead = text.slice(0, 700);
  } else if (kind === "docx") {
    const model: DocumentModel = extractDocxModel(bytes);
    const text = documentToText(model);
    rep.title = model.title;
    rep.units = model.units.length;
    rep.textChars = text.length;
    rep.blockCounts = countBlocks(model.blocks);
    rep.tableShapes = tableShapes(model.blocks);
    rep.figureCoverage = figureCoverageOf(model);
    rep.textHead = text.slice(0, 900);
  } else if (kind === "pdf") {
    const s = await readPdfStructure(bytes, { captureFigures: true, detectTables: true, latticeTables: true });
    const text = documentToText(s.model);
    rep.declaredPages = s.declaredUnits;
    rep.readPages = s.model.units.length;
    rep.blockCounts = countBlocks(s.model.blocks);
    rep.tableShapes = tableShapes(s.model.blocks);
    rep.figuresCaptured = s.figureImages.size;
    rep.tableRegionsUnread = s.tableRegionsUnread;
    rep.figureCoverage = figureCoverageOf(s.model);
    rep.textChars = text.length;
    // dump captured figures for eyeballing
    let i = 0;
    for (const [key, fig] of s.figureImages) {
      if (i >= 8) break;
      const b = (fig as any).png as Uint8Array | undefined;
      if (!b) continue;
      writeFileSync(`${OUT}/figures/${name.replace(/[^a-z0-9]/gi, "_")}_pdf${i}_${(fig as any).width}x${(fig as any).height}.png`, b);
      i++;
    }
    rep.figuresDumped = i;
    rep.textHead = text.slice(0, 500);
  }
  return rep;
}

const files = process.argv.length > 3 ? process.argv.slice(3) : [
  `${process.env.HOME}/Downloads/Pharmacology of Asthma and COPD Drugs  08-28-2026-Singh .pptx`,
];
for (const f of files) {
  try {
    const r = await audit(f);
    console.log("\n===== " + r.file + " =====");
    console.log(JSON.stringify(r, null, 1));
  } catch (e) {
    console.log("\n===== FAILED " + basename(f) + " =====\n" + String((e as Error).stack || e));
  }
}
