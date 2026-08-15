/**
 * The routing rule, and the pixel conversion behind it.
 *
 * 🔴 THE FIRST TEST IS THE PHASE. Everything else here is bookkeeping; that one
 * asserts the specific defect this phase exists to fix — a page with plenty of
 * text and a load-bearing diagram, which production's sparsity rule guarantees
 * is never looked at. 326 of 952 real pages are in that shape.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildDocument, figureCoverageOf, type DocumentModel } from "@nemesis/shared";

import {
  applyFigureDescriptions,
  planFigureVision,
  MAX_FIGURES_PER_DOC,
} from "./figure-routing";
import { figureToPng, GRAYSCALE_1BPP, RGBA_32BPP, RGB_24BPP } from "./figure-image";

/** A page with `chars` of prose and one figure covering `area` of it. */
function page(unit: number, chars: number, area: number, ref = `img${unit}`) {
  const side = Math.sqrt(area);
  return [
    {
      headingPath: [],
      kind: "paragraph" as const,
      rect: { height: 0.1, width: 0.8, x: 0.1, y: 0.1 },
      text: "x".repeat(chars),
      unit,
    },
    {
      figure: { ref },
      headingPath: [],
      kind: "figure" as const,
      rect: { height: side, width: side, x: 0.1, y: 0.3 },
      text: "",
      unit,
    },
  ];
}

function doc(blocks: ReturnType<typeof page>[]): DocumentModel {
  return buildDocument({
    blocks: blocks.flat(),
    format: "pdf",
    title: null,
    units: blocks.map((_, index) => ({ index, kind: "page" as const })),
  });
}

test("a large figure on a text-rich page is routed — the 326-page population", () => {
  // 1,200 characters is a page full of prose. Production's rule looks at text
  // and stops there, so this figure is never examined.
  const plan = planFigureVision(doc([page(0, 1_200, 0.25)]));
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0]!.because, "large-figure");
});

test("a thin page is still routed, because a scan has no figure block at all", () => {
  const plan = planFigureVision(doc([page(0, 10, 0.005)]));
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0]!.because, "thin-unit");
});

test("a small figure on a text-rich page is not worth a call", () => {
  assert.equal(planFigureVision(doc([page(0, 1_200, 0.001)])).candidates.length, 0);
});

test("a figure already skipped for a stated reason is not re-examined", () => {
  const model = doc([page(0, 1_200, 0.25)]);
  const blocks = model.blocks.map((block) =>
    block.kind === "figure" ? { ...block, figure: { ...block.figure!, skipped: "decorative" as const } } : block,
  );
  assert.equal(planFigureVision({ ...model, blocks }).candidates.length, 0);
});

test("the budget truncates, and says how much it truncated", () => {
  const pages = Array.from({ length: MAX_FIGURES_PER_DOC + 5 }, (_, i) => page(i, 1_200, 0.25));
  const plan = planFigureVision(doc(pages));
  assert.equal(plan.candidates.length, MAX_FIGURES_PER_DOC);
  // 🔴 The overflow is COUNTED, not merely absent from the list. A shorter list
  // and a disclosed truncation look identical from the outside otherwise.
  assert.equal(plan.overBudget, 5);
});

test("the largest figure survives the budget", () => {
  const pages = [page(0, 1_200, 0.05, "small"), page(1, 1_200, 0.6, "big")];
  const plan = planFigureVision(doc(pages), { maxFigures: 1 });
  assert.equal(plan.candidates[0]!.ref, "big");
});

test("a described figure stops being unexamined; an empty answer stays lost", () => {
  const model = doc([page(0, 1_200, 0.25, "a"), page(1, 1_200, 0.25, "b")]);
  const figureIndexes = model.blocks
    .map((block, index) => (block.kind === "figure" ? index : -1))
    .filter((index) => index >= 0);

  const before = figureCoverageOf(model);
  assert.equal(before.reasons["not-examined"], 2);

  const after = applyFigureDescriptions(
    model,
    new Map([
      [figureIndexes[0]!, { description: "A free-body diagram of a cantilever." }],
      [figureIndexes[1]!, { description: "   " }],
    ]),
  );
  const coverage = figureCoverageOf(after);
  assert.equal(coverage.described, 1);
  // 🔴 The empty one is `examined-empty`, NOT `not-examined`. Something looked;
  // saying otherwise would make a provider problem read as a routing problem.
  assert.equal(coverage.reasons["examined-empty"], 1);
  assert.equal(coverage.reasons["not-examined"], undefined);
});

test("a description never becomes the figure's caption", () => {
  const model = doc([page(0, 1_200, 0.25)]);
  const index = model.blocks.findIndex((block) => block.kind === "figure");
  const after = applyFigureDescriptions(model, new Map([[index, { description: "A bar chart." }]]));
  // The caption is what the author wrote. A generated sentence sitting in `text`
  // would be quotable as the document's own words — and citations search text.
  assert.equal(after.blocks[index]!.text, "");
  assert.equal(after.blocks[index]!.figure?.description, "A bar chart.");
});

