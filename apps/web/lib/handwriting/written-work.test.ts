import assert from "node:assert/strict";
import { test } from "node:test";

import {
  finalAnswerMark,
  parseWrittenWork,
  readWrittenWork,
  standingMarks,
  unreadMarks,
  WRITTEN_WORK_PROMPT,
  type WrittenWork,
} from "./written-work";

// Every test below names the single property it protects, so a calibration run (break the thing,
// confirm THIS test reddens and nothing else) is possible at all. The bare-block style this
// directory's older tests use cannot be calibrated: one broken assertion takes the whole file.

// ── the prompt states the mandate ─────────────────────────────────────────────

test("🔴 the vision prompt forbids grading and demands JSON", () => {
  assert.match(WRITTEN_WORK_PROMPT, /do not grade/i);
  assert.match(WRITTEN_WORK_PROMPT, /correct/i);
  assert.match(WRITTEN_WORK_PROMPT, /only json/i);
  assert.match(WRITTEN_WORK_PROMPT, /abstained/i);
});

test("🔴 the prompt asks for order, retractions, unread parts and a conclusion", () => {
  // Each of these is a distinction the evaluator cannot make if the model was never asked for it.
  assert.match(WRITTEN_WORK_PROMPT, /order/i);
  assert.match(WRITTEN_WORK_PROMPT, /struckThrough/);
  assert.match(WRITTEN_WORK_PROMPT, /legible/);
  assert.match(WRITTEN_WORK_PROMPT, /finalAnswerIndex/);
});

test("🔴 the prompt names no subject matter and hands the model no expected answer", () => {
  // Field-agnostic by construction: a prompt that mentions equations, reactions or cases would
  // read as a maths prompt to a model looking at a law student's page. And a prompt that says what
  // a good answer contains leads the witness.
  assert.doesNotMatch(WRITTEN_WORK_PROMPT, /\b(equation|chemistry|physics|algebra|reaction|molecule|force|statute)\b/i);
  assert.doesNotMatch(WRITTEN_WORK_PROMPT, /expected (element|answer)/i);
});

// ── the happy path ────────────────────────────────────────────────────────────

const derivation = JSON.stringify({
  abstained: false,
  finalAnswerIndex: 2,
  legibility: 0.9,
  marks: [
    { confidence: 0.95, kind: "line", legible: true, struckThrough: false, text: "2x + 6 = 14" },
    { confidence: 0.9, kind: "line", legible: true, struckThrough: false, text: "2x = 8" },
    { confidence: 0.92, kind: "line", legible: true, struckThrough: false, text: "x = 4" },
  ],
  relations: [],
});

test("a well-formed reply parses with its order, its conclusion and its model preserved", () => {
  const work = parseWrittenWork(derivation, "gemini-3.5-flash");
  assert.equal(work.abstained, false);
  assert.equal(work.abstentionReason, null);
  assert.equal(work.model, "gemini-3.5-flash");
  assert.equal(work.legibility, 0.9);
  assert.deepEqual(work.marks.map((mark) => mark.text), ["2x + 6 = 14", "2x = 8", "x = 4"]);
  assert.equal(work.finalAnswerIndex, 2);
  assert.equal(finalAnswerMark(work)?.text, "x = 4");
});

test("a code-fenced reply still parses", () => {
  const work = parseWrittenWork("```json\n" + derivation + "\n```", "m");
  assert.equal(work.abstained, false);
  assert.equal(work.marks.length, 3);
});

// ── refusing rather than guessing ─────────────────────────────────────────────

test("🔴 a reply that is not JSON abstains rather than producing an empty confident reading", () => {
  const work = parseWrittenWork("I had a look and it seems fine", "m");
  assert.equal(work.abstained, true);
  assert.ok(work.abstentionReason);
  assert.deepEqual(work.marks, []);
});

test("🔴 valid JSON of the wrong shape abstains — an array is typeof 'object'", () => {
  const work = parseWrittenWork("[1,2,3]", "m");
  assert.equal(work.abstained, true, "an array must not be read as a record whose every field is undefined");
});

