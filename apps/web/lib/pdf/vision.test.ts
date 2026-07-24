import assert from "node:assert/strict";

import {
  buildVisionRequest,
  parseVisionText,
  readPdfWithVision,
  visionConfigured,
  visionModels,
  VISION_MAX_BYTES,
  VISION_MODEL_LADDER,
  withinVisionLimit,
} from "./vision";

// --- configuration gate ------------------------------------------------------

// The whole point of the design: with no key this is off, not broken.
assert.equal(visionConfigured({}), false);
assert.equal(visionConfigured({ GEMINI_API_KEY: "" }), false);
assert.equal(visionConfigured({ GEMINI_API_KEY: "   " }), false);
assert.equal(visionConfigured({ GEMINI_API_KEY: "abc" }), true);

// --- model ladder ------------------------------------------------------------

assert.deepEqual(visionModels({}), [...VISION_MODEL_LADDER]);
assert.deepEqual(visionModels({ GEMINI_VISION_MODEL: "gemini-x" }), ["gemini-x"]);
// A blank override must not wipe the ladder out.
assert.deepEqual(visionModels({ GEMINI_VISION_MODEL: "  " }), [...VISION_MODEL_LADDER]);

// --- size gate ---------------------------------------------------------------

assert.equal(withinVisionLimit(1), true);
assert.equal(withinVisionLimit(VISION_MAX_BYTES), true);
assert.equal(withinVisionLimit(VISION_MAX_BYTES + 1), false);
assert.equal(withinVisionLimit(0), false);

// --- request shape -----------------------------------------------------------

{
  const body = JSON.parse(buildVisionRequest("QUJD")) as {
    contents: { parts: ({ inline_data?: { data: string; mime_type: string } } & { text?: string })[] }[];
    generationConfig: { temperature: number };
  };
  const parts = body.contents[0]!.parts;
  assert.equal(parts[0]?.inline_data?.mime_type, "application/pdf");
  assert.equal(parts[0]?.inline_data?.data, "QUJD");
  // Transcription must be literal, so temperature is pinned at 0.
  assert.equal(body.generationConfig.temperature, 0);
  assert.match(parts[1]?.text ?? "", /do not invent/i);
}

// --- response parsing --------------------------------------------------------

assert.equal(
  parseVisionText({ candidates: [{ content: { parts: [{ text: "Page one" }, { text: "Page two" }] } }] }),
  "Page one\nPage two",
);

// A blocked / empty / malformed reply reads as "no text", never as a crash.
assert.equal(parseVisionText(null), "");
assert.equal(parseVisionText({}), "");
assert.equal(parseVisionText({ candidates: [] }), "");
assert.equal(parseVisionText({ candidates: [{ finishReason: "SAFETY" }] }), "");
assert.equal(parseVisionText({ candidates: [{ content: { parts: [{ inline_data: { data: "x" } }] } }] }), "");
assert.equal(parseVisionText({ candidates: [{ content: { parts: [{ text: "   " }] } }] }), "");

const KEYED = { GEMINI_API_KEY: "k" };

void (async () => {
  {
    // An unconfigured call resolves to null WITHOUT reaching the network — if this
    // ever fetches, a missing key becomes a 500 on every scanned upload.
    const before = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("vision must not call fetch without a key");
    }) as typeof fetch;
    try {
      assert.equal(await readPdfWithVision(new Uint8Array([1, 2, 3]), { env: {} }), null);
      // Too large is also a silent fall-back, not an upstream failure.
      assert.equal(await readPdfWithVision(new Uint8Array(VISION_MAX_BYTES + 1), { env: KEYED }), null);
    } finally {
      globalThis.fetch = before;
    }
  }

  {
    // A retired model id (404) walks DOWN the ladder rather than giving up.
    const tried: string[] = [];
    const before = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      tried.push(String(url));
      if (tried.length === 1) return new Response("", { status: 404 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "scanned words" }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const result = await readPdfWithVision(new Uint8Array([1]), { env: KEYED });
      assert.equal(result?.text, "scanned words");
      assert.equal(result?.model, VISION_MODEL_LADDER[1]);
      assert.equal(tried.length, 2);
      assert.match(tried[0]!, new RegExp(VISION_MODEL_LADDER[0]));
    } finally {
      globalThis.fetch = before;
    }
  }

  {
    // A real provider error (not a retired id) falls back instead of throwing.
    const before = globalThis.fetch;
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    try {
      assert.equal(await readPdfWithVision(new Uint8Array([1]), { env: KEYED }), null);
    } finally {
      globalThis.fetch = before;
    }
  }

  {
    // A network failure on every rung ends as null, not an unhandled rejection.
    const before = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    try {
      assert.equal(await readPdfWithVision(new Uint8Array([1]), { env: KEYED }), null);
    } finally {
      globalThis.fetch = before;
    }
  }

  {
    // A 200 with no usable text is "nothing found", so the caller keeps its 422.
    const before = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })) as unknown as typeof fetch;
    try {
      assert.equal(await readPdfWithVision(new Uint8Array([1]), { env: KEYED }), null);
    } finally {
      globalThis.fetch = before;
    }
  }

  console.log("vision.test.ts OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
