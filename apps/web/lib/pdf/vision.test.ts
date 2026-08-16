import assert from "node:assert/strict";

import {
  VISION_MAX_BYTES,
  VISION_MODEL_LADDER,
  buildFigureRequest,
  buildVisionRequest,
  describeFiguresWithVision,
  parseFigureDescriptions,
  parseVisionText,
  readFiguresWithVision,
  readPdfWithVision,
  visionConfigured,
  visionModels,
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


// --- reading slide figures ---------------------------------------------------
// A batched reply is matched to its images BY ORDER, so the parse either lines up
// exactly or is thrown away. A description pinned to the wrong diagram would be a
// confident, wrong caption on an unrelated figure — worse than having none.

assert.deepEqual(parseFigureDescriptions("1. A flow chart of the RAAS pathway.\n2. A dose-response curve.", 2), [
  "A flow chart of the RAAS pathway.",
  "A dose-response curve.",
]);

// A wrapped description is one entry, not two.
{
  const parsed = parseFigureDescriptions("1. A flow chart\nshowing renin acting on angiotensinogen.\n2. A curve.", 2);
  assert.equal(parsed?.length, 2);
  assert.match(parsed![0]!, /A flow chart showing renin/);
}

// "none" is how a logo that slipped past the size filter contributes nothing.
assert.deepEqual(parseFigureDescriptions("1. none\n2. A labelled nephron.", 2), ["", "A labelled nephron."]);

// Wrong count in either direction: discard, never match up optimistically.
assert.equal(parseFigureDescriptions("1. Only one description.", 3), null);
assert.equal(parseFigureDescriptions("1. One\n2. Two\n3. Three\n4. Four", 3), null);
assert.equal(parseFigureDescriptions("Here are the figures you asked about.", 2), null);
// Asking about nothing succeeds with nothing; it is not a failure.
assert.deepEqual(parseFigureDescriptions("", 0), []);
// Both numbering styles models actually emit.
assert.equal(parseFigureDescriptions("1) First figure here.\n2) Second figure here.", 2)?.length, 2);

{
  const body = JSON.parse(buildFigureRequest([
    { base64: "AAA", mime: "image/png" },
    { base64: "BBB", mime: "image/jpeg" },
  ])) as { contents: Array<{ parts: Array<Record<string, unknown>> }>; generationConfig: { temperature: number } };
  const parts = body.contents[0]!.parts;
  assert.equal(parts.length, 3, "two images and one instruction");
  assert.equal((parts[1]!.inline_data as { mime_type: string }).mime_type, "image/jpeg");
  assert.match(String(parts[2]!.text), /numbered list/i);
  // Descriptions must not drift between imports of the same deck.
  assert.equal(body.generationConfig.temperature, 0);
}

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
    //
    // 🔴 THE FIXTURE USED TO BE AN EMPTY-BODIED 404, AND THAT WAS THE WRONG SHAPE FOR
    // "retired". Measured against the live API 2026-08-15/16: a genuinely retired model
    // answers 404 WITH a body naming itself (Google's real shape, reproduced below); a
    // completely EMPTY-bodied 404 was observed as a ~1-minute TRANSIENT upstream blip
    // that recovered on its own. This test is about the retired-model case, so its
    // fixture must carry a body — see vision-budget.test.ts for the empty-body/transient
    // twin, which is the discriminating pair this distinction depends on.
    const tried: string[] = [];
    const before = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      tried.push(String(url));
      if (tried.length === 1) {
        return new Response(
          JSON.stringify({ error: { code: 404, message: "This model is no longer available to new users.", status: "NOT_FOUND" } }),
          { status: 404 },
        );
      }
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
    // 🔴 500 is TRANSIENT (see classifyVisionFailure), so this fixture now exercises a
    // real retry-with-backoff on every rung before giving up — this test takes on the
    // order of a couple of real seconds rather than being instant. The end state (null)
    // is what it always asserted; vision-budget.test.ts calibrates the timing itself.
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
    // 🔴 A THROW IS ALSO TRANSIENT NOW (it used to walk the ladder with no retry at
    // all) — same real-backoff cost as the 500 case above, same unchanged end state.
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

  {
    // Unconfigured and empty-input both yield no descriptions rather than throwing,
    // so a deck still imports with exactly its old text-only behaviour.
    assert.equal((await describeFiguresWithVision([{ bytes: new Uint8Array([1]), mime: "image/png", name: "a.png" }], { env: {} })).size, 0);
    assert.equal((await describeFiguresWithVision([], { env: KEYED })).size, 0);
  }

  {
    // One failed batch loses its own descriptions and nothing else.
    // 🔴 Also now a real retry-with-backoff (500 is transient) before it gives up.
    const before = globalThis.fetch;
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    try {
      const out = await describeFiguresWithVision([{ bytes: new Uint8Array([1]), mime: "image/png", name: "a.png" }], { env: KEYED });
      assert.equal(out.size, 0);
    } finally {
      globalThis.fetch = before;
    }
  }

  {
    // A good reply is keyed by the caller's own image names, not by position.
    const before = globalThis.fetch;
    const reply = { candidates: [{ content: { parts: [{ text: "1. A nephron diagram.\n2. none" }] } }] };
    globalThis.fetch = (async () => new Response(JSON.stringify(reply), { status: 200 })) as unknown as typeof fetch;
    try {
      const out = await describeFiguresWithVision(
        [
          { bytes: new Uint8Array([1]), mime: "image/png", name: "ppt/media/image1.png" },
          { bytes: new Uint8Array([2]), mime: "image/png", name: "ppt/media/image2.png" },
        ],
        { env: KEYED },
      );
      assert.equal(out.get("ppt/media/image1.png"), "A nephron diagram.");
      assert.equal(out.has("ppt/media/image2.png"), false, "a 'none' figure adds nothing");
    } finally {
      globalThis.fetch = before;
    }
  }

  // --- readFiguresWithVision: labels, the half describeFiguresWithVision throws away (§46.6) -----
  // 🔴 NOTHING EXERCISED `.labels` BEFORE THIS. Every existing test above calls
  // `describeFiguresWithVision`, which keeps only `.descriptions` — so a regression in the labels
  // half of this exact reply could ship with every one of them still green.

  {
    // A labelled diagram: prose AND named parts come back off the SAME reply.
    const before = globalThis.fetch;
    const reply = {
      candidates: [{
        content: {
          parts: [{
            text:
              "1. A nephron with its major segments labelled.\n" +
              "LABELS: Glomerulus@0.3,0.2;Loop of Henle@0.5,0.6;Collecting duct@0.7,0.85\n" +
              "2. A stock photo of a clinic waiting room.",
          }],
        },
      }],
    };
    globalThis.fetch = (async () => new Response(JSON.stringify(reply), { status: 200 })) as unknown as typeof fetch;
    try {
      const out = await readFiguresWithVision(
        [
          { bytes: new Uint8Array([1]), mime: "image/png", name: "nephron.png" },
          { bytes: new Uint8Array([2]), mime: "image/png", name: "waiting-room.png" },
        ],
        { env: KEYED },
      );
      assert.equal(out.descriptions.get("nephron.png"), "A nephron with its major segments labelled.");
      assert.deepEqual(out.labels.get("nephron.png"), [
        { text: "Glomerulus", x: 0.3, y: 0.2 },
        { text: "Loop of Henle", x: 0.5, y: 0.6 },
        { text: "Collecting duct", x: 0.7, y: 0.85 },
      ]);
      // 🔴 THE NEGATIVE CASE MATTERS AS MUCH AS THE POSITIVE ONE. A figure with prose and no LABELS
      // line must produce NO entry in `.labels` at all — never an invented empty array a caller
      // could mistake for "examined, zero labels" instead of "not a labelled diagram".
      assert.equal(out.descriptions.get("waiting-room.png"), "A stock photo of a clinic waiting room.");
      assert.equal(out.labels.has("waiting-room.png"), false);
    } finally {
      globalThis.fetch = before;
    }
  }

  {
    // describeFiguresWithVision is the thin wrapper `figure-look.ts` used to call for PDFs — it
    // must still return prose only, so every existing caller of it is unaffected by the labels work.
    const before = globalThis.fetch;
    const reply = {
      candidates: [{ content: { parts: [{ text: "1. A nephron.\nLABELS: Glomerulus@0.3,0.2;Loop of Henle@0.5,0.6" }] } }],
    };
    globalThis.fetch = (async () => new Response(JSON.stringify(reply), { status: 200 })) as unknown as typeof fetch;
    try {
      const out = await describeFiguresWithVision([{ bytes: new Uint8Array([1]), mime: "image/png", name: "a.png" }], { env: KEYED });
      assert.equal(out.get("a.png"), "A nephron.");
    } finally {
      globalThis.fetch = before;
    }
  }

  console.log("vision.test.ts OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
