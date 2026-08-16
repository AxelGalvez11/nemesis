/**
 * What happened to a real document's pictures when the vendor lane read it.
 *
 * Replays the accounting in `lib/pdf/figure-accounting.ts` against a PDF on disk and the vendor
 * model production actually stored for it (`parsed_documents.structure.model`), so the numbers
 * quoted in that module's comment can be reproduced without a Mistral key and without a parse.
 *
 *   tsx scripts/bakeoff-vendor-figures.ts <file.pdf> <vendor-model.json> [--strip-figures]
 *
 * `--strip-figures` deletes every figure block from the vendor model before accounting, which
 * simulates the `image_limit: 0` behaviour `mistral-ocr.ts` documents as catastrophic — a
 * lecture built out of diagrams coming back with no figures at all. It is how the gate in
 * `parseWithVendor` is calibrated against production geometry rather than a hand-built fixture.
 */
import { readFile } from "node:fs/promises";

import { accountForFigures } from "@/lib/pdf/figure-accounting";
import { matchFigureImages } from "@/lib/pdf/figure-match";
import { planFigureVision } from "@/lib/pdf/figure-routing";
import { readPdfStructure } from "@/lib/pdf/structure";
import type { DocumentModel } from "@nemesis/shared";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const strip = args.includes("--strip-figures");
  const [pdfPath, modelPath] = args.filter((arg) => !arg.startsWith("--"));
  if (!pdfPath || !modelPath) throw new Error("usage: bakeoff-vendor-figures.ts <pdf> <vendor-model.json> [--strip-figures]");

  const bytes = new Uint8Array(await readFile(pdfPath));
  const started = Date.now();
  const structural = await readPdfStructure(new Uint8Array(bytes), { captureFigures: true, detectTables: false });
  const structuralMs = Date.now() - started;

  const stored = JSON.parse(await readFile(modelPath, "utf8")) as DocumentModel;
  const vendor: DocumentModel = strip
    ? { ...stored, blocks: stored.blocks.filter((block) => block.kind !== "figure") }
    : stored;

  const accounting = accountForFigures(vendor, structural.model);
  const matched = matchFigureImages(vendor, structural.model, structural.figureImages);
  const plan = planFigureVision(vendor);

  console.log(JSON.stringify({
    file: pdfPath.split("/").pop(),
    strippedFigures: strip,
    structuralMs,
    sourceUnits: structural.model.units.length,
    vendorUnits: vendor.units.length,
    sourceFigures: structural.model.blocks.filter((block) => block.kind === "figure").length,
    sourceFiguresWithPixels: structural.figureImages.size,
    vendorFigures: vendor.blocks.filter((block) => block.kind === "figure").length,
    accounting: { absent: accounting.absent, asContent: accounting.asContent, asFigure: accounting.asFigure, regions: accounting.regions.length },
    match: matched.report,
    routed: plan.candidates.length,
    routedWithPixels: plan.candidates.filter((candidate) => matched.images.has(`${candidate.unit}:${candidate.ref}`)).length,
  }, null, 2));

  for (const region of accounting.regions) {
    console.log(`  u${region.unit} ${region.ref} area=${(region.area * 100).toFixed(1)}% covered=${region.covered.toFixed(2)} -> ${region.fate}`);
  }
}

main();
