import assert from "node:assert/strict";
import { test } from "node:test";

import { appendEvent } from "./canvas-events";
import type { CanvasBlock, LearningCanvas } from "./canvas-model";
import { markedTerms, splitByTerms, type VocabularyCanvas } from "./canvas-vocabulary";

/** ~60 words, so the density rule allows the full budget of two. */
const LONG = [
  "At rest the inside of the cell sits well below the outside, and that difference is held there",
  "by a pump that spends energy every second to keep it. The electrochemical gradient is the",
  "result, and it is the store everything later draws on. When the channels open the ions move",
  "the way the gradient already wanted them to, which is why the upstroke costs the cell nothing",
  "at the moment it happens.",
].join(" ");

function block(over: Partial<CanvasBlock> = {}): CanvasBlock {
  return {
    id: "b1",
    type: "paragraph",
    content: LONG,
    terms: [{ term: "electrochemical gradient", conceptId: "k1" }, { term: "upstroke" }],
    ...over,
  };
}

function canvas(over: Partial<VocabularyCanvas> = {}): VocabularyCanvas {
  return { level: "fundamentals", responses: [], recallResults: [], events: [], ...over };
}

/** Only `events` matters to `appendEvent` here, but it wants a whole canvas. */
function withLookups(term: string, times: number): VocabularyCanvas {
  let current = { ...canvas(), activeMs: 0 } as unknown as LearningCanvas;
  for (let index = 0; index < times; index += 1) {
    current = appendEvent(current, { type: "definition_opened", selectedText: term }, "2026-08-10T00:00:00.000Z", `e${index}`);
  }
  return current;
}

test("terms are located in the block's current text, in reading order", () => {
  const marks = markedTerms(block(), canvas());
  assert.deepEqual(marks.map((mark) => mark.term), ["electrochemical gradient", "upstroke"]);
  // The offsets must index the real text, or the underline lands on the wrong words.
  for (const mark of marks) {
    assert.equal(LONG.slice(mark.start, mark.end), mark.term);
  }
  assert.ok(marks[0]!.start < marks[1]!.start, "reading order, not the order the model listed them");
});

test("🔴 whole words only — a term never underlines the middle of another word", () => {
  // "ion" is inside "gradient"… no; but it IS inside "ions", and "act" is inside "channels"?
  // The real case: a short term that occurs as a substring before it occurs as a word.
  const content = `The action of the channel matters. ${"x ".repeat(30)}An ion crosses the membrane.`;
  const marks = markedTerms(block({ content, terms: [{ term: "ion" }] }), canvas());
  assert.equal(marks.length, 1);
  // If the boundary test were missing this would be 4 — the "ion" inside "action".
  assert.equal(content.slice(marks[0]!.start, marks[0]!.end), "ion");
  assert.ok(marks[0]!.start > 30, "must skip the substring inside 'action' and find the real word");
});

test("a term the block no longer contains is dropped, not guessed at", () => {
  // This is what happens after "Simpler" rewrites a block: the old candidate list survives on
  // the block, and any term the rewrite removed simply stops being marked.
  const rewritten = block({ content: "The cell holds a difference in charge across its wall, and that store is what later gets spent when the gates open and things rush through. Nothing here is difficult.", });
  const marks = markedTerms(rewritten, canvas());
  assert.deepEqual(marks, []);
});

test("🔴 the hard cap is two, even in text long enough for more", () => {
  // 🔴 CALIBRATION NOTE. The obvious version of this test used the 60-word passage, where the
  // density rule allows exactly 2 — so raising MAX_PER_BLOCK to 99 changed nothing and the test
  // still passed. It was measuring density and calling it the cap. The block below is long
  // enough that density would permit four, which makes the cap the only thing standing between
  // the learner and a stippled paragraph.
  const long = `${LONG} ${LONG}`;
  assert.ok(long.trim().split(/\s+/).length >= 100, "density alone would allow four marks here");

  const crowded = block({
    content: long,
    terms: [{ term: "electrochemical gradient" }, { term: "upstroke" }, { term: "channels" }, { term: "pump" }],
  });
  assert.equal(markedTerms(crowded, canvas()).length, 2, "never more than two, however long the text");
});

test("a short block earns no marks at all", () => {
  // The density rule, which is what stops a page of short concept blocks becoming a page of
  // underlines. Six words is a sentence, not a lesson.
  //
  // 🔴 CALIBRATION NOTE. The first version of this used a short block whose text did not
  // contain either term — so it returned [] because nothing could be located, and loosening the
  // density rule to one-mark-per-word still passed it. The term has to be PRESENT and declined
  // anyway, or the test is only checking that absent words are absent.
  const short = block({ content: "The electrochemical gradient is the store." });
  assert.ok(short.content.includes("electrochemical gradient"), "the term must be there to be refused");
  assert.deepEqual(markedTerms(short, canvas()), []);
});

test("a learner past the basics is offered less, not more", () => {
  assert.equal(markedTerms(block(), canvas({ level: "fundamentals" })).length, 2);
  assert.equal(markedTerms(block(), canvas({ level: "advanced" })).length, 1);
  assert.equal(markedTerms(block(), canvas({ level: "exam" })).length, 1);
});

test("🔴 a term the learner has already used correctly is not marked", () => {
  // The strongest learner-relative signal available, and the one with real evidence under it:
  // a judge looked at what they wrote and recorded what it showed.
  const demonstrated = canvas({
    responses: [
      {
        questionId: "q1",
        text: "…",
        via: "typed",
        evaluation: {
          verdict: "strong",
          confidence: 0.9,
          demonstrated: ["that the electrochemical gradient is already loaded before phase 0"],
          missing: [],
          misconceptions: [],
          feedback: "Yes.",
        },
      },
    ],
  });
  assert.deepEqual(
    markedTerms(block(), demonstrated).map((mark) => mark.term),
    ["upstroke"],
    "the demonstrated term drops out; the other one stays",
  );
});

test("a term looked up once is retired, and one looked up three times comes back", () => {
  const once = withLookups("electrochemical gradient", 1);
  assert.deepEqual(
    markedTerms(block(), once).map((mark) => mark.term),
    ["upstroke"],
    "they asked and were answered — re-offering it immediately is what makes the layer feel stupid",
  );

  const persistent = withLookups("electrochemical gradient", 3);
  assert.ok(
    markedTerms(block(), persistent).some((mark) => mark.term === "electrochemical gradient"),
    "asked three times is friction, not curiosity — mark it again",
  );
});

test("🔴 marking is presentation and never touches the canvas", () => {
  const original = block();
  const snapshot = JSON.stringify(original);
  markedTerms(original, canvas());
  assert.equal(JSON.stringify(original), snapshot, "the block must come back untouched");
});

test("a block the learner has folded away or claimed is left alone", () => {
  assert.deepEqual(markedTerms(block({ known: true }), canvas()), []);
  assert.deepEqual(markedTerms(block({ collapsed: true }), canvas()), []);
});

test("splitting reconstructs the text exactly", () => {
  const marks = markedTerms(block(), canvas());
  const runs = splitByTerms(LONG, marks);
  assert.equal(runs.map((run) => run.text).join(""), LONG, "🔴 not one character added, lost or moved");
  assert.equal(runs.filter((run) => run.mark).length, 2);
  for (const run of runs) {
    if (run.mark) assert.equal(run.text, run.mark.term);
  }
});

test("splitting a block with no marks yields the text and nothing else", () => {
  const runs = splitByTerms(LONG, []);
  assert.deepEqual(runs, [{ text: LONG, mark: null }]);
});
