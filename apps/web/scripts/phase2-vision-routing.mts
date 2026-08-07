/**
 * Phase 2's visual half, measured on real files.
 *
 * The baseline this answers: over 120 real course PDFs / 952 pages, production
 * never looks at 1,807 figures on 326 text-rich pages, because it routes vision
 * by text sparsity alone. The structural reader then found 1,963 figures and
 * left **1,089 unexamined**.
 *
 * Three questions:
 *
 *   1. ROUTING  How many of the unexamined figures does the new predicate
 *               select? A router that selects none has changed nothing.
 *   2. PIXELS   How many of those can actually be converted to bytes a model can
 *               read, with no canvas and no new dependency? This is the number
 *               that decides whether the approach works at all.
 *   3. HONESTY  Does every routed figure end up with either a description or a
 *               stated reason — never back in the no-reason state that means
 *               "nobody looked"?
 *
 * 🔴 THIS SCRIPT DOES NOT CALL THE PROVIDER. Description quality is a separate,
 * paid measurement; running it across a whole corpus unasked would spend the
 * owner's money to produce a number. What is measured here is everything that
 * was previously impossible: selection and pixels.
 *
 * Run from apps/web:
 *   npx tsx scripts/phase2-vision-routing.mts <dir> [maxFiles]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { figureCoverageOf } from "../../../packages/shared/src/document-model.ts";
import { readPdfStructure } from "../lib/pdf/structure.ts";
import { applyFigureDescriptions, planFigureVision } from "../lib/pdf/figure-routing.ts";

function walk(root: string, depth = 0): string[] {
  if (depth > 3) return [];
  let entries: string[] = [];
  try { entries = readdirSync(root); } catch { return []; }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = join(root, entry);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) out.push(...walk(full, depth + 1));
    else if (entry.toLowerCase().endsWith(".pdf") && s.size < 60 * 1024 * 1024) out.push(full);
  }
  return out;
}

const dir = process.argv[2] ?? `${process.env.HOME}/Downloads`;
const files = walk(dir).slice(0, Number(process.argv[3] ?? "200"));

let read = 0, failed = 0, pages = 0;
let figuresFound = 0, unexaminedBefore = 0;
let routed = 0, overBudget = 0, withPixels = 0, withoutPixels = 0;
let unexaminedAfter = 0, statedAfter = 0;
let filesRouted = 0;
let pngBytes = 0;
const because = { "large-figure": 0, "thin-unit": 0 };

for (const file of files) {
  const name = file.split("/").pop() ?? file;
  try {
    const bytes = new Uint8Array(readFileSync(file));
    const { model, figureImages } = await readPdfStructure(bytes, { captureFigures: true });
    read += 1;
    pages += model.units.length;

    const before = figureCoverageOf(model);
    figuresFound += before.found;
    unexaminedBefore += before.reasons["not-examined"] ?? 0;

    const plan = planFigureVision(model);
    routed += plan.candidates.length;
    overBudget += plan.overBudget;
    if (plan.candidates.length > 0) filesRouted += 1;

    // Exactly what `lookAtFigures` does, minus the provider: every routed figure
    // gets an answer. A figure whose pixels were captured is counted as
    // describable; one without gets the stated `unsupported`.
    const results = new Map<number, { description?: string; skipped?: string }>();
    for (const candidate of plan.candidates) {
      because[candidate.because] += 1;
      const image = figureImages.get(`${candidate.unit}:${candidate.ref}`);
      if (image) {
        withPixels += 1;
        pngBytes += image.png.byteLength;
        // Stand in for a description so the honesty check below is meaningful.
        results.set(candidate.blockIndex, { description: "<would be described>" });
      } else {
        withoutPixels += 1;
        results.set(candidate.blockIndex, { skipped: "unsupported" });
      }
    }

    const after = figureCoverageOf(applyFigureDescriptions(model, results));
    unexaminedAfter += after.reasons["not-examined"] ?? 0;
    statedAfter += after.skipped - (after.reasons["not-examined"] ?? 0);
  } catch (error) {
    failed += 1;
    if (failed <= 5) console.log(`  ! ${name}: ${(error as Error).message.slice(0, 90)}`);
  }
}

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

console.log(`
FILES        ${read} read, ${failed} failed, ${pages} pages
FIGURES      ${figuresFound} found; ${unexaminedBefore} unexamined before routing

ROUTING      ${routed} selected across ${filesRouted} files  (${pct(routed, unexaminedBefore)} of the unexamined)
             ${because["large-figure"]} because a large figure sits on the page — the population
             production CANNOT see, since it routes on text sparsity alone
             ${because["thin-unit"]} because the page's text is thin (production's only signal)
             ${overBudget} qualified and did not fit the per-document budget

PIXELS       ${withPixels} converted to PNG  (${pct(withPixels, routed)} of routed), ${(pngBytes / 1024 / 1024).toFixed(1)} MB total
             ${withoutPixels} had no decodable pixels — recorded as 'unsupported', not dropped

HONESTY      ${unexaminedAfter} still have NO stated reason (was ${unexaminedBefore})
             ${statedAfter} carry a stated reason
`);
