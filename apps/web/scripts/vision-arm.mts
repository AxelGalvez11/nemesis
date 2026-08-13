/**
 * One document, one arm of the vision mini-test.
 *
 * 🔴 IT CALLS THE SAME TWO PRODUCTION FUNCTIONS `parsebench-parse.mts` CALLS —
 * `parseDocument` then `toParseBench` — and it does not touch `lib/vision/gemini.ts`
 * or `lib/pdf/vision.ts`. The whole point of the test is that the vision lane
 * exercised here is the one production runs: the same `visionConfigured` gate,
 * the same model ladder, the same prompt. A bespoke transport would make a
 * negative result unattributable.
 *
 * THE THREE ARMS
 *   off    no key in the environment -> `visionConfigured()` is false. Costs $0.
 *   stub   a fake key AND `fetch` patched to answer the Gemini endpoint from a
 *          canned reply. Proves the pipeline end to end, reaches no network,
 *          costs $0. This is the dry run that must pass before any real call.
 *   live   the real key, real network, real spend.
 *
 * 🔴 EVERY ARM COUNTS THE VISION CALLS, INCLUDING `off`. "We turned it on" and
 * "it was asked for anything" are different facts, and a run that reports the
 * first as the second is how a null result gets read as a capability verdict.
 * The counter wraps `fetch` and matches on the Gemini host, so it counts what
 * left the process rather than what the code intended to send.
 *
 * 🔴 THE KEY IS NEVER PRINTED. It is read from an absolute path, handed to the
 * child environment, and reported only as the boolean `keyPresent`.
 *
 * 🔴 THERE ARE TWO PRODUCTION SHAPES, NOT ONE, AND ONLY ONE OF THEM CAN SPEND
 * ON A PAGE THAT ALREADY HAS TEXT. `parse-thread.ts:88` — the background worker
 * — passes `{ lookAtFigures: true }`; the synchronous upload route deliberately
 * does not, and says why in its own comment. `--figures` selects the worker
 * shape. Running only the default shape would report "vision never fires" about
 * a lane that does fire, on a different trigger, in the lane where the student
 * is not waiting.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/vision-arm.mts <off|stub|live> <file.pdf> [--figures] [--out <path>]
 * Prints one JSON object on stdout. Diagnostics go to stderr.
 *
 * `--out` writes that same object to a file the moment the document finishes.
 * The runner skips a document whose file already exists, so a run killed at
 * document 15 resumes at 16 rather than paying for 1..15 again.
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const positional: string[] = [];
let outPath: string | undefined;
let lookAtFigures = false;
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]!;
  if (arg === "--figures") lookAtFigures = true;
  else if (arg === "--out") outPath = argv[++i];
  else positional.push(arg);
}
const mode = positional[0];
const file = positional[1];
if (!file || !["off", "stub", "live"].includes(mode ?? "")) {
  console.error("usage: vision-arm.mts <off|stub|live> <file.pdf> [--figures] [--out <path>]");
  process.exit(2);
}

const GEMINI_HOST = "generativelanguage.googleapis.com";

/** The env is decided BEFORE the modules that read it are imported. */
if (mode === "off") {
  delete process.env.GEMINI_API_KEY;
} else if (mode === "stub") {
  // Any non-blank string makes `visionConfigured()` true. Nothing reaches the
  // network in this mode, so this value is not a credential.
  process.env.GEMINI_API_KEY = "stub-key-not-a-credential";
} else {
  // 🔴 READ, NEVER COPIED AND NEVER PRINTED. `.env.local` is gitignored and does
  // not exist in a worktree, so this reads the one in the main checkout.
  const envPath = "/Users/axelgalvez/Desktop/AIcodingProjects/nemesis/apps/web/.env.local";
  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("GEMINI_API_KEY="));
  if (!line) {
    console.error("GEMINI_API_KEY not found in .env.local");
    process.exit(3);
  }
  process.env.GEMINI_API_KEY = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

/** What the model would have said. Shaped like a real `generateContent` reply so
 *  the production parser walks the same branches it walks on a live answer.
 *
 *  🔴 IT ANSWERS THE PROMPT IT WAS ACTUALLY SENT. The page lane wants
 *  `[[page N]]` markers and the figure lane wants a numbered list exactly as long
 *  as the batch — `parsePageTranscripts` and `parseFigureDescriptions` both
 *  DISCARD a reply of the wrong shape, so a single generic stub would exercise
 *  the two rejection paths and none of the success paths, and the dry run would
 *  prove the opposite of what it is for. The prompt and the image count are read
 *  out of the request body rather than guessed. */
