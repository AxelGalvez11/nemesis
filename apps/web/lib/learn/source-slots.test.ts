import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { mergeSourceIntoCanvas, newCanvas } from "./canvas-store";
import type { CanvasSource } from "./canvas-model";

// Ten files dropped at once must arrive as ten. They arrived as nine.

function source(id: string, title: string): CanvasSource {
  return { excerpts: [{ id: `${id}:e1`, label: null, text: title }], id, kind: "pdf", title } as unknown as CanvasSource;
}

test("🔴 two documents that claim the same slot silently become one", () => {
  // 🔴 THE BLAST RADIUS, DEMONSTRATED. `mergeSourceIntoCanvas` folds an arriving source onto an
  // existing one when the ids match — correct behaviour for a re-offered document, catastrophic
  // when two DIFFERENT documents were handed the same slot. This test does not assert the merge is
  // wrong; it pins how expensive a colliding id is, which is why the id must be claimed and not
  // counted.
  let canvas = newCanvas();
  canvas = mergeSourceIntoCanvas(canvas, source("s1", "Diabetes lecture"));
  canvas = mergeSourceIntoCanvas(canvas, source("s1", "Immunology lecture"));
  assert.equal(canvas.sources.length, 1, "the collision no longer costs a document — check the id claim below");
  // Which title survives is `adoptIntoExisting`'s business and is not the point. The point is that
  // TWO documents went in and ONE came out, with nothing raised and nothing logged.
  assert.equal(canvas.sources[0]?.excerpts.length, 1, "the two documents' excerpts were concatenated instead");
});

test("a document re-offered under its own id is still folded, not duplicated", () => {
  // The merge exists for a real case and must keep working: the same document offered twice.
  let canvas = newCanvas();
  canvas = mergeSourceIntoCanvas(canvas, source("s1", "Diabetes lecture"));
  canvas = mergeSourceIntoCanvas(canvas, source("s1", "Diabetes lecture"));
  assert.equal(canvas.sources.length, 1, "re-offering one document now duplicates it");
});

test("🔴 the slot is CLAIMED, never derived from the current count", () => {
  // 🔴 MEASURED ON PRODUCTION 2026-09-03. Ten files uploaded together; `27-syllabus-ipt4.pdf` and
  // `28-syllabus-pmmi.pdf` finished one millisecond apart. Both read `sources.length` before either
  // had appended, both minted the same id, and the canvas ended with NINE sources. Both files had
  // parsed and indexed perfectly — the loss was entirely in the id.
  //
  // Comments stripped first: the note explaining the bug quotes the expression it bans.
  const session = readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(
    !/`s\$\{latest\.current\.sources\.length \+ 1\}`/.test(session),
    "the source id is derived from the count again: a batch of ten will lose one file, silently",
  );
  assert.match(session, /const sourceId = claimSourceId\(\)/, "the attach no longer claims its slot");
  assert.match(session, /claimed\.current = \{ canvasId: current\.id, next \}/, "the claim is not recorded, so it cannot prevent a collision");
});

test("the claim is a high-water mark, so removing a source cannot mint a used id", () => {
  // The hazard the ORIGINAL comment named and deferred: with one of three sources removed, a count
  // mints `s3` again and overwrites the survivor. A high-water mark fixes that too.
  const session = readFileSync(new URL("../../components/workspace/learn/use-canvas-session.ts", import.meta.url), "utf8");
  assert.match(session, /Math\.max\(max, Number\(ordinal\)\)/, "the claim no longer reads the highest existing slot");
  assert.match(session, /Math\.max\(highest, held\) \+ 1/, "the claim is not monotonic across in-flight attaches");
});
