/**
 * WHY does a DeepSeek vision read sometimes come back with EMPTY text?
 *
 * The fresh-timing probe (vision-fresh-probe.ts) caught one: 69.3s, HTTP 200, `vision_empty_response`.
 * The owner asked whether that was API credits. Credits would be an HTTP 402 (`vision_provider_error`
 * with a status), so the logged event already rules that out; the suspect is the OUTPUT CEILING —
 * this model bills its reasoning as output, DEEPSEEK_VISION_MAX_OUTPUT is 8192, and the successful
 * runs' token rate (~116 tok/s) extrapolates 69.3s to ≈8,050 tokens. If the cap lands while the
 * model is still thinking, `content` is empty and the whole spend bought nothing.
 *
 * This probe hits the API RAW — same request builder the app ships — and prints the two fields the
 * shipped parser ignores: `finish_reason` and the size of `reasoning_content`. An empty run showing
 * finish_reason "length" with completion_tokens at the cap is the proof. Runs go three at a time
 * (the failure is ~1 in 6) and the probe stops at the first empty it catches.
 *
 * Usage, from apps/web:
 *   pnpm tsx --env-file=<path>/.env.local scripts/vision-why-empty-probe.ts [maxBatches]
 */
import { OCCLUSION_VISION_PROMPT } from "@nemesis/shared";

import { buildDeepseekVisionRequest, deepseekVisionModel } from "../lib/vision/deepseek";

const SRC = "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Diagram_of_the_human_heart_%28cropped%29.svg/1280px-Diagram_of_the_human_heart_%28cropped%29.svg.png";

interface RawRead {
  seconds: number;
  status: number;
  finishReason: string;
  contentChars: number;
  reasoningChars: number;
  completionTokens: number;
}

async function readRaw(body: string, key: string): Promise<RawRead> {
  const started = Date.now();
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    body,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    method: "POST",
  });
  const seconds = Number(((Date.now() - started) / 1000).toFixed(1));
  if (!response.ok) {
    await response.body?.cancel();
    return { completionTokens: 0, contentChars: 0, finishReason: `http ${response.status}`, reasoningChars: 0, seconds, status: response.status };
  }
  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{ finish_reason?: string; message?: { content?: string; reasoning_content?: string } }>;
    usage?: { completion_tokens?: number };
  } | null;
  const first = payload?.choices?.[0];
  return {
    completionTokens: payload?.usage?.completion_tokens ?? 0,
    contentChars: (first?.message?.content ?? "").trim().length,
    finishReason: first?.finish_reason ?? "(missing)",
    reasoningChars: (first?.message?.reasoning_content ?? "").length,
    seconds,
    status: response.status,
  };
}

async function main() {
  const key = (process.env.DEEPSEEK_API_KEY ?? "").trim();
  if (!key) throw new Error("DEEPSEEK_API_KEY missing — pass --env-file");
  const model = deepseekVisionModel();
  console.log("model:", model);

  const res = await fetch(SRC);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const body = buildDeepseekVisionRequest(Buffer.from(bytes).toString("base64"), "image/png", OCCLUSION_VISION_PROMPT, model);

  const maxBatches = Number(process.argv[2] ?? 3);
  let run = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const reads = await Promise.all([readRaw(body, key), readRaw(body, key), readRaw(body, key)]);
    let caught = false;
    for (const read of reads) {
      run += 1;
      const empty = read.status === 200 && read.contentChars === 0;
      console.log(
        `run ${run}: ${read.seconds}s | finish_reason=${read.finishReason} | answer ${read.contentChars} chars | ` +
          `thinking ${read.reasoningChars} chars | ${read.completionTokens} output tokens${empty ? "  <-- EMPTY" : ""}`,
      );
      caught ||= empty;
    }
    if (caught) {
      console.log("\ncaught one — see the EMPTY line above.");
      return;
    }
  }
  console.log("\nno empty reply in these runs (it is ~1 in 6); the finish_reason column still shows how close each run came to the 8192 cap.");
}

void main();