test("🔴 a declared abstention discards whatever partial reading came with it", () => {
  const work = parseWrittenWork(
    JSON.stringify({
      abstained: true,
      abstentionReason: "the photo is too dark",
      finalAnswerIndex: 0,
      legibility: 0.9,
      marks: [{ confidence: 0.9, kind: "line", legible: true, struckThrough: false, text: "x = 4" }],
    }),
    "m",
  );
  assert.equal(work.abstained, true);
  assert.deepEqual(work.marks, [], "a model unsure enough to abstain is not a source to quote from");
  assert.equal(work.finalAnswerIndex, null);
  assert.equal(work.legibility, null);
  assert.match(work.abstentionReason ?? "", /too dark/);
});

// ── absent is null, never a default ───────────────────────────────────────────

test("🔴 a confidence outside 0-1 becomes null rather than being clamped", () => {
  const work = parseWrittenWork(
    JSON.stringify({
      abstained: false,
      legibility: 95,
      marks: [{ confidence: 95, kind: "line", legible: true, struckThrough: false, text: "x = 4" }],
    }),
    "m",
  );
  assert.equal(work.legibility, null, "95 is a percentage, not near-total certainty");
  assert.equal(work.marks[0]?.confidence, null);
});

test("🔴 an unreported confidence is null, never a number", () => {
  const work = parseWrittenWork(
    JSON.stringify({ abstained: false, marks: [{ kind: "line", text: "x = 4" }] }),
    "m",
  );
  assert.equal(work.legibility, null);
  assert.equal(work.marks[0]?.confidence, null, "silence about certainty must not become a value");
});

test("🔴 an explicitly reported null confidence stays null and does not become zero", () => {
  // `Number(null)` is 0, which is a perfectly valid confidence. Coerced, "the model said nothing
  // about how sure it was" would be stored as "the model said it was certainly wrong".
  const work = parseWrittenWork(
    JSON.stringify({
      abstained: false,
      legibility: null,
      marks: [{ confidence: null, kind: "line", text: "x = 4" }, { confidence: "high", kind: "line", text: "x = 5" }],
    }),
    "m",
  );
  assert.equal(work.legibility, null);
  assert.equal(work.marks[0]?.confidence, null);
  assert.equal(work.marks[1]?.confidence, null, "a non-numeric confidence is not an observation");
});

test("🔴 an out-of-range finalAnswerIndex is null, never clamped to the last mark", () => {
  const work = parseWrittenWork(
    JSON.stringify({
      abstained: false,
      finalAnswerIndex: 7,
      marks: [{ confidence: 0.9, kind: "line", text: "x = 4" }],
    }),
    "m",
  );
  assert.equal(work.finalAnswerIndex, null, "promoting the last line to 'their answer' judges a conclusion the page never made");
  assert.equal(finalAnswerMark(work), null);
});

test("a fractional or negative finalAnswerIndex is null", () => {
  const one = { confidence: 0.9, kind: "line", text: "x = 4" };
  assert.equal(parseWrittenWork(JSON.stringify({ finalAnswerIndex: 1.5, marks: [one] }), "m").finalAnswerIndex, null);
  assert.equal(parseWrittenWork(JSON.stringify({ finalAnswerIndex: -1, marks: [one] }), "m").finalAnswerIndex, null);
  assert.equal(parseWrittenWork(JSON.stringify({ finalAnswerIndex: null, marks: [one] }), "m").finalAnswerIndex, null);
});

// ── the two defaults that point in opposite directions ────────────────────────

test("🔴 an omitted `legible` means the mark was read; an explicit false means it was not", () => {
  const work = parseWrittenWork(
    JSON.stringify({
      abstained: false,
      marks: [
        { confidence: 0.9, kind: "line", text: "x = 4" },
        { confidence: 0.2, kind: "line", legible: false, text: "two lines under the diagram" },
      ],
    }),
    "m",
  );
  assert.equal(work.marks[0]?.legible, true, "defaulting to unreadable would send every clean reply to a correction step");
  assert.equal(work.marks[1]?.legible, false);
  assert.deepEqual(unreadMarks(work).map((mark) => mark.text), ["two lines under the diagram"]);
});

test("🔴 an omitted `struckThrough` means nothing was crossed out", () => {
  const work = parseWrittenWork(
    JSON.stringify({
      abstained: false,
      marks: [
        { confidence: 0.9, kind: "line", text: "x = 4" },
        { confidence: 0.9, kind: "line", struckThrough: true, text: "x = 6" },
        { confidence: 0.9, kind: "line", struckThrough: "yes", text: "x = 5" },
      ],
    }),
    "m",
  );
  assert.equal(work.marks[0]?.struckThrough, false, "inventing a retraction deletes working the learner still stands behind");
  assert.equal(work.marks[1]?.struckThrough, true);
  assert.equal(work.marks[2]?.struckThrough, false, "only a real boolean true counts");
});

