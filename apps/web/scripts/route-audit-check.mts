// Which lane would PRODUCTION choose for each file, and why. Deterministic:
// runs the same preflight the router runs, with vision assumed configured
// (production has GEMINI_API_KEY; a local checkout does not), so the decision
// printed here is the decision app.enternemesis.com would make.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { documentToText } from "../../../packages/shared/src/document-model.ts";
import { extractDocxModel, pptxTextWithFigures, readPptxSlides } from "../lib/notebooks/office.ts";
import { pptxToModel } from "../lib/notebooks/pptx-model.ts";
import { preflightOffice } from "../lib/notebooks/office-preflight.ts";
import { claimOf } from "../lib/notebooks/mistral-quality.ts";
import { kindFor } from "../lib/notebooks/parse-document.ts";
import { readPdfStructure } from "../lib/pdf/structure.ts";
import { preflightPdf } from "../lib/pdf/preflight.ts";
import { unitTexts } from "../../../packages/shared/src/document-model.ts";
import { DEFAULT_DOCUMENT_UNIT_CAP } from "../lib/pdf/vision-budget.ts";
import type { FigureLabel } from "../lib/learn/figure-labels.ts";

async function decide(path: string) {
  const bytes = new Uint8Array(readFileSync(path));
  const name = basename(path);
  const kind = kindFor(name, "");
  if (kind === "pdf") {
    let structural = null;
    try {
      structural = await readPdfStructure(new Uint8Array(bytes), { captureFigures: false, detectTables: true });
    } catch { /* structureFailed */ }
    const evidence = structural
      ? {
          declaredUnits: structural.declaredUnits,
          pageTexts: unitTexts(structural.model),
          structureFailed: false,
          tableRegionsUnreadByUnit: structural.tableRegionsUnreadByUnit,
          tablesRejected: structural.tablesRejected,
          unitsWithContent: [...new Set(structural.model.blocks.map((b) => b.unit))],
          // Production: vision configured, fresh per-document ledger.
          visionAffordablePages: DEFAULT_DOCUMENT_UNIT_CAP,
        }
      : {
          declaredUnits: 0, pageTexts: [], structureFailed: true,
          tableRegionsUnreadByUnit: [], tablesRejected: {}, unitsWithContent: [],
          visionAffordablePages: DEFAULT_DOCUMENT_UNIT_CAP,
        };
    const d = preflightPdf(evidence);
    return { file: name, kind, route: d.route, reason: d.reason, detail: d.detail,
      pages: d.route === "vendor" ? (d.pages === null ? "whole-doc" : d.pages.length + " pages") : undefined,
      signals: { pages: d.signals.pages, withText: d.signals.pagesWithText, thin: d.signals.thinPages,
        empty: d.signals.emptyPages, corrupt: d.signals.corruptChars, scars: d.signals.scars,
        tablesUnread: d.signals.tablesUnread, tablesRejected: d.signals.tablesRejected } };
  }
  if (kind === "docx") {
    const model = extractDocxModel(bytes);
    const d = preflightOffice("docx", claimOf("docx", bytes), model, documentToText(model));
    return { file: name, kind, route: d.route, reason: d.reason, detail: d.detail, signals: d.signals };
  }
  if (kind === "pptx") {
    const deck = readPptxSlides(bytes);
    const provisional = pptxToModel(
      { deckTitle: deck.deckTitle, images: deck.media.images, slides: deck.slides, slideTitles: deck.slideTitles, structure: deck.structure },
      new Map<string, string>(), new Map<string, FigureLabel[]>(),
    );
    const d = preflightOffice("pptx", claimOf("pptx", bytes), provisional, pptxTextWithFigures(deck, new Map()).text);
    return { file: name, kind, route: d.route, reason: d.reason, detail: d.detail, signals: d.signals };
  }
  return { file: name, kind, route: "unsupported" };
}

for (const f of process.argv.slice(2)) {
  try {
    console.log(JSON.stringify(await decide(f)));
  } catch (e) {
    console.log(JSON.stringify({ file: basename(f), error: String((e as Error).message).slice(0, 200) }));
  }
}
