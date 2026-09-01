import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readImage, visionConfigured } from "./read";

// What this file proves: the ORDER (Gemini first, DeepSeek on failure), the routing facts that
// keep it honest (HEIC never wastes a DeepSeek call), and that exactly one spend row leaves the
// door, priced from the meter when there is one. Fetch is mocked by HOST, the same technique
// gemini's and pdf/vision's tests already use.
//
// 🔴 THE ORDER WAS DEEPSEEK-FIRST UNTIL 2026-08-31 AND EVERY ASSERTION BELOW SAID SO. It was
// reversed by the owner ("use Gemini") after three lanes had each independently opted out of the
// default: figure-occlusion passed `prefer: "gemini"`, the parse lane never used this door at all,
// and the PDF figure describer went to Gemini directly. The measurement behind all three is in
// read.ts's header — DeepSeek bills its own reasoning as output, so a diagram costs what the model
// finds difficult rather than what it says. These tests are repointed, not deleted: the pair that
// pins the DEFAULT is the pair that catches a silent flip back.

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

test("🔴🔴🔴 Gemini answers first when both doors are open, and DeepSeek is never woken", async () => {
  // 🔴 THE DEFAULT IS THE WHOLE ASSERTION. `prefer: "gemini"` existed for a year before this and
  // exactly ONE call site passed it, so every camera photo, handwriting page and notebook read
  // still went the expensive way. Pinning the option without pinning the default is what let that
  // stand, so this test omits `prefer` on purpose.
  const rows: unknown[] = [];
  const { calls, result } = await withFetch(
    (url) => (url.includes("api.deepseek.com") ? deepseekReply("never") : geminiReply("read it")),
    () => readImage(PNG, "image/png", {
      env: BOTH,
      prompt: "p",
      spend: { admin: fakeAdmin(rows), scope: { operation: "occlusion" }, userId: "u1" },
    }),
  );
  assert.equal(result?.provider, "gemini");
  assert.equal(result?.text, "read it");
  assert.equal(calls.length, 1, "DeepSeek was called even though Gemini answered");
  assert.ok(!calls[0]!.includes("api.deepseek.com"), "the reasoning provider was tried first anyway");
  assert.equal(rows.length, 1);
  assert.equal((rows[0] as { event_type: string }).event_type, "ai_spend_gemini_vision");
});

test("🔴🔴 `prefer: deepseek` still reaches DeepSeek first, and one token-priced row is written", async () => {
  // The price comparison that originally chose DeepSeek is still true for the case it was measured
  // on: TRANSCRIBING a dense page is mostly output tokens and DeepSeek's output rate is a third of
  // Google's. A lane reading words rather than interpreting a picture may still ask for it, and
  // the token meter it reports is what makes that row priced rather than estimated.
  const rows: unknown[] = [];
  const { calls, result } = await withFetch(
    (url) => (url.includes("api.deepseek.com") ? deepseekReply("transcribed") : geminiReply("never")),
    () => readImage(PNG, "image/png", {
      env: BOTH,
      prefer: "deepseek",
      prompt: "p",
      spend: { admin: fakeAdmin(rows), scope: { operation: "handwriting" }, userId: "u1" },
    }),
  );
  assert.equal(result?.provider, "deepseek");
  assert.equal(result?.text, "transcribed");
  assert.equal(calls.length, 1, "Gemini was called even though DeepSeek answered");
  const meta = (rows[0] as { event_type: string; metadata: Record<string, unknown> });
  assert.equal(meta.event_type, "ai_spend_deepseek_vision");
  assert.equal(meta.metadata.priced, true);
  assert.equal(meta.metadata.input_tokens, 500);
  assert.equal(meta.metadata.output_tokens, 100);
  // 500 input @ $0.44/M + 100 output @ $1.32/M = 0.00022 + 0.000132
  assert.equal(meta.metadata.cost_usd, 0.000352);
});

test("🔴🔴 `prefer` is a preference, not a lock — the other provider still catches a failure", async () => {
  // A DeepSeek outage must cost latency, never the feature.
  const { result } = await withFetch(
    (url) => (url.includes("api.deepseek.com") ? new Response("{}", { status: 500 }) : geminiReply("gemini caught it")),
    () => readImage(PNG, "image/png", { env: BOTH, prefer: "deepseek", prompt: "p" }),
  );
  assert.equal(result?.provider, "gemini");
  assert.equal(result?.text, "gemini caught it");
});

test("🔴 a Gemini failure degrades to DeepSeek, and the row says who actually answered", async () => {
  const rows: unknown[] = [];
  const { calls, result } = await withFetch(
    (url) => (url.includes("api.deepseek.com") ? deepseekReply("deepseek read it") : new Response("{}", { status: 500 })),
    () => readImage(PNG, "image/png", {
      env: BOTH,
      prompt: "p",
      spend: { admin: fakeAdmin(rows), scope: { operation: "handwriting" }, userId: "u1" },
    }),
  );
  assert.equal(result?.provider, "deepseek");
  assert.equal(result?.text, "deepseek read it");
  assert.ok(calls.length >= 2, "the fallback never ran");
  const meta = (rows[0] as { event_type: string });
  assert.equal(meta.event_type, "ai_spend_deepseek_vision");
});

test("🔴 HEIC skips DeepSeek entirely, EVEN AS THE FALLBACK — it cannot read the format at all", async () => {
  // 🔴 GEMINI IS MADE TO FAIL HERE ON PURPOSE. With Gemini first, a HEIC that Gemini reads never
  // reaches the question, so a stub where Gemini succeeds would pass without proving anything.
  // The claim worth pinning is about the FALLBACK: DeepSeek refuses HEIC locally, so even the
  // degraded path must not spend a round trip discovering that. iPhone photos are the format
  // students actually drop, so this is the common case, not an edge one.
  const { calls, result } = await withFetch(
    (url) => (url.includes("api.deepseek.com")
      ? deepseekReply("should never be asked")
      : new Response("{}", { status: 500 })),
    () => readImage(PNG, "image/heic", { env: BOTH, prompt: "p" }),
  );
  assert.equal(result, null, "DeepSeek answered a format it cannot decode");
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
