import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  buildCanvasHistory,
  ORIGIN_MOMENT_ID,
  reconstructMoment,
  shortTitle,
  type CanvasHistorySource,
} from "./canvas-history";
import { MAX_ASSISTANT_TEXT, MAX_MOMENTS, appendMoment, makeMoment, sameMoment } from "./canvas-moment";

const HERE = import.meta.dirname;
const MOMENT_SOURCE = readFileSync(join(HERE, "canvas-moment.ts"), "utf8");
const HISTORY_SOURCE = readFileSync(join(HERE, "canvas-history.ts"), "utf8");
/** Comments quote the rules and legitimately name the modules being kept out. Strip them first. */
const strip = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const MOMENT_CODE = strip(MOMENT_SOURCE);
const HISTORY_CODE = strip(HISTORY_SOURCE);

function canvasWith(over: Partial<CanvasHistorySource> = {}): CanvasHistorySource {
  return {
    createdAt: "2026-08-23T09:00:00.000Z",
    moments: [],
    questions: [],
    responses: [],
    sources: [],
    ...over,
  };
}

// ── history is not evidence ─────────────────────────────────────────────────────────────────

test("🔴🔴 the history layer cannot reach the learner model", () => {
  // Calibration: add `import { projectLearnerState } from "./learner-evidence";` to either file
  // and this reddens alone. It is the whole separation the owner asked for — "History describes
  // what happened. Learner state describes what is currently known from all evidence."
  for (const [name, code] of [["canvas-moment.ts", MOMENT_CODE], ["canvas-history.ts", HISTORY_CODE]] as const) {
    assert.ok(!/learner-evidence/.test(code), `${name} imports the evidence layer`);
    assert.ok(!/projectLearnerState/.test(code), `${name} reaches for learner state`);
    assert.ok(!/weakConceptIds/.test(code), `${name} touches the weak-concept list`);
  }
});

test("🔴 rewinding cannot write — the reconstruction is a pure read", () => {
  const canvas = canvasWith({
    moments: [makeMoment({ assistantText: "Because it does.", kind: "assistant", userText: "Why?" }, "2026-08-23T10:00:00.000Z", "m1")],
  });
  const before = JSON.stringify(canvas);
  reconstructMoment(canvas, "m1");
  buildCanvasHistory(canvas);
  assert.equal(JSON.stringify(canvas), before, "reading history mutated the canvas");
});

test("🔴 the rail's own module never imports React", () => {
  // Pure derivations, the same rule `canvas-minimap.ts` holds. A hook in here would make the
  // history impossible to assert without a DOM.
  assert.ok(!/from "react"/.test(HISTORY_CODE));
  assert.ok(!/from "react"/.test(MOMENT_CODE));
});

// ── the cap, which is what keeps the document from growing without bound ────────────────────

test("moments are capped, oldest dropped first", () => {
  let moments = appendMoment([], { kind: "user", userText: "first" }, "2026-08-23T10:00:00.000Z", "m0");
  for (let index = 1; index <= MAX_MOMENTS + 10; index += 1) {
    moments = appendMoment(moments, { kind: "user", userText: `q${index}` }, "2026-08-23T10:00:00.000Z", `m${index}`);
  }
  assert.equal(moments.length, MAX_MOMENTS);
  assert.ok(!moments.some((moment) => moment.userText === "first"), "the oldest moment survived the cap");
});

test("🔴 a long answer is cut AND says so", () => {
  const moment = makeMoment(
    { assistantText: "x".repeat(MAX_ASSISTANT_TEXT + 500), kind: "assistant", userText: "why" },
    "2026-08-23T10:00:00.000Z",
    "m1",
  );
  assert.equal(moment.assistantText?.length, MAX_ASSISTANT_TEXT);
  assert.equal(moment.truncated, true, "a clipped answer that does not admit it reads as the whole answer");
});

test("an ordinary answer is not marked truncated", () => {
  const moment = makeMoment({ assistantText: "Short.", kind: "assistant", userText: "why" }, "2026-08-23T10:00:00.000Z", "m1");
  assert.equal(moment.truncated, undefined);
});

test("🔴 the same moment recorded twice in a row is one marker", () => {
  // Calibration: React runs effects twice in development StrictMode. Without `sameMoment` every
  // answer would land on the rail as two markers opening the same content.
  const first = appendMoment([], { assistantText: "A.", kind: "assistant", userText: "Why?" }, "2026-08-23T10:00:00.000Z", "m0");
  assert.equal(sameMoment(first.at(-1), { assistantText: "A.", kind: "assistant", userText: "Why?" }), true);
  assert.equal(sameMoment(first.at(-1), { assistantText: "A.", kind: "assistant", userText: "Why not?" }), false);
});

// ── titles are structural, and that is what makes them field-agnostic ───────────────────────

test("🔴🔴 a title is derived from shape, never from subject-matter words", () => {
  // CLAUDE.md: "would this work for a law student and a mechanical engineering student?" Four
  // fields, one rule, no keyword list anywhere in the file.
  assert.equal(shortTitle("Why does consideration fail here?"), "Why does consideration fail here");
  assert.equal(shortTitle("What is the yield stress of 6061-T6?"), "What is the yield stress of 6061-T6");
  assert.equal(shortTitle("## Ratio decidendi\n\nThe rule is..."), "Ratio decidendi");
  assert.equal(shortTitle("**Bolted joints.** Preload matters."), "Bolted joints");
});

