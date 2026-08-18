/**
 * What the Office router measures, on real files, before any routing changes.
 *
 * 🔴 THE OWNER'S INSTRUCTION AGAIN: *"Benchmark before changing production routing."* This runs the
 * REAL native readers over real OOXML and prints, side by side, what each file DECLARES and what
 * our own read RECOVERED — which is exactly the comparison `preflightOffice` makes, shown as
 * numbers a person can check rather than as a verdict they have to trust.
 *
 * 🔴 NO VENDOR IS CALLED. The point is to find out how often one is not needed.
 *
 * Run from apps/web:
 *   npx tsx scripts/office-calibrate.mts lib/notebooks/fixtures/office
 */

import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

import { documentToText } from "../../../packages/shared/src/document-model.ts";
import { extractDocxModel, pptxTextWithFigures, readPptxSlides } from "../lib/notebooks/office.ts";
import { claimOf } from "../lib/notebooks/mistral-quality.ts";
import { preflightOffice } from "../lib/notebooks/office-preflight.ts";
import { pptxToModel } from "../lib/notebooks/pptx-model.ts";
import type { FigureLabel } from "../lib/learn/figure-labels.ts";

const dir = process.argv[2] ?? "lib/notebooks/fixtures/office";
const files = readdirSync(dir)
  .filter((name) => [".docx", ".pptx"].includes(extname(name).toLowerCase()))
  .sort();

const pad = (value: unknown, width: number) => String(value).padEnd(width);
console.log(
  [pad("file", 26), pad("route", 8), pad("reason", 24), pad("notes", 12), pad("tables", 10), pad("pics", 10), pad("chars", 8)].join(""),
);

let vendor = 0;
for (const name of files) {
  const bytes = new Uint8Array(readFileSync(join(dir, name)));
  const kind = extname(name).toLowerCase() === ".docx" ? "docx" : "pptx";
  const claim = claimOf(kind, bytes);

  let model = null;
  let text = "";
  if (kind === "docx") {
    model = extractDocxModel(bytes);
    text = documentToText(model);
  } else {
    const deck = readPptxSlides(bytes);
    model = pptxToModel(
      {
        deckTitle: deck.deckTitle,
        images: deck.media.images,
        slides: deck.slides,
        slideTitles: deck.slideTitles,
        structure: deck.structure,
      },
      new Map<string, string>(),
      new Map<string, FigureLabel[]>(),
    );
    text = pptxTextWithFigures(deck, new Map<string, string>()).text;
  }

  const decision = preflightOffice(kind, claim, model, text);
  if (decision.route === "vendor") vendor += 1;
  const s = decision.signals;
  console.log(
    [
      pad(name, 26),
      pad(decision.route, 8),
      pad(decision.reason, 24),
      // Notes are the deck's spoken content: declared characters, and whether the read carries them.
      pad(kind === "pptx" ? `${s.notesChars}` : "-", 12),
      pad(`${s.recoveredTables}/${s.claimedTables}`, 10),
      pad(`${s.recoveredFigures}/${s.claimedImages}`, 10),
      pad(s.textChars, 8),
    ].join(""),
  );
}

console.log(
  `\n${files.length} file(s): ${files.length - vendor} native (${(((files.length - vendor) / Math.max(files.length, 1)) * 100).toFixed(1)}%), ${vendor} escalated`,
);
