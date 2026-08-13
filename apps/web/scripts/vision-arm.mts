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
 * Usage (from apps/web):
 *   npx tsx scripts/vision-arm.mts <off|stub|live> <file.pdf>
 * Prints one JSON object on stdout. Diagnostics go to stderr.
 */

import { readFileSync } from "node:fs";

const mode = process.argv[2];
const file = process.argv[3];
if (!file || !["off", "stub", "live"].includes(mode ?? "")) {
  console.error("usage: vision-arm.mts <off|stub|live> <file.pdf>");
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
 *  the production parser walks the same branches it walks on a live answer. */
const STUB_REPLY = JSON.stringify({
  candidates: [
    {
      content: {
        parts: [
          {
            text:
              "[[page 1]]\nSTUB VISION TEXT — this line was produced by the dry run, not by a model.\n" +
              "It exists to prove the vision branch executed and its text reached the document model.",
          },
        ],
      },
    },
  ],
});

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
    return new Response(STUB_REPLY, { status: 200, headers: { "content-type": "application/json" } });
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
  file: name,
  keyPresent: Boolean(process.env.GEMINI_API_KEY?.trim()),
  visionConfigured: visionConfigured(),
};

try {
  const outcome = await parseDocument(new Uint8Array(readFileSync(file)), name, "application/pdf");
  const done = () => ({ ...common, visionCalls, visionHttpOk, usage, models: [...modelsSeen], ms: Date.now() - started });

  if (!outcome.ok) {
    process.stdout.write(JSON.stringify({ ...done(), ok: true, empty: true, reason: outcome.reason, layout_pages: [] }));
  } else if (!outcome.document.model) {
    process.stdout.write(
      JSON.stringify({ ...done(), ok: true, structural: false, textLength: outcome.document.text.length, layout_pages: [] }),
    );
  } else {
    const rendered = toParseBench(outcome.document.model);
    process.stdout.write(
      JSON.stringify({
        ...done(),
        ok: true,
        structural: true,
        readBy: outcome.document.readBy ?? null,
        coverageState: outcome.document.coverage.state,
        units: outcome.document.model.units.length,
        blocks: outcome.document.model.blocks.length,
        textLength: outcome.document.text.length,
        ...rendered,
      }),
    );
  }
} catch (cause) {
  process.stdout.write(
    JSON.stringify({
      ...common,
      ok: false,
      reason: "parser-crash",
      detail: cause instanceof Error ? `${cause.name}: ${cause.message.slice(0, 300)}` : String(cause).slice(0, 300),
      visionCalls,
      visionHttpOk,
      usage,
      models: [...modelsSeen],
      ms: Date.now() - started,
    }),
  );
}
