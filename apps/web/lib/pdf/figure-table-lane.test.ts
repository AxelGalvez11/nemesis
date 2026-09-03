/**
 * The whole lane, from the instruction to the block: a table that is a picture keeps its numbers.
 *
 * 🔴🔴 THIS IS THE PRODUCTION DEFECT OF 2026-09-03, WRITTEN DOWN AS TESTS. `08-insulin.pdf` holds
 * its onset/peak/duration table as a pasted screenshot. It draws no rules, so `table-lattice.ts`
 * finds no region and `preflightPdf` never fires its "no rate at which losing a table is
 * acceptable" escalation. Its page carries 252 characters of title and citation, so `pages.ts`
 * never calls it thin. The figure lane DID reach it, sent the pixels and got an answer — and the
 * answer, under "in one to three sentences", was a caption:
 *
 *   "…For each preparation, values are provided for Onset, Peak time, and Duration in hours."
 *
 * ChatGPT, given the same file, produced the full table. Nemesis told the learner the peak values
 * "weren't extracted into text for me", and the document recorded `state: "complete"`.
 *
 * Two things had to be true for that to be fixable, and each has a test here: the instruction has
 * to ask a grid to be transcribed, and the reply's LINE STRUCTURE has to survive the split that
 * files each answer against its picture.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildDocument, type DocBlock, type DocumentModel } from "@nemesis/shared";

import { lookAtFigures } from "./figure-look";
import type { CapturedFigure } from "./structure";
import { FIGURE_PROMPT, FIGURE_PROMPT_VERSION, parseAttributedFigureDescriptions, parseAttributedFigureEntries } from "./vision";

const ENV = { GEMINI_API_KEY: "test-key" };

/** What the table clause asks a screenshot of a grid to come back as. */
const TABLE_REPLY = [
  "| Preparation | Onset | Peak | Duration |",
  "| --- | --- | --- | --- |",
  "| Lispro | 15-30 min | 0.5-2.5 h | 3-6 h |",
  "| Regular | 30-60 min | 2-4 h | 6-10 h |",
].join("\n");

// ── the instruction ─────────────────────────────────────────────────────────

test("🔴 FIGURE_PROMPT asks a table to be transcribed, not described", () => {
  assert.match(FIGURE_PROMPT, /\bTABLE\b/, "a grid has to be named as its own case");
  assert.match(FIGURE_PROMPT, /transcribe it/i);
  assert.match(FIGURE_PROMPT, /markdown row per/i, "and it has to say what shape to answer in");
  assert.match(FIGURE_PROMPT, /never leave a row out/i);
});

test("🔴 the one-to-three-sentence cap applies to the OTHER images, never to a grid", () => {
  // The cap is a real cost ceiling for a diagram — a molecular figure once ran to 18,642 output
  // tokens — so it stays. What it must never do again is silently bound a transcription: three
  // sentences cannot hold a twelve-row table, and the model complied exactly.
  const cap = FIGURE_PROMPT.indexOf("one to three sentences");
  const table = FIGURE_PROMPT.search(/if an image is a table/i);
  assert.ok(table >= 0 && cap >= 0);
  assert.ok(table < cap, "the table case is decided before the sentence cap is ever mentioned");
  assert.match(FIGURE_PROMPT.slice(cap - 60, cap), /any OTHER image/i);
});

test("🔴 a cached answer belongs to the question that produced it", () => {
  // `figure_descriptions` is keyed on the PIXELS. Without a version beside them, every table
  // already cached as a one-sentence caption would be served back forever — including to the very
  // reparse meant to prove the clause above works.
  assert.ok(FIGURE_PROMPT_VERSION.trim().length > 0);
});

// ── the boundary ────────────────────────────────────────────────────────────

test("🔴 an entry keeps its own line structure; the lines ARE the table", () => {
  const reply = `[[figure 1]] A dose-response curve.\n[[figure 2]]\n${TABLE_REPLY}`;
  const entries = parseAttributedFigureEntries(reply, 2);
  assert.ok(entries);
  assert.equal(entries![1]!.split("\n").length, 4, "four printed rows arrive as four lines");
  assert.match(entries![1]!, /\| Regular \| 30-60 min \| 2-4 h \| 6-10 h \|/);

  // And the flattening door stays exactly where it was, because `parseFigureLabels` was written
  // against it and the legacy numbered parser's tests assert it.
  const flat = parseAttributedFigureDescriptions(reply, 2);
  assert.ok(flat);
  assert.equal(flat![1]!.includes("\n"), false);
});