function stubReply(body: unknown): string {
  const parsed = typeof body === "string" ? (JSON.parse(body) as Record<string, unknown>) : {};
  const parts = ((parsed.contents as { parts?: unknown[] }[] | undefined)?.[0]?.parts ?? []) as Record<string, unknown>[];
  const prompt = parts.map((p) => (typeof p.text === "string" ? p.text : "")).join(" ");
  const images = parts.filter((p) => p.inline_data).length;
  let text: string;
  if (prompt.includes("These are figures taken from")) {
    // One entry per image, or the whole batch is thrown away.
    text = Array.from({ length: images }, (_, i) => `${i + 1}. STUB FIGURE DESCRIPTION ${i + 1} — written by the dry run, not by a model.`).join("\n");
  } else if (prompt.includes("[[page N]]")) {
    text = "[[page 1]]\nSTUB PAGE TRANSCRIPT — written by the dry run, not by a model.";
  } else {
    text = "STUB WHOLE-DOCUMENT TRANSCRIPT — written by the dry run, not by a model.";
  }
  return JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] });
}

let visionCalls = 0;
let visionHttpOk = 0;
/** 🔴 THE BILL, READ OFF THE PROVIDER'S OWN REPLY. A token estimate is a guess;
 *  `usageMetadata` is what Google counted. Reported so actual spend is a
 *  measurement rather than a restatement of the projection. */
const usage = { promptTokens: 0, outputTokens: 0, totalTokens: 0 };
const modelsSeen = new Set<string>();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes(GEMINI_HOST)) return realFetch(input, init);
  visionCalls += 1;
  // The model is in the path: .../models/<model>:generateContent
  const model = /\/models\/([^:/?]+)/.exec(url)?.[1];
  if (model) modelsSeen.add(model);
  if (mode === "stub") {
    visionHttpOk += 1;
    return new Response(stubReply(init?.body), { status: 200, headers: { "content-type": "application/json" } });
  }
  const response = await realFetch(input, init);
  if (response.ok) {
    visionHttpOk += 1;
    // A CLONE: the caller still needs to read this body.
    try {
      const meta = (await response.clone().json())?.usageMetadata;
      if (meta) {
        usage.promptTokens += meta.promptTokenCount ?? 0;
        usage.outputTokens += (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0);
        usage.totalTokens += meta.totalTokenCount ?? 0;
      }
    } catch {
      // Accounting must never break the parse it is measuring.
    }
  }
  return response;
}) as typeof fetch;

// Imported AFTER the environment and fetch are in place.
const { parseDocument } = await import("../lib/notebooks/parse-document.ts");
const { toParseBench } = await import("../lib/pdf/parsebench-output.ts");
const { visionConfigured } = await import("../lib/vision/gemini.ts");

const started = Date.now();
const name = file.split("/").pop() ?? "document.pdf";
const common = {
  arm: mode,
  shape: lookAtFigures ? "worker" : "upload",
  file: name,
  keyPresent: Boolean(process.env.GEMINI_API_KEY?.trim()),
  visionConfigured: visionConfigured(),
};

/** 🔴 WRITTEN THE MOMENT THIS DOCUMENT FINISHES, never accumulated for the end.
 *  Two agent sessions have died mid-run on a watchdog; whatever was paid for
 *  before the death has to still be on disk afterwards. */
function emit(record: unknown): void {
  const json = JSON.stringify(record);
  process.stdout.write(json);
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${json}\n`);
  }
}

try {
  const outcome = await parseDocument(new Uint8Array(readFileSync(file)), name, "application/pdf", {
    lookAtFigures,
  });
  const done = () => ({ ...common, visionCalls, visionHttpOk, usage, models: [...modelsSeen], ms: Date.now() - started });

  if (!outcome.ok) {
    emit({ ...done(), ok: true, empty: true, reason: outcome.reason, layout_pages: [] });
  } else if (!outcome.document.model) {
    emit({ ...done(), ok: true, structural: false, textLength: outcome.document.text.length, layout_pages: [] });
  } else {
    const rendered = toParseBench(outcome.document.model);
    emit({
      ...done(),
      ok: true,
      structural: true,
      readBy: outcome.document.readBy ?? null,
      coverageState: outcome.document.coverage.state,
      units: outcome.document.model.units.length,
      blocks: outcome.document.model.blocks.length,
      textLength: outcome.document.text.length,
      ...rendered,
    });
  }
} catch (cause) {
  emit({
    ...common,
    ok: false,
    reason: "parser-crash",
    detail: cause instanceof Error ? `${cause.name}: ${cause.message.slice(0, 300)}` : String(cause).slice(0, 300),
    visionCalls,
    visionHttpOk,
    usage,
    models: [...modelsSeen],
    ms: Date.now() - started,
  });
}
