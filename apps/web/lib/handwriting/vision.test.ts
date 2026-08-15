import assert from "node:assert/strict";

import {
  analyzeHandwriting,
  HANDWRITING_OBSERVATION_PROMPT,
  parseHandwritingObservation,
} from "./vision";

// --- the prompt actually states the mandate ----------------------------------
//
// 🔴 CALIBRATION: delete the "Do not grade" sentence from HANDWRITING_OBSERVATION_PROMPT in
// vision.ts and this block reddens. Restored before committing — see the task report.

{
  assert.match(HANDWRITING_OBSERVATION_PROMPT, /do not grade/i);
  assert.match(HANDWRITING_OBSERVATION_PROMPT, /correct/i);
  assert.match(HANDWRITING_OBSERVATION_PROMPT, /only json/i);
  assert.match(HANDWRITING_OBSERVATION_PROMPT, /abstained/i);
  // The prompt must not itself hand the model a list of things to look for — see the file header
  // on why that would lead the witness. This is a smoke check that nobody added one later.
  assert.doesNotMatch(HANDWRITING_OBSERVATION_PROMPT, /expected element/i);
}

// --- parseHandwritingObservation: the happy path -----------------------------

{
  const reply = JSON.stringify({
    abstained: false,
    items: [
      { confidence: 0.9, kind: "text", text: "Na+ enters the cell" },
      { confidence: 0.6, kind: "drawing", text: "an arrow pointing right" },
    ],
    spatialRelations: ["the arrow points from the left label to the right label"],
    transcription: "Na+ enters the cell",
    transcriptionConfidence: 0.85,
  });
  const observation = parseHandwritingObservation(reply, "gemini-3.5-flash");
  assert.equal(observation.abstained, false);
  assert.equal(observation.abstentionReason, null);
  assert.equal(observation.transcription, "Na+ enters the cell");
  assert.equal(observation.transcriptionConfidence, 0.85);
  assert.equal(observation.model, "gemini-3.5-flash");
  assert.deepEqual(observation.items, [
    { confidence: 0.9, kind: "text", text: "Na+ enters the cell" },
    { confidence: 0.6, kind: "drawing", text: "an arrow pointing right" },
  ]);
  assert.deepEqual(observation.spatialRelations, [
    "the arrow points from the left label to the right label",
  ]);
}

// A code-fenced reply — the shape a real model sometimes wraps JSON in — still parses, via the
// same jsonFrom @nemesis/shared already uses for occlusion boxes.
{
  const fenced = "```json\n" + JSON.stringify({
    abstained: false,
    items: [],
    spatialRelations: [],
    transcription: "hello",
    transcriptionConfidence: 0.5,
  }) + "\n```";
  const observation = parseHandwritingObservation(fenced, "m");
  assert.equal(observation.transcription, "hello");
}

// --- 🔴 CALIBRATION: malformed JSON becomes abstention, never a fabricated observation ----------
//
// Break this by making parseHandwritingObservation return a default-empty-but-NOT-abstained
// observation on a jsonFrom failure (e.g. `abstained: false` in the catch branch) — this test
// reddens immediately, because a caller can no longer tell "the model tried and could not read
// it" apart from "our own parser choked on the reply".

{
  const observation = parseHandwritingObservation("this is not JSON at all", "m");
  assert.equal(observation.abstained, true, "unparseable text must abstain, not silently report nothing");
  assert.ok(observation.abstentionReason, "an abstention must say why, even a generic reason");
  assert.equal(observation.transcription, "");
  assert.deepEqual(observation.items, []);
}
{
  // Valid JSON, but not an object (an array, a bare string) — same treatment.
  assert.equal(parseHandwritingObservation("[1,2,3]", "m").abstained, true);
  assert.equal(parseHandwritingObservation("\"just a string\"", "m").abstained, true);
}

// --- a model-declared abstention is believed completely ----------------------
//
// 🔴 CALIBRATION: change the abstained branch in vision.ts to keep `record.transcription` instead
// of forcing "" — this test reddens, proving the guard actually discards a model's own hedge
// rather than only checking a field that happens to already be empty.

