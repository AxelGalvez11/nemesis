/**
 * A FRESH vision read of a diagram, through the shipped ladder, timed.
 *
 * Usage, from apps/web:
 *   pnpm tsx --env-file=<path>/.env.local scripts/vision-fresh-probe.ts
 *
 * 🔴 WHY IT EXISTS. I told the owner a fresh read was impossible here because "the vision key is not
 * on this machine". That was wrong: `deepseekVisionConfigured` reads DEEPSEEK_API_KEY and nothing
 * else, and DeepSeek is the ladder's DEFAULT first reader. The question this answers is not whether
 * DeepSeek can see a diagram but what it costs in seconds, which is the reason the occlusion lane
 * passes prefer:"gemini" in the first place.
 */
import { jsonFrom, OCCLUSION_VISION_PROMPT, parseSuggestedBoxes } from "@nemesis/shared";

import { readImage, visionConfigured } from "../lib/vision/read";
import { deepseekVisionConfigured, deepseekVisionModel } from "../lib/vision/deepseek";
import { visionConfigured as geminiConfigured } from "../lib/vision/gemini";

const SRC = "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Diagram_of_the_human_heart_%28cropped%29.svg/1280px-Diagram_of_the_human_heart_%28cropped%29.svg.png";

async function main() {
  console.log("vision configured:", visionConfigured());
  console.log("deepseek vision configured:", deepseekVisionConfigured(), "| model:", deepseekVisionModel());
  // 🔴 THE NAME THE CODE ACTUALLY READS, and only that one. The first version also checked
  // GOOGLE_API_KEY, which nothing in this app reads: `credentials-are-documented.test.ts` caught it
  // as a credential read in code and documented nowhere, which is exactly the confusion it exists
  // to stop — a probe inventing an env var teaches the next person a name that does nothing.
  console.log("gemini key present:", geminiConfigured());

  const res = await fetch(SRC);
  const bytes = new Uint8Array(await res.arrayBuffer());
  console.log(`\nimage: ${(bytes.length / 1024).toFixed(0)} KB\n`);

  // 🔴 SEVERAL SAMPLES, BECAUSE THE COMPLAINT WAS NEVER SPEED, IT WAS VARIANCE. The route's
  // prefer:"gemini" cites "34s on a good run and blew a 38s budget on the next one"; a single fast
  // read does not refute that, and a single slow one does not prove it. The spread is the answer.
  const runs = Number(process.argv[2] ?? 5);
  const times: number[] = [];
  const counts: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const prefer = "deepseek" as const;
    const started = Date.now();
    let read: Awaited<ReturnType<typeof readImage>> = null;
    try {
      read = await readImage(bytes, "image/png", { prefer, prompt: OCCLUSION_VISION_PROMPT });
    } catch (cause) {
      console.log(`run ${run + 1}: threw ${(cause as Error).message}`);
      times.push(-1);
      counts.push(0);
      continue;
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (!read) {
      console.log(`run ${run + 1}: NO ANSWER after ${seconds}s`);
      times.push(Number(seconds));
      counts.push(0);
      continue;
    }
    const boxes = parseSuggestedBoxes(jsonFrom(read.text));
    const out = read.usage?.outputTokens ?? 0;
    times.push(Number(seconds));
    counts.push(boxes.length);
    console.log(`run ${run + 1}: ${read.provider} in ${seconds}s, ${boxes.length} boxes, ${out} output tokens`);
  }

  const ok = times.filter((t, i) => t > 0 && counts[i]! > 0);
  const failed = times.length - ok.length;
  const budget = ok.filter((t) => t > 38).length;
  console.log(`\n${ok.length}/${times.length} usable | slowest ${Math.max(...ok, 0)}s | fastest ${Math.min(...ok, 0)}s`);
  console.log(`over the route's 38s vision budget: ${budget} | no usable answer: ${failed}`);
  console.log(`box counts: ${counts.join(", ")}`);
}

void main();
