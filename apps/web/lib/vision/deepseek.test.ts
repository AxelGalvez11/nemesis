import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEEPSEEK_VISION_MODEL,
  buildDeepseekVisionRequest,
  deepseekReadable,
  deepseekVisionConfigured,
  deepseekVisionModel,
  parseDeepseekVisionReply,
} from "./deepseek";

test("the request is one user message: the image as a data URL, then the prompt", () => {
  const body = JSON.parse(buildDeepseekVisionRequest("QUJD", "image/png", "Read this.", DEEPSEEK_VISION_MODEL));
  assert.equal(body.model, "deepseek-v4-flash-vision-exp");
  assert.equal(body.messages.length, 1);
  const [image, text] = body.messages[0].content;
  assert.equal(image.type, "image_url");
  assert.equal(image.image_url.url, "data:image/png;base64,QUJD");
  assert.equal(text.type, "text");
  assert.equal(text.text, "Read this.");
  // 🔴 THE OUTPUT CEILING RIDES EVERY REQUEST. This model bills its own reasoning as output —
  // one uncapped figure read burned 18,642 tokens enumerating a diagram's fifty labels — so a
  // request without the cap is an unbounded bill. See DEEPSEEK_VISION_MAX_OUTPUT.
  assert.equal(body.max_tokens, 8192);
});

test("🔴 HEIC is not readable, and that routes iPhone photos to the fallback, not to a wasted call", () => {
  assert.equal(deepseekReadable("image/heic"), false);
  assert.equal(deepseekReadable("image/heif"), false);
  assert.equal(deepseekReadable("application/pdf"), false);
  for (const mime of ["image/png", "image/jpeg", "image/webp", "image/gif", " IMAGE/PNG "]) {
    assert.equal(deepseekReadable(mime), true, `${mime} should be readable`);
  }
});

test("configured means a key, and the model id honours its override", () => {
  assert.equal(deepseekVisionConfigured({}), false);
  assert.equal(deepseekVisionConfigured({ DEEPSEEK_API_KEY: "  " }), false);
  assert.equal(deepseekVisionConfigured({ DEEPSEEK_API_KEY: "k" }), true);
  assert.equal(deepseekVisionModel({}), DEEPSEEK_VISION_MODEL);
  assert.equal(deepseekVisionModel({ DEEPSEEK_VISION_MODEL: "deepseek-v5-vision" }), "deepseek-v5-vision");
});

test("the reply parser returns text plus the provider's own token meter", () => {
  const { text, usage } = parseDeepseekVisionReply({
    choices: [{ message: { content: "  A page about enzymes.  " } }],
    usage: { completion_tokens: 210, prompt_cache_hit_tokens: 64, prompt_cache_miss_tokens: 350, prompt_tokens: 414 },
  });
  assert.equal(text, "A page about enzymes.");
  assert.deepEqual(usage, { inputHitTokens: 64, inputMissTokens: 350, outputTokens: 210 });
});

test("🔴 a missing cache split prices every prompt token at the FULL rate — the expensive reading", () => {
  const { usage } = parseDeepseekVisionReply({
    choices: [{ message: { content: "x" } }],
    usage: { completion_tokens: 9, prompt_tokens: 400 },
  });
  assert.deepEqual(usage, { inputHitTokens: 0, inputMissTokens: 400, outputTokens: 9 });
});

test("the parser surfaces the model's own finish_reason, so an empty reply can explain itself", () => {
  // The live capture, 2026-08-30: HTTP 200, finish_reason "length", 8192 tokens billed, no answer.
  // Reasoning ate the whole output cap. The parser must hand the reason through, or the
  // vision_empty_response log line can never distinguish a cap-hit from a genuinely blank reply.
  const capHit = parseDeepseekVisionReply({
    choices: [{ finish_reason: "length", message: { content: "", reasoning_content: "..." } }],
    usage: { completion_tokens: 8192, prompt_tokens: 400 },
  });
  assert.equal(capHit.text, "");
  assert.equal(capHit.finishReason, "length");
  assert.equal(capHit.usage?.outputTokens, 8192);

  const done = parseDeepseekVisionReply({
    choices: [{ finish_reason: "stop", message: { content: "14 boxes" } }],
    usage: { completion_tokens: 3889, prompt_tokens: 400 },
  });
  assert.equal(done.finishReason, "stop");
});

test("malformed replies parse to empty text and no meter, never to a throw", () => {
  for (const payload of [null, "text", [], {}, { choices: [] }, { choices: [{ message: {} }] }]) {
    const { finishReason, text, usage } = parseDeepseekVisionReply(payload);
    assert.equal(text, "");
    assert.equal(finishReason, "");
    assert.equal(usage, null);
  }
});