{
  const reply = JSON.stringify({
    abstained: true,
    abstentionReason: "the photo is too dark to read",
    items: [{ confidence: 0.3, kind: "text", text: "partial guess" }],
    transcription: "a guess at what this might say",
  });
  const observation = parseHandwritingObservation(reply, "m");
  assert.equal(observation.abstained, true);
  assert.equal(observation.abstentionReason, "the photo is too dark to read");
  assert.equal(observation.transcription, "", "an abstaining model's own transcription must be discarded, not kept as a hedge");
  assert.deepEqual(observation.items, [], "an abstaining model's own items must be discarded");
}

// Abstained with no reason given still produces a usable, non-empty reason.
{
  const observation = parseHandwritingObservation(JSON.stringify({ abstained: true }), "m");
  assert.equal(observation.abstained, true);
  assert.ok(observation.abstentionReason && observation.abstentionReason.length > 0);
}

// --- confidence is refused, not clamped, when out of range -------------------

{
  const reply = JSON.stringify({
    abstained: false,
    items: [{ confidence: 95, kind: "text", text: "x" }], // a percentage, not a fraction
    spatialRelations: [],
    transcription: "x",
    transcriptionConfidence: -1,
  });
  const observation = parseHandwritingObservation(reply, "m");
  assert.equal(observation.transcriptionConfidence, null, "an out-of-range confidence must be dropped, never clamped into a false certainty");
  assert.equal(observation.items[0]!.confidence, null);
}

// --- items: unusable rows are dropped, not fabricated -------------------------

{
  const reply = JSON.stringify({
    abstained: false,
    items: [
      { text: "" }, // no text — not an observation of anything
      { text: "   " }, // whitespace only
      { text: "real item" },
      "not even an object",
      { kind: "drawing", text: "a circle" },
      { kind: "something-else", text: "unknown kind defaults to text" },
    ],
    spatialRelations: [],
    transcription: "",
    transcriptionConfidence: null,
  });
  const observation = parseHandwritingObservation(reply, "m");
  assert.deepEqual(
    observation.items.map((item) => item.text),
    ["real item", "a circle", "unknown kind defaults to text"],
  );
  assert.equal(observation.items[1]!.kind, "drawing");
  assert.equal(observation.items[2]!.kind, "text", "an unrecognised kind must default to text, never crash or drop the row");
}

// --- analyzeHandwriting: infra failure vs. abstention are different code paths ------------------

void (async () => {
  {
    // No key configured: must resolve null WITHOUT reaching the network. If this ever calls
    // fetch, a missing key becomes a live request instead of a silent, cheap fallback.
    const before = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("analyzeHandwriting must not call fetch without a key");
    }) as typeof fetch;
    try {
      const result = await analyzeHandwriting(new Uint8Array([1, 2, 3]), "image/png", { env: {} });
      assert.equal(result, null, "an unconfigured call is an infra failure (null), not an abstained observation");
    } finally {
      globalThis.fetch = before;
    }
  }

  {
    // A real reply flows all the way through: fetch -> readWithVision -> parseHandwritingObservation.
    const before = globalThis.fetch;
    const payload = {
      abstained: false,
      items: [{ confidence: 0.8, kind: "text", text: "ATP" }],
      spatialRelations: [],
      transcription: "ATP",
      transcriptionConfidence: 0.7,
    };
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
        { status: 200 },
      )) as unknown as typeof fetch;
    try {
      const result = await analyzeHandwriting(new Uint8Array([1]), "image/png", { env: { GEMINI_API_KEY: "k" } });
      assert.equal(result?.transcription, "ATP");
      assert.equal(result?.abstained, false);
      assert.ok(result?.model);
    } finally {
      globalThis.fetch = before;
    }
  }

  {
    // A provider outage is also an infra failure (null), never surfaced as "abstained: true" —
    // those two must stay distinguishable so a caller can offer "try again" for one and "type
    // instead" for the other.
    const before = globalThis.fetch;
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    try {
      const result = await analyzeHandwriting(new Uint8Array([1]), "image/png", { env: { GEMINI_API_KEY: "k" } });
      assert.equal(result, null);
    } finally {
      globalThis.fetch = before;
    }
  }

  console.log("handwriting/vision.test.ts OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
