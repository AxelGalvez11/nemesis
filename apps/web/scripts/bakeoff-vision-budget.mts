/**
 * How many of a document's figure blocks would actually be PAID for?
 *
 * A figure BLOCK is not a vision CALL. `planFigureVision` filters by area
 * (WORTH_LOOKING_AREA = 3% of the page) unless the page is thin, so a document
 * whose figure count is inflated by repeated decoration does not necessarily
 * cost anything extra. Counting blocks and calling it spend would be wrong, and
 * this script exists because I nearly did.
 *
 * Run from apps/web:
 *   npx tsx scripts/bakeoff-vision-budget.mts <file.pdf>
 */
import { readFileSync } from "node:fs";

import { parseDocument } from "../lib/notebooks/parse-document.ts";
import { planFigureVision, WORTH_LOOKING_AREA } from "../lib/pdf/figure-routing.ts";

const file = process.argv[2];
if (!file) throw new Error("usage: bakeoff-vision-budget.mts <file.pdf>");

const bytes = new Uint8Array(readFileSync(file));
const outcome = await parseDocument(bytes, file.split("/").pop() ?? "f.pdf", "application/pdf", {
  lookAtFigures: false,
});
if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
const model = outcome.document.model;
if (!model) throw new Error("no structural model");

const figures = model.blocks.filter((b) => b.kind === "figure");
const plan = planFigureVision(model);

console.log(`${file.split("/").pop()}`);
console.log(`  figure BLOCKS detected     : ${figures.length}`);
console.log(`  would be sent to vision    : ${plan.candidates.length}`);
console.log(`  qualified but over budget  : ${plan.overBudget}`);
console.log(`  threshold                  : area >= ${(WORTH_LOOKING_AREA * 100).toFixed(0)}% of page, OR a thin page`);
const byReason = plan.candidates.reduce<Record<string, number>>((acc, c) => {
  acc[c.because] = (acc[c.because] ?? 0) + 1;
  return acc;
}, {});
console.log(`  selected because           : ${JSON.stringify(byReason)}`);
const areas = figures.map((b) => (b.rect ? b.rect.width * b.rect.height : 0));
const tiny = areas.filter((a) => a < WORTH_LOOKING_AREA).length;
console.log(`  blocks below the threshold : ${tiny} of ${figures.length}`);