// ── the rest of the parser's refusals ─────────────────────────────────────────

test("a mark with no text at all is dropped — it observes neither content nor a gap", () => {
  const work = parseWrittenWork(
    JSON.stringify({
      abstained: false,
      marks: [
        { confidence: 0.9, kind: "line", text: "" },
        { confidence: 0.9, kind: "line", text: "   " },
        { confidence: 0.9, kind: "line", text: "x = 4" },
      ],
    }),
    "m",
  );
  assert.deepEqual(work.marks.map((mark) => mark.text), ["x = 4"]);
});

test("an unrecognised kind falls back to `line` rather than dropping the mark", () => {
  const work = parseWrittenWork(
    JSON.stringify({ abstained: false, marks: [{ confidence: 0.9, kind: "equation", text: "x = 4" }] }),
    "m",
  );
  assert.equal(work.marks[0]?.kind, "line");
});

test("runaway marks and relations are capped, and the conclusion index is checked against the cap", () => {
  const many = Array.from({ length: 200 }, (_, index) => ({ confidence: 0.9, kind: "line", text: `step ${index}` }));
  const work = parseWrittenWork(
    JSON.stringify({
      abstained: false,
      finalAnswerIndex: 199,
      marks: many,
      relations: Array.from({ length: 50 }, (_, index) => `relation ${index}`),
    }),
    "m",
  );
  assert.ok(work.marks.length <= 60, `expected a cap, got ${work.marks.length}`);
  assert.ok(work.relations.length <= 20, `expected a cap, got ${work.relations.length}`);
  assert.equal(work.finalAnswerIndex, null, "an index past the truncated list must not survive the cap");
});

test("relations that are not strings are dropped, not stringified", () => {
  const work = parseWrittenWork(
    JSON.stringify({ abstained: false, marks: [], relations: ["the arrow points right", 4, null, { a: 1 }] }),
    "m",
  );
  assert.deepEqual(work.relations, ["the arrow points right"]);
});

// ── the derived readings ──────────────────────────────────────────────────────

test("standingMarks is what the learner is claiming: read, and not crossed out", () => {
  const work: WrittenWork = {
    abstained: false,
    abstentionReason: null,
    finalAnswerIndex: null,
    legibility: 0.9,
    marks: [
      { confidence: 0.9, kind: "line", legible: true, struckThrough: false, text: "kept" },
      { confidence: 0.9, kind: "line", legible: true, struckThrough: true, text: "retracted" },
      { confidence: 0.2, kind: "line", legible: false, struckThrough: false, text: "a smudge" },
    ],
    model: "m",
    relations: [],
  };
  assert.deepEqual(standingMarks(work).map((mark) => mark.text), ["kept"]);
  assert.deepEqual(unreadMarks(work).map((mark) => mark.text), ["a smudge"]);
});

// ── the network boundary ──────────────────────────────────────────────────────

test("🔴 an unconfigured vision key is an infra failure (null), and never reaches the network", async () => {
  const before = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("readWrittenWork must not call fetch without a key");
  }) as typeof fetch;
  try {
    assert.equal(await readWrittenWork(new Uint8Array([1]), "image/png", { env: {} }), null);
  } finally {
    globalThis.fetch = before;
  }
});

test("🔴 a provider outage is null, never an abstained reading", async () => {
  const before = globalThis.fetch;
  globalThis.fetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
  try {
    const result = await readWrittenWork(new Uint8Array([1]), "image/png", { env: { GEMINI_API_KEY: "k" } });
    assert.equal(result, null, "'we never got a reading' and 'we read it and could not make it out' must stay distinguishable");
  } finally {
    globalThis.fetch = before;
  }
});

test("a real reply flows fetch -> readWithVision -> parseWrittenWork", async () => {
  const before = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: derivation }] } }] }),
      { status: 200 },
    )) as unknown as typeof fetch;
  try {
    const result = await readWrittenWork(new Uint8Array([1]), "image/png", { env: { GEMINI_API_KEY: "k" } });
    assert.equal(result?.marks.length, 3);
    assert.equal(result?.finalAnswerIndex, 2);
    assert.ok(result?.model);
  } finally {
    globalThis.fetch = before;
  }
});