test("attribution is unchanged: an unknown, duplicate or missing id still refuses the batch", () => {
  assert.equal(parseAttributedFigureEntries("[[figure 1]] a\n[[figure 1]] again", 2), null);
  assert.equal(parseAttributedFigureEntries("[[figure 1]] a\n[[figure 3]] invented", 2), null);
  assert.equal(parseAttributedFigureEntries("[[figure 1]] a\n[[figure 2]] b", 3), null);
  assert.deepEqual(parseAttributedFigureEntries("[[figure 2]] second\n[[figure 1]] first", 2), ["first", "second"]);
  assert.deepEqual(parseAttributedFigureEntries("[[figure 1]] none", 1), [""]);
});

// ── the block ───────────────────────────────────────────────────────────────

function oneFigure(): DocumentModel {
  const blocks: Omit<DocBlock, "id">[] = [
    {
      figure: { ref: "img_p5_1" },
      headingPath: ["Insulin Pharmacodynamics"],
      kind: "figure" as const,
      rect: { height: 0.5, width: 0.5, x: 0.1, y: 0.1 },
      text: "",
      unit: 0,
    },
  ];
  return buildDocument({ blocks, format: "pdf", title: null, units: [{ index: 0, kind: "page" as const }] });
}

const pixels = (): ReadonlyMap<string, CapturedFigure> =>
  new Map([["0:img_p5_1", { height: 978, png: new Uint8Array([1, 2, 3]), width: 1838 }]]);

function stubReply(text: string): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }),
      { headers: { "content-type": "application/json" }, status: 200 },
    )) as typeof globalThis.fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test("🔴🔴 the values reach the figure block, on their own rows", async () => {
  const restore = stubReply(`[[figure 1]]\n${TABLE_REPLY}`);
  try {
    const { model } = await lookAtFigures(oneFigure(), pixels(), { env: ENV });
    const seen = model.blocks.find((block) => block.kind === "figure")?.figure?.description ?? "";
    // The exact fact production could not answer with.
    assert.match(seen, /0\.5-2\.5 h/, "the peak column survived");
    assert.match(seen, /\| Regular \| 30-60 min \| 2-4 h \| 6-10 h \|/, "and it survived as a ROW");
    assert.equal(seen.split("\n").length >= 3, true, "a grid, not one flattened line");
  } finally {
    restore();
  }
});

test("🔴 the grid reaching the model is the SHARED rendering, not the model's own typing", async () => {
  // Calibration found this step unguarded: without it the raw reply still carried its rows, so
  // every assertion above passed while the normalisation quietly did nothing and would have been
  // deleted by the next refactor. What it actually buys is one shape for every producer — a table
  // read out of a picture and a table read out of a Word file must reach a model identically, or
  // retrieval degrades in a way that looks like a model bug (`tableToMarkdown`'s own note).
  const ragged = [
    "| Preparation | Onset | Peak | Duration |",
    "|---|---|---|---|",
    "| Lispro | 15-30 min | 0.5-2.5 h | 3-6 h |",
    "| Regular | 30-60 min | 2-4 h |",
    "|---|---|---|---|",
  ].join("\n");
  const restore = stubReply(`[[figure 1]]\n${ragged}`);
  try {
    const { model } = await lookAtFigures(oneFigure(), pixels(), { env: ENV });
    const seen = model.blocks.find((block) => block.kind === "figure")?.figure?.description ?? "";
    assert.equal(
      seen,
      [
        "| Preparation | Onset | Peak | Duration |",
        "| --- | --- | --- | --- |",
        "| Lispro | 15-30 min | 0.5-2.5 h | 3-6 h |",
        "| Regular | 30-60 min | 2-4 h |  |",
      ].join("\n"),
      "one header rule, every row the same width, the short row padded with emptiness",
    );
  } finally {
    restore();
  }
});

test("a diagram is untouched by any of this", async () => {
  const caption = "A flow chart showing renin acting on angiotensinogen.";
  const restore = stubReply(`[[figure 1]] ${caption}`);
  try {
    const { model } = await lookAtFigures(oneFigure(), pixels(), { env: ENV });
    assert.equal(model.blocks.find((block) => block.kind === "figure")?.figure?.description, caption);
  } finally {
    restore();
  }
});