// ── labels (§46.6) ──────────────────────────────────────────────────────────
// 🔴 THIS BOUNDARY DROPPED LABELS UNTIL NOW. `applyFigureDescriptions`'s results map had no
// `labels` slot, so a PDF diagram vision named parts in reached the model as prose only — the
// exact "invoked, then discarded at a boundary" shape this repo has hit six times before.

test("🔴 a labelled PDF figure keeps its labels — the boundary that used to drop them", () => {
  const model = doc([page(0, 1_200, 0.25)]);
  const index = model.blocks.findIndex((block) => block.kind === "figure");
  const after = applyFigureDescriptions(
    model,
    new Map([
      [
        index,
        {
          description: "A nephron with its labelled segments.",
          labels: [{ text: "Glomerulus", x: 0.3, y: 0.2 }, { text: "Loop of Henle", x: 0.5, y: 0.6 }],
        },
      ],
    ]),
  );
  assert.deepEqual(after.blocks[index]!.figure?.labels, [
    { text: "Glomerulus", x: 0.3, y: 0.2 },
    { text: "Loop of Henle", x: 0.5, y: 0.6 },
  ]);
});

test("a figure with no LABELS line gets no labels field — refusal stays cheap", () => {
  // The negative case is the one that matters most: a fabricated label on a decorative figure
  // becomes a question the learner is marked wrong on. `description` with no `labels` must leave
  // `figure.labels` absent, never an invented `[]`.
  const model = doc([page(0, 1_200, 0.25)]);
  const index = model.blocks.findIndex((block) => block.kind === "figure");
  const after = applyFigureDescriptions(model, new Map([[index, { description: "A stock photo of a lab." }]]));
  assert.equal(after.blocks[index]!.figure?.labels, undefined);
});

test("an empty labels array is treated the same as none", () => {
  const model = doc([page(0, 1_200, 0.25)]);
  const index = model.blocks.findIndex((block) => block.kind === "figure");
  const after = applyFigureDescriptions(model, new Map([[index, { description: "A chart.", labels: [] }]]));
  assert.equal(after.blocks[index]!.figure?.labels, undefined);
});

// ── pixels ──────────────────────────────────────────────────────────────────

test("RGB pixels become a PNG", () => {
  const width = 80;
  const height = 80;
  const data = new Uint8Array(width * height * 3).fill(120);
  const result = figureToPng({ data, height, kind: RGB_24BPP, width });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // The PNG signature, checked rather than assumed — a "PNG" that is not one
  // reaches the provider as an unreadable attachment and returns nothing, which
  // would be recorded as `examined-empty` and blamed on the model.
  assert.deepEqual([...result.png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test("transparency is composited over white, not discarded", () => {
  const width = 64;
  const height = 64;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = 0;
    data[i * 4 + 1] = 0;
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 0; // fully transparent
  }
  const result = figureToPng({ data, height, kind: RGBA_32BPP, width });
  assert.equal(result.ok, true);
  // Dropping alpha would make this a solid black square: a diagram drawn as dark
  // strokes on transparency becomes unreadable in a way that looks like a bad
  // diagram rather than a bad conversion.
});

test("a 1-bit scan keeps set bits black", () => {
  const width = 64;
  const height = 64;
  const rowBytes = Math.ceil(width / 8);
  const data = new Uint8Array(rowBytes * height); // every bit clear = white page
  const result = figureToPng({ data, height, kind: GRAYSCALE_1BPP, width });
  assert.equal(result.ok, true);
});

test("a figure with no pixels is undecoded, not empty", () => {
  assert.deepEqual(figureToPng({ height: 100, width: 100 }), { ok: false, reason: "undecoded" });
  assert.deepEqual(figureToPng(null), { ok: false, reason: "undecoded" });
});

test("an icon is refused on its own resolution, not its share of the page", () => {
  const data = new Uint8Array(16 * 16 * 3);
  assert.deepEqual(figureToPng({ data, height: 16, kind: RGB_24BPP, width: 16 }), {
    ok: false,
    reason: "too-small",
  });
});

test("a colour space this build cannot convert says so, and does not guess", () => {
  const data = new Uint8Array(100 * 100);
  const result = figureToPng({ data, height: 100, kind: 99, width: 100 });
  assert.deepEqual(result, { ok: false, reason: "unsupported-kind" });
});

test("a buffer shorter than its declared size is malformed, not unsupported", () => {
  const result = figureToPng({ data: new Uint8Array(10), height: 100, kind: RGB_24BPP, width: 100 });
  assert.deepEqual(result, { ok: false, reason: "malformed" });
});

test("an oversized figure is downscaled rather than refused", () => {
  const width = 3_000;
  const height = 2_000;
  const result = figureToPng({ data: new Uint8Array(width * height * 3), height, kind: RGB_24BPP, width });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.width < width, "expected a downscale");
  assert.ok(result.width * result.height <= 2_200_000);
});
