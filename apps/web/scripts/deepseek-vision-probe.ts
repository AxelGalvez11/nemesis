/**
 * Send ONE image to DeepSeek vision and print what came back and what it cost.
 *
 * The one thing the unit tests cannot prove is that the two-day-old model actually answers on a
 * real key — this is that check, runnable in one command. It calls the SAME client the product
 * uses (lib/vision/deepseek.ts), so a pass here is a pass for the code path, not for a lookalike.
 *
 * Usage, from apps/web (reads DEEPSEEK_API_KEY from .env.local):
 *   npm run deepseek-vision-probe -- path/to/image.png
 */

import { readFileSync } from "node:fs";

import { visionTokensCostUsd } from "@/lib/cost/ai-spend";
import { visionMime } from "@/lib/vision/gemini";
import { deepseekVisionConfigured, readWithDeepseekVision } from "@/lib/vision/deepseek";

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    console.log("Usage: npm run deepseek-vision-probe -- path/to/image.png");
    process.exit(2);
  }
  if (!deepseekVisionConfigured()) {
    console.log("DEEPSEEK_API_KEY is not set. Put it in apps/web/.env.local first.");
    process.exit(1);
  }
  const bytes = new Uint8Array(readFileSync(path));
  const mime = visionMime(path, "");
  if (!mime) {
    console.log(`"${path}" is not an image this product reads (png/jpeg/webp/heic).`);
    process.exit(2);
  }
  console.log(`sending ${bytes.byteLength} bytes of ${mime}…`);
  const started = Date.now();
  const result = await readWithDeepseekVision(bytes, mime, {
    prompt: "Transcribe every word of text you can see, in reading order. If there is little or no text, describe what the image shows in plain sentences.",
  });
  const ms = Date.now() - started;
  if (!result) {
    // The client already logged the structured provider error above this line.
    console.log(`FAILED after ${ms}ms — no reading came back. HEIC? DeepSeek cannot read HEIC; the product falls back to Gemini for those.`);
    process.exit(1);
  }
  console.log(`\nmodel   ${result.model}  (${ms}ms)`);
  if (result.usage) {
    const usd = visionTokensCostUsd(result.usage);
    console.log(`tokens  in ${result.usage.inputMissTokens} (+${result.usage.inputHitTokens} cached) · out ${result.usage.outputTokens}`);
    console.log(`cost    $${usd.toFixed(6)} at the peak rate (off-peak halves it)`);
  } else {
    console.log("tokens  none reported — the ledger would record this call as unpriced, not free");
  }
  console.log(`\n${result.text.slice(0, 600)}${result.text.length > 600 ? "\n…" : ""}`);
}

void main();
