import assert from "node:assert/strict";
import { test } from "node:test";

import {
  apportion,
  chunkMaterial,
  interleave,
  MATERIAL_CHAR_LIMIT,
  MAX_CHUNKS,
  mergeOutlines,
  MIN_PER_CHUNK,
  questionKey,
} from "./material-chunks";

const paragraphs = (count: number, size: number) =>
  Array.from({ length: count }, (_, i) => `${i}`.padEnd(size, "x")).join("\n\n");

// ── Splitting ────────────────────────────────────────────────────────────────

test("a source that already fits is one chunk, unchanged", () => {
  assert.deepEqual(chunkMaterial("Short lecture"), ["Short lecture"]);
});

test("an empty source produces nothing to generate from", () => {
  assert.deepEqual(chunkMaterial("   \n\n  "), []);
});

test("every chunk fits in a prompt", () => {
  const chunks = chunkMaterial(paragraphs(40, 1_000));
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= MATERIAL_CHAR_LIMIT, `${chunk.length} is over the limit`);
});

test("nothing is lost between the chunks", () => {
  const source = paragraphs(30, 800);
  const rejoined = chunkMaterial(source).join("\n\n").replace(/\s+/g, "");
  assert.equal(rejoined, source.replace(/\s+/g, ""));
});

test("the second half of a long lecture is present, not cut off", () => {
  const source = `${paragraphs(20, 900)}\n\nEND MARKER: renal dosing in the elderly`;
  const chunks = chunkMaterial(source);
  assert.ok(chunks.some((chunk) => chunk.includes("END MARKER")), "the tail must reach the generator");
});

test("a wall of text with no paragraph breaks is still split", () => {
  const source = "word ".repeat(20_000);
  const chunks = chunkMaterial(source);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= MATERIAL_CHAR_LIMIT);
});

test("an oversized paragraph is cut at a space, not mid-word", () => {
  const source = "supercalifragilistic ".repeat(2_000);
  for (const chunk of chunkMaterial(source)) {
    assert.doesNotMatch(chunk, /supercalifragilisti$/, "a chunk should not end on a severed word");
  }
});

test("a pathological upload is sampled across the whole document, not truncated", () => {
  const source = paragraphs(400, 2_000); // ~800,000 characters
  const chunks = chunkMaterial(source);
  assert.equal(chunks.length, MAX_CHUNKS);
  const last = chunks.at(-1)!;
  assert.ok(!last.startsWith("0"), "the final chunk must come from late in the document");
});

// ── Sharing the work out ─────────────────────────────────────────────────────

test("a longer chunk is asked for more questions", () => {
  const [small, large] = apportion(20, [2_000, 8_000]);
  assert.ok(large! > small!);
});

test("no chunk is asked for fewer than the generator's own floor", () => {
  const quotas = apportion(4, [1_000, 1_000, 1_000, 1_000, 1_000]);
  for (const quota of quotas) assert.ok(quota >= MIN_PER_CHUNK);
});

test("a single chunk is asked for exactly what the student wanted", () => {
  assert.deepEqual(apportion(12, [5_000]), [12]);
});

test("no chunks means nothing to apportion", () => {
  assert.deepEqual(apportion(10, []), []);
});

// ── Trimming without losing coverage ─────────────────────────────────────────

test("a trimmed test still draws on every chunk", () => {
  const perChunk = [
    ["start-1", "start-2", "start-3"],
    ["middle-1", "middle-2", "middle-3"],
    ["end-1", "end-2", "end-3"],
  ];
  const picked = interleave(perChunk, 4);
  assert.deepEqual(picked, ["start-1", "middle-1", "end-1", "start-2"]);
});

test("order within a chunk is kept, so questions follow the lecture", () => {
  const picked = interleave([["a1", "a2", "a3"]], 3);
  assert.deepEqual(picked, ["a1", "a2", "a3"]);
});

test("a chunk that returned nothing does not leave a hole", () => {
  const picked = interleave([["a1"], [], ["c1", "c2"]], 3);
  assert.deepEqual(picked, ["a1", "c1", "c2"]);
});

test("asking for more than exists returns everything, not padding", () => {
  assert.deepEqual(interleave([["a"], ["b"]], 99), ["a", "b"]);
});

// Two chunks of one lecture cover the same ground, so they write the same question.
// A test that asks about half-life twice looks broken in a way a merely incomplete
// test never did — which is a new failure mode created by reading the whole source.

test("the same question written by two chunks appears once", () => {
  const perChunk = [
    [{ q: "What is the half-life of digoxin?" }, { q: "Which enzyme clears it?" }],
    [{ q: "what is the half-life of digoxin" }, { q: "What is the loading dose?" }],
  ];
  const picked = interleave(perChunk, 4, questionKey);
  assert.deepEqual(picked.map((item) => item.q), [
    "What is the half-life of digoxin?",
    "Which enzyme clears it?",
    "What is the loading dose?",
  ]);
});

test("dropping a repeat tops the count up instead of coming back short", () => {
  const perChunk = [
    [{ q: "A" }, { q: "B" }, { q: "C" }],
    [{ q: "a" }, { q: "D" }],
  ];
  const picked = interleave(perChunk, 4, questionKey);
  assert.equal(picked.length, 4);
  // Round-robin by position: the skipped repeat does not pull chunk two's next
  // item forward into the same round, it simply waits for the round it is in.
  assert.deepEqual(picked.map((item) => item.q), ["A", "B", "D", "C"]);
});

test("questionKey ignores spacing, case and trailing punctuation only", () => {
  assert.equal(questionKey({ q: "  Which  receptor?  " }), questionKey({ q: "which receptor" }));
  assert.notEqual(questionKey({ q: "Which receptor?" }), questionKey({ q: "Which enzyme?" }));
});

// ── One mind map out of several ──────────────────────────────────────────────

test("outlines merge under a single root", () => {
  const merged = mergeOutlines(["# Warfarin\n- Mechanism\n  - Vitamin K", "# Warfarin\n- Monitoring\n  - INR"]);
  assert.equal(merged?.split("\n")[0], "# Warfarin");
  assert.equal((merged?.match(/^#/gm) ?? []).length, 1, "a mind map has one root");
  assert.ok(merged?.includes("- Mechanism"));
  assert.ok(merged?.includes("- Monitoring"));
});

test("a node both chunks named appears once", () => {
  const merged = mergeOutlines(["# Drug\n- Dosing", "# Drug\n- Dosing\n- Toxicity"]);
  assert.equal((merged?.match(/- Dosing/g) ?? []).length, 1);
});

test("a merged map stays within the node ceiling", () => {
  const big = `# Root\n${Array.from({ length: 60 }, (_, i) => `- node ${i}`).join("\n")}`;
  const merged = mergeOutlines([big, big], 35);
  assert.equal(merged!.split("\n").length, 36, "one root plus the ceiling");
});

test("nothing usable gives null rather than an empty map", () => {
  assert.equal(mergeOutlines([]), null);
  assert.equal(mergeOutlines(["  "]), null);
});

test("an outline with no heading still gets a root", () => {
  const merged = mergeOutlines(["- Just bullets"]);
  assert.equal(merged?.split("\n")[0], "# Overview");
});
