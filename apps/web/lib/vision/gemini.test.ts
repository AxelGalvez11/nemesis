import assert from "node:assert/strict";
import {
  buildVisionRequest,
  PHOTO_PROMPT,
  parseVisionText,
  visionConfigured,
  visionMime,
  visionModels,
  VISION_MAX_BYTES,
  VISION_MODEL_LADDER,
  withinVisionLimit,
} from "./gemini";

// visionConfigured: the key, and only the key, decides.
{
  assert.equal(visionConfigured({}), false);
  assert.equal(visionConfigured({ GEMINI_API_KEY: "" }), false);
  assert.equal(visionConfigured({ GEMINI_API_KEY: "   " }), false, "whitespace is not a key");
  assert.equal(visionConfigured({ GEMINI_API_KEY: "abc" }), true);
}

// visionModels: the ladder by default, an override when one is set.
{
  assert.deepEqual(visionModels({}), [...VISION_MODEL_LADDER]);
  assert.deepEqual(visionModels({ GEMINI_VISION_MODEL: "gemini-3-flash" }), ["gemini-3-flash"]);
  assert.deepEqual(visionModels({ GEMINI_VISION_MODEL: "  " }), [...VISION_MODEL_LADDER], "blank override is ignored");
  assert.ok(VISION_MODEL_LADDER.length > 1, "a ladder of one cannot survive a retired model id");
}

// withinVisionLimit: an empty file is not readable, and the ceiling is inclusive.
{
  assert.equal(withinVisionLimit(0), false);
  assert.equal(withinVisionLimit(1), true);
  assert.equal(withinVisionLimit(VISION_MAX_BYTES), true);
  assert.equal(withinVisionLimit(VISION_MAX_BYTES + 1), false);
}

// visionMime: the declared type wins when we recognise it.
{
  assert.equal(visionMime("slide.png", "image/png"), "image/png");
  assert.equal(visionMime("IMG_0001.HEIC", "image/heic"), "image/heic");
  assert.equal(visionMime("photo.JPG", "IMAGE/JPEG"), "image/jpeg", "mime match is case-insensitive");
}
{
  // …and the filename is the fallback when the browser lies or says nothing.
  // Safari hands up an empty type for a HEIC picked from Files; some Android
  // pickers report octet-stream for an ordinary JPEG.
  assert.equal(visionMime("IMG_0001.heic", ""), "image/heic");
  assert.equal(visionMime("scan.jpg", "application/octet-stream"), "image/jpeg");
  assert.equal(visionMime("board.WEBP", ""), "image/webp");
}
{
  // image/jpg is not a real mime type but plenty of tools write it.
  assert.equal(visionMime("photo.bin", "image/jpg"), "image/jpeg");
}
{
  // Not an image, or an image format we deliberately refuse.
  assert.equal(visionMime("notes.pdf", "application/pdf"), null);
  assert.equal(visionMime("logo.svg", "image/svg+xml"), null, "SVG is script-capable and never a photo");
  assert.equal(visionMime("clip.gif", "image/gif"), null, "the bucket does not accept GIF either");
  assert.equal(visionMime("nameless", ""), null);
}

// buildVisionRequest: the mime type reaches the wire unchanged. A HEIC sent as
// image/jpeg is rejected by Gemini, so hardcoding a type here would break the
// single most common input the iPhone camera produces.
{
  type Part = { inline_data?: { data: string; mime_type: string }; text?: string };
  const body = JSON.parse(buildVisionRequest("QUJD", "image/heic", PHOTO_PROMPT)) as {
    contents: [{ parts: [Part, Part] }];
    generationConfig: { temperature: number };
  };
  const [inline, instruction] = body.contents[0].parts;
  assert.equal(inline.inline_data?.mime_type, "image/heic");
  assert.equal(inline.inline_data?.data, "QUJD");
  assert.equal(instruction.text, PHOTO_PROMPT);
  assert.equal(body.generationConfig.temperature, 0, "a drifting transcript is a corrupted note");
}

// The photo prompt has to carry both halves of the job: transcribe text, and
// describe a picture that has no text. Losing either arm silently changes what
// the camera does.
{
  assert.match(PHOTO_PROMPT, /transcribe/i);
  assert.match(PHOTO_PROMPT, /describe/i);
  assert.match(PHOTO_PROMPT, /do not invent/i);
}

// parseVisionText: joins every text part across candidates.
{
  const payload = {
    candidates: [
      { content: { parts: [{ text: "Page one" }, { text: "Page two" }] } },
      { content: { parts: [{ text: "Page three" }] } },
    ],
  };
  assert.equal(parseVisionText(payload), "Page one\nPage two\nPage three");
}
{
  // Blocked, empty, and malformed replies all read as "nothing found" rather
  // than throwing — the caller's fallback is the same in every case.
  assert.equal(parseVisionText(null), "");
  assert.equal(parseVisionText("nope"), "");
  assert.equal(parseVisionText({}), "");
  assert.equal(parseVisionText({ candidates: [] }), "");
  assert.equal(parseVisionText({ candidates: [{ finishReason: "SAFETY" }] }), "");
  assert.equal(parseVisionText({ candidates: [{ content: { parts: [{ text: "   " }] } }] }), "");
  assert.equal(parseVisionText({ candidates: [{ content: { parts: [{ inline_data: {} }] } }] }), "");
}
