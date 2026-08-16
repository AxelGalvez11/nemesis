/**
 * What a figure's ABSENCE of a description is allowed to claim.
 *
 * 🔴 THE VOCABULARY IS THE PRODUCT HERE. `examined-empty` says a model looked at this picture
 * and had nothing to report — a verdict. `vision-unavailable` says no usable read of it exists.
 * Both leave the figure undescribed, and downstream they are the difference between "this
 * diagram carries nothing" and "we could not read this diagram", which is the one distinction
 * everything above the parser depends on. These tests drive the real `lookAtFigures` against a
 * stubbed provider, because the reason is chosen from the reply's SHAPE and nothing pure can
 * be handed that.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildDocument, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { lookAtFigures } from "./figure-look";
import type { CapturedFigure } from "./structure";
import { VisionLedger, withVisionBudget } from "./vision-budget";

const ENV = { GEMINI_API_KEY: "test-key" };

/** Three routed figures: each is 25% of its own page, comfortably over the worth-looking line. */
function threeFigures(): DocumentModel {
  const blocks: Omit<DocBlock, "id">[] = [0, 1, 2].map((unit) => ({
    figure: { ref: `img-${unit}` },
    headingPath: [],
    kind: "figure" as const,
    rect: { height: 0.5, width: 0.5, x: 0.1, y: 0.1 },
    text: "",
    unit,
  }));
  return buildDocument({
    blocks,
    format: "pdf",
    title: null,
    units: [0, 1, 2].map((index) => ({ index, kind: "page" as const, label: `${index + 1}` })),
  });
}

const pixels = (): ReadonlyMap<string, CapturedFigure> =>
  new Map([0, 1, 2].map((unit) => [`${unit}:img-${unit}`, { height: 10, png: new Uint8Array([1, 2, 3]), width: 10 }]));

/** A provider that replies with `entries` numbered answers, whatever it was sent. */
function stubProvider(entries: readonly string[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: entries.map((entry, index) => `[[figure ${index + 1}]] ${entry}`).join("\n") }] }, finishReason: "STOP" }],
      }),
      { headers: { "content-type": "application/json" }, status: 200 },
    )) as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const reasonsOf = (model: DocumentModel) =>
  model.blocks.filter((block) => block.kind === "figure").map((block) => block.figure?.skipped ?? block.figure?.description ?? "none");

test("a reply the batch can be attributed to describes every figure", async () => {
  const restore = stubProvider(["a diagram of the Krebs cycle", "a bar chart of outcomes", "a photograph of a ward"]);
  try {
    const looked = await withVisionBudget(new VisionLedger(120), () =>
      lookAtFigures(threeFigures(), pixels(), { env: ENV }),
    );
    assert.equal(looked.report.described, 3);
    assert.equal(looked.report.notSent, 0);
  } finally {
    restore();
  }
});

test("🔴 a batch discarded for a count mismatch is not a verdict about any picture", async () => {
  // The measured case: three figures sent, the model answers in TWO entries because two of the
  // images are halves of one slide. `parseFigureDescriptions` refuses to zip a mismatched list —
  // correctly, since a caption on the wrong diagram is worse than none — and the whole batch is
  // dropped. Reporting that as `examined-empty` asserts a verdict nobody reached.
  const restore = stubProvider(["describes two of the images at once", "and the third"]);
  try {
    const looked = await withVisionBudget(new VisionLedger(120), () =>
      lookAtFigures(threeFigures(), pixels(), { env: ENV }),
    );
    assert.equal(looked.report.described, 0, "nothing could be attributed");
    assert.deepEqual(reasonsOf(looked.model), ["vision-unavailable", "vision-unavailable", "vision-unavailable"]);
  } finally {
    restore();
  }
});

test("🔴 a figure the model really did answer 'none' about keeps the verdict it earned", async () => {
  // The discriminating half of the pair. Same code path, same batch size, same reply shape —
  // only the CONTENT of the entries differs. A guard that reported everything undescribed as
  // `vision-unavailable` would pass the test above and fail this one.
  const restore = stubProvider(["none", "a bar chart of outcomes", "none"]);
  try {
    const looked = await withVisionBudget(new VisionLedger(120), () =>
      lookAtFigures(threeFigures(), pixels(), { env: ENV }),
    );
    assert.equal(looked.report.described, 1);
    assert.deepEqual(reasonsOf(looked.model).filter((reason) => reason === "examined-empty").length, 2);
  } finally {
    restore();
  }
});

test("🔴 a figure the ledger refused to pay for reports the cap, not an empty verdict", async () => {
  // Measured by capping a real lecture at one unit: two routed figures came back reported as
  // `examined-empty` having never left the process.
  const restore = stubProvider(["the one figure we could afford"]);
  try {
    const looked = await withVisionBudget(new VisionLedger(1), () =>
      lookAtFigures(threeFigures(), pixels(), { env: ENV }),
    );
    assert.equal(looked.report.notSent, 2, "two figures were never sent");
    assert.equal(reasonsOf(looked.model).filter((reason) => reason === "over-cap").length, 2);
    assert.equal(reasonsOf(looked.model).filter((reason) => reason === "examined-empty").length, 0);
  } finally {
    restore();
  }
});
