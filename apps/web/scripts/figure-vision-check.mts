// Run DeepSeek vision on real extracted lecture figures with the PRODUCTION figure prompt.
// Proves the "read a slide's diagram so it can be taught as a visual" capability + prices it.
import { readFileSync } from "node:fs";
import { readWithDeepseekVision } from "../lib/vision/deepseek.ts";
import { FIGURE_PROMPT } from "../lib/pdf/vision.ts";
import { visionTokensCostUsd } from "../lib/cost/ai-spend.ts";

const files = process.argv.slice(2);
let totalCost = 0;
for (const f of files) {
  const bytes = new Uint8Array(readFileSync(f));
  const mime = f.endsWith(".jpg") ? "image/jpeg" : "image/png";
  const label = f.split("/").pop();
  const t0 = Date.now();
  const r = await readWithDeepseekVision(bytes, mime, {
    prompt: "[[figure 1]]\n" + FIGURE_PROMPT,
  });
  const ms = Date.now() - t0;
  if (!r) { console.log(`\n### ${label}\nNULL (no key / call failed)`); continue; }
  let cost = 0;
  try {
    if (r.usage) cost = visionTokensCostUsd(r.usage);
  } catch (e) { cost = -1; }
  totalCost += cost > 0 ? cost : 0;
  console.log(`\n### ${label}  (${(bytes.byteLength/1024).toFixed(0)} KB, ${ms} ms)`);
  console.log(`model=${r.model}  usage=${JSON.stringify(r.usage)}  cost=$${cost.toFixed(6)}`);
  console.log(r.text.trim().slice(0, 900));
}
console.log(`\n===== total billed: $${totalCost.toFixed(6)} for ${files.length} figures =====`);
