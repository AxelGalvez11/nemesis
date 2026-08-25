import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readImage, visionConfigured } from "./read";

// What this file proves: the ORDER (DeepSeek first, Gemini on failure), the routing facts that
// keep it honest (HEIC never wastes a DeepSeek call), and that exactly one spend row leaves the
// door, priced from the meter when there is one. Fetch is mocked by HOST, the same technique
// gemini's and pdf/vision's tests already use.

const PNG = new Uint8Array([137, 80, 78, 71]);
const BOTH = { DEEPSEEK_API_KEY: "dk", GEMINI_API_KEY: "gk" };

function fakeAdmin(rows: unknown[]): SupabaseClient {
  return {
    from: () => ({
      insert: (row: unknown) => {
        rows.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;
}

function deepseekReply(text: string) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: text } }],
    usage: { completion_tokens: 100, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 500, prompt_tokens: 500 },
  }), { status: 200 });
}

function geminiReply(text: string) {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
}

async function withFetch<T>(stub: (url: string) => Response | Promise<Response>, run: () => Promise<T>): Promise<{ calls: string[]; result: T }> {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return stub(url);
  }) as typeof fetch;
  try {
    return { calls, result: await run() };
  } finally {
    globalThis.fetch = original;
  }
}

test("🔴 DeepSeek answers first when both doors are open, and one token-priced row is written", async () => {
  const rows: unknown[] = [];
  const { calls, result } = await withFetch(
    (url) => (url.includes("api.deepseek.com") ? deepseekReply("read it") : geminiReply("never")),
    () => readImage(PNG, "image/png", {
      env: BOTH,
      prompt: "p",
      spend: { admin: fakeAdmin(rows), scope: { operation: "occlusion" }, userId: "u1" },
    }),
  );
  assert.equal(result?.provider, "deepseek");
  assert.equal(result?.text, "read it");
  assert.equal(calls.length, 1, "Gemini was called even though DeepSeek answered");
  assert.equal(rows.length, 1);
  const meta = (rows[0] as { event_type: string; metadata: Record<string, unknown> });
  assert.equal(meta.event_type, "ai_spend_deepseek_vision");
  assert.equal(meta.metadata.priced, true);
  assert.equal(meta.metadata.input_tokens, 500);
  assert.equal(meta.metadata.output_tokens, 100);
  // 500 input @ $0.44/M + 100 output @ $1.32/M = 0.00022 + 0.000132
  assert.equal(meta.metadata.cost_usd, 0.000352);
});

test("🔴🔴🔴 `prefer: gemini` asks Gemini FIRST, and never wakes DeepSeek when it answers", async () => {
  // 🔴 THIS OPTION IS THE LINE THAT MADE IMAGE OCCLUSION WORK, and the reason is latency, not
  // quality. DeepSeek REASONS over an image before answering — `deepseek.ts` records a diagram
  // that burned 18,642 output tokens and **135 seconds** enumerating printed labels. A labelled
  // diagram is exactly that pathological case, and "list the labelled boxes" is exactly the
  // question where reasoning buys nothing. Measured live on the nephron figure, 2026-08-25:
  // DeepSeek-first took 34s on a good run and blew a 38s budget on the next one.
  const { calls, result } = await withFetch(
    (url) => (url.includes("api.deepseek.com") ? deepseekReply("slow one") : geminiReply("boxes")),
    () => readImage(PNG, "image/png", { env: BOTH, prefer: "gemini", prompt: "p" }),
  );
  assert.equal(result?.provider, "gemini");
  assert.equal(result?.text, "boxes");
  assert.equal(calls.length, 1, "DeepSeek was called even though Gemini answered");
  assert.ok(!calls[0]!.includes("api.deepseek.com"), "the slow provider was tried first anyway");
});

test("🔴🔴 `prefer` is a preference, not a lock — the other provider still catches a failure", async () => {
  // A Gemini outage must cost latency, never the feature.
  const { result } = await withFetch(
    (url) => (url.includes("api.deepseek.com") ? deepseekReply("deepseek caught it") : new Response("{}", { status: 500 })),
    () => readImage(PNG, "image/png", { env: BOTH, prefer: "gemini", prompt: "p" }),
  );
  assert.equal(result?.provider, "deepseek");
  assert.equal(result?.text, "deepseek caught it");
});

test("🔴 the default is unchanged, so every existing caller reads exactly as it did", async () => {
  const { result } = await withFetch(
    (url) => (url.includes("api.deepseek.com") ? deepseekReply("still first") : geminiReply("no")),
    () => readImage(PNG, "image/png", { env: BOTH, prompt: "p" }),
  );
  assert.equal(result?.provider, "deepseek", "omitting `prefer` changed which provider answers");
});

test("🔴 a DeepSeek failure degrades to Gemini, and the row says who actually answered", async () => {
  const rows: unknown[] = [];
  const { calls, result } = await withFetch(
    (url) => (url.includes("api.deepseek.com") ? new Response("{}", { status: 500 }) : geminiReply("gemini read it")),
    () => readImage(PNG, "image/png", {
      env: BOTH,
      prompt: "p",
      spend: { admin: fakeAdmin(rows), scope: { operation: "handwriting" }, userId: "u1" },
    }),
  );
  assert.equal(result?.provider, "gemini");
  assert.equal(result?.text, "gemini read it");
  assert.ok(calls.length >= 2, "the fallback never ran");
  const meta = (rows[0] as { event_type: string });
  assert.equal(meta.event_type, "ai_spend_gemini_vision");
});

test("🔴 HEIC skips DeepSeek entirely — no wasted request before the provider that can read it", async () => {
  const { calls, result } = await withFetch(
    (url) => (url.includes("api.deepseek.com")
      ? new Response("{}", { status: 400 })
      : geminiReply("heic read")),
    () => readImage(PNG, "image/heic", { env: BOTH, prompt: "p" }),
  );
  assert.equal(result?.provider, "gemini");
  assert.ok(calls.every((url) => !url.includes("api.deepseek.com")), "a HEIC reached DeepSeek");
});

test("no spend context means no row and still a working read", async () => {
  const { result } = await withFetch(
    () => deepseekReply("free read"),
    () => readImage(PNG, "image/png", { env: BOTH, prompt: "p" }),
  );
  assert.equal(result?.text, "free read");
});

test("configured is either door: DeepSeek-only, Gemini-only, both, neither", () => {
  assert.equal(visionConfigured({}), false);
  assert.equal(visionConfigured({ DEEPSEEK_API_KEY: "dk" }), true);
  assert.equal(visionConfigured({ GEMINI_API_KEY: "gk" }), true);
  assert.equal(visionConfigured(BOTH), true);
});