test("🔴 no subject-matter keyword list exists in the projection", () => {
  // Calibration: this is the guard CLAUDE.md's standing rule asks for. A list of nouns from any one
  // discipline appearing here would mean the rail works for that field and quietly worse for
  // every other. The rule is checked as an absence because that is the only way it generalises.
  assert.ok(!/drug|dose|patient|clinical|pharma/i.test(HISTORY_CODE), "a domain word list crept into the titles");
});

test("a title stops at the first sentence and cuts on a word boundary", () => {
  assert.equal(shortTitle("One. Two. Three."), "One");
  const long = shortTitle("The quick brown fox jumped over the extremely lazy sleeping dog again", 20);
  assert.ok(long.endsWith("…"), long);
  assert.ok(long.length <= 21, long);
  assert.ok(!long.includes("extremel…"), "cut mid-word instead of at a boundary");
});

test("a fenced code block is not a title", () => {
  assert.equal(shortTitle("```\nconst x = 1\n```\nWhat does this return?"), "What does this return");
});

test("an empty passage yields an empty title rather than throwing", () => {
  assert.equal(shortTitle(""), "");
  assert.equal(shortTitle("   \n  "), "");
});

// ── the projection ──────────────────────────────────────────────────────────────────────────

test("every canvas has an origin row, including one recorded before this feature existed", () => {
  const entries = buildCanvasHistory(canvasWith());
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.momentId, ORIGIN_MOMENT_ID);
  assert.equal(entries[0]?.title, "Canvas started");
});

test("🔴 rows are ordered by when they happened, and ties keep their stored order", () => {
  // Two moments in one millisecond are real — an answer and the correction after it share a clock
  // tick. An unstable sort would let them swap between renders, which on a spatial memory reads as
  // the history rewriting itself.
  const same = "2026-08-23T10:00:00.000Z";
  const entries = buildCanvasHistory(
    canvasWith({
      moments: [
        makeMoment({ kind: "user", userText: "second" }, same, "b"),
        makeMoment({ kind: "user", userText: "first" }, "2026-08-23T09:30:00.000Z", "a"),
        makeMoment({ kind: "user", userText: "third" }, same, "c"),
      ],
    }),
  );
  assert.deepEqual(entries.map((entry) => entry.momentId), [ORIGIN_MOMENT_ID, "a", "b", "c"]);
});

test("a conversational row is titled by what the LEARNER asked", () => {
  const entries = buildCanvasHistory(
    canvasWith({
      moments: [
        makeMoment(
          { assistantText: "Potassium rises because aldosterone falls.", kind: "assistant", userText: "Why does potassium rise?" },
          "2026-08-23T10:00:00.000Z",
          "m1",
        ),
      ],
    }),
  );
  assert.equal(entries[1]?.title, "Why does potassium rise");
  assert.ok(entries[1]?.preview?.startsWith("Potassium rises"), entries[1]?.preview);
});

test("🔴 a source row reads its title through to the live source, never from a copy", () => {
  const canvas = canvasWith({
    moments: [makeMoment({ kind: "source", sourceIds: ["s1"] }, "2026-08-23T10:00:00.000Z", "m1")],
    sources: [{ excerpts: [], id: "s1", kind: "pdf", title: "Lecture 4" }] as CanvasHistorySource["sources"],
  });
  assert.equal(buildCanvasHistory(canvas)[1]?.title, "Lecture 4");

  // Renaming the source renames its history row. A stored copy would have frozen the old name.
  const renamed = {
    ...canvas,
    sources: [{ excerpts: [], id: "s1", kind: "pdf", title: "Week 4 handout" }] as CanvasHistorySource["sources"],
  };
  assert.equal(buildCanvasHistory(renamed)[1]?.title, "Week 4 handout");
});

test("🔴 a moment whose target is gone keeps its row rather than vanishing", () => {
  // `session-transcript.ts` made this exact call for the same reason: "dropping rows would make the
  // record quietly incomplete, which is worse than an ugly line".
  const canvas = canvasWith({
    moments: [makeMoment({ kind: "source", sourceIds: ["deleted"] }, "2026-08-23T10:00:00.000Z", "m1")],
  });
  const entries = buildCanvasHistory(canvas);
  assert.equal(entries.length, 2);
  assert.equal(entries[1]?.title, "Material attached");
  assert.equal(reconstructMoment(canvas, "m1")?.missing, true, "an empty reconstruction must say why");
});

test("the origin row reconstructs, and an unknown moment id returns null", () => {
  const canvas = canvasWith();
  assert.equal(reconstructMoment(canvas, ORIGIN_MOMENT_ID)?.title, "Canvas started");
  assert.equal(reconstructMoment(canvas, "nope"), null);
});

test("a rewound conversational moment carries both halves of the turn", () => {
  const canvas = canvasWith({
    moments: [makeMoment({ assistantText: "Because of X.", kind: "assistant", userText: "Why?" }, "2026-08-23T10:00:00.000Z", "m1")],
  });
  const view = reconstructMoment(canvas, "m1");
  assert.equal(view?.asked, "Why?");
  assert.equal(view?.said, "Because of X.");
  assert.equal(view?.missing, undefined);
});
