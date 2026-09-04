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
import {
  DEMOTED_ASSISTANT_TEXT,
  MAX_ASSISTANT_TEXT,
  MAX_MOMENTS,
  MOMENT_TEXT_BUDGET,
  fileMoment,
  makeMoment,
  sameMoment,
} from "./canvas-moment";
import type { CanvasMoment } from "./canvas-moment";

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
  let moments = fileMoment([], { kind: "user", userText: "first" }, "2026-08-23T10:00:00.000Z", "m0").moments;
  for (let index = 1; index <= MAX_MOMENTS + 10; index += 1) {
    moments = fileMoment(moments, { kind: "user", userText: `q${index}` }, "2026-08-23T10:00:00.000Z", `m${index}`).moments;
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
  const first = fileMoment([], { assistantText: "A.", kind: "assistant", userText: "Why?" }, "2026-08-23T10:00:00.000Z", "m0").moments;
  assert.equal(sameMoment(first.at(-1), { assistantText: "A.", kind: "assistant", userText: "Why?" }), true);
  assert.equal(sameMoment(first.at(-1), { assistantText: "A.", kind: "assistant", userText: "Why not?" }), false);
  // 🔴 AND FILING IT AGAIN CHANGES NOTHING, WHICH IS THE HALF THE PRODUCT ACTUALLY DEPENDS ON.
  // `sameMoment` being right is only useful if `fileMoment` acts on it.
  const twice = fileMoment(first, { assistantText: "A.", kind: "assistant", userText: "Why?" }, "2026-08-23T10:00:01.000Z", "m1");
  assert.equal(twice.moments.length, 1, "one answer landed on the rail twice");
  assert.equal(twice.id, "m0", "a duplicate did not report the row it duplicates");
});

test("🔴🔴🔴 attaching seven files records seven files, in ONE row", () => {
  // Owner, 2026-09-03, on a canvas of his own: *"I dropped in these folders… when I refreshed the
  // page… it pretty much didn't show the sources that I dropped in."*
  //
  // 🔴 SIX OF HIS SEVEN LECTURES WERE DELETED BY THE DUPLICATE GUARD. A `source` moment carries no
  // text, no question and no response, so every field `sameMoment` compared was `undefined` on
  // both sides and any two consecutive attachments were "the same moment recorded twice". Read out
  // of his production row: `sources` held all seven files, `moments` held ONE source moment with
  // `sourceIds: ["s1"]`.
  //
  // Calibration: drop `sameIds` from `sameMoment` and the first assertion reddens.
  let moments: readonly CanvasMoment[] = [];
  const names = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"];
  for (const [at, sourceId] of names.entries()) {
    moments = fileMoment(moments, { kind: "source", sourceIds: [sourceId] }, `2026-09-03T18:56:0${at}.000Z`, `m${at}`).moments;
  }
  assert.deepEqual(moments.at(0)?.sourceIds, names, "the attachments did not all survive");

  // 🔴 AND THEY ARE ONE ROW, NOT SEVEN. Dropping a folder in calls this once per file; a row per
  // file is seven lines in the conversation and seven marks on the rail, and thirty for thirty
  // files, which is the case the owner actually works in.
  assert.equal(moments.length, 1, "one drop became several rows");
  assert.equal(moments[0]?.occurredAt, "2026-09-03T18:56:00.000Z", "the row's time moved to the last file");

  // 🔴 ANYTHING IN BETWEEN ENDS THE RUN, because a file attached after an exchange belongs to that
  // later part of the conversation rather than to the first drop.
  const asked = fileMoment(moments, { kind: "assistant", userText: "help me learn this" }, "2026-09-03T18:57:00.000Z", "m7").moments;
  const later = fileMoment(asked, { kind: "source", sourceIds: ["s8"] }, "2026-09-03T18:58:00.000Z", "m8").moments;
  assert.equal(later.length, 3, "a later attachment folded back into the first drop");
  assert.deepEqual(later.at(-1)?.sourceIds, ["s8"]);
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

test("🔴 a canvas with no moments projects an EMPTY history — no synthesised origin row", () => {
  // Owner cut, 2026-08-23: "remove the all history and the canvas started, because that's not
  // really necessary for the rail." The origin row spent a marker slot announcing the one event
  // every canvas shares. Calibration: prepend it again in buildCanvasHistory and this reddens.
  assert.deepEqual(buildCanvasHistory(canvasWith()), []);
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
  assert.deepEqual(entries.map((entry) => entry.momentId), ["a", "b", "c"]);
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
  assert.equal(entries[0]?.title, "Why does potassium rise");
  assert.ok(entries[0]?.preview?.startsWith("Potassium rises"), entries[0]?.preview);
});

test("🔴 a source row reads its title through to the live source, never from a copy", () => {
  const canvas = canvasWith({
    moments: [makeMoment({ kind: "source", sourceIds: ["s1"] }, "2026-08-23T10:00:00.000Z", "m1")],
    sources: [{ excerpts: [], id: "s1", kind: "pdf", title: "Lecture 4" }] as CanvasHistorySource["sources"],
  });
  assert.equal(buildCanvasHistory(canvas)[0]?.title, "Lecture 4");

  // Renaming the source renames its history row. A stored copy would have frozen the old name.
  const renamed = {
    ...canvas,
    sources: [{ excerpts: [], id: "s1", kind: "pdf", title: "Week 4 handout" }] as CanvasHistorySource["sources"],
  };
  assert.equal(buildCanvasHistory(renamed)[0]?.title, "Week 4 handout");
});

test("🔴 `fromLearner` marks the moments the learner spoke in, and the projection still returns the rest", () => {
  // Owner, 2026-09-04, looking at a rail that listed a file name beside his question: *"the
  // attachment name is showing and it should only show the bubble prompts."* The rail filters on
  // this; the projection must not, because `learning-canvas.tsx` walks the array it gets back to
  // find the turn a rewind lands on, and a row missing here is a rewind that steps past its target.
  const entries = buildCanvasHistory(
    canvasWith({
      moments: [
        makeMoment({ assistantText: "Because aldosterone falls.", kind: "assistant", userText: "help me learn this" }, "2026-08-23T10:00:00.000Z", "asked"),
        makeMoment({ kind: "source", sourceIds: ["s1"] }, "2026-08-23T10:01:00.000Z", "attached"),
        // A turn that opened without a question: the KIND is the same as the first one, so a filter
        // written on `type` would have kept this and a filter on `fromLearner` does not.
        makeMoment({ assistantText: "Here is where that leaves you.", kind: "assistant" }, "2026-08-23T10:02:00.000Z", "unprompted"),
      ],
      sources: [{ excerpts: [], id: "s1", kind: "pdf", title: "Pre-Assignment.pdf" }] as CanvasHistorySource["sources"],
    }),
  );
  assert.deepEqual(entries.map((entry) => entry.momentId), ["asked", "attached", "unprompted"], "the projection dropped a row navigation needs");
  assert.deepEqual(
    entries.filter((entry) => entry.fromLearner).map((entry) => entry.title),
    ["help me learn this"],
    "the rail's filter would show something that is not one of the learner's own bubbles",
  );
});

test("🔴 a moment whose target is gone keeps its row rather than vanishing", () => {
  // `session-transcript.ts` made this exact call for the same reason: "dropping rows would make the
  // record quietly incomplete, which is worse than an ugly line".
  const canvas = canvasWith({
    moments: [makeMoment({ kind: "source", sourceIds: ["deleted"] }, "2026-08-23T10:00:00.000Z", "m1")],
  });
  const entries = buildCanvasHistory(canvas);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.title, "Material attached");
  assert.equal(reconstructMoment(canvas, "m1")?.missing, true, "an empty reconstruction must say why");
});

test("the origin id STILL reconstructs — a rewind stored before the cut may name it", () => {
  // The row left the projection (see above); the id keeps resolving so an old stored rewind lands
  // on the honest "empty start" view instead of a null that reads as data loss.
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

test("🔴🔴🔴 a real teaching answer survives the save WHOLE", () => {
  // Owner, 2026-09-01, holding his own canvas beside the same prompt in ChatGPT: ours ended
  // mid-word on screen — "…is exactly the picture you need to h" — at exactly 2000 characters,
  // 362 words, against ChatGPT's ~1,200 complete. The old cap's own note justified itself with
  // "a Nemesis reply is one short paragraph (contract rule 2)", a rule deleted when the canvas
  // became a chat. Nobody came back to the constant.
  //
  // 7,900 characters is the length of the ChatGPT answer it was measured against.
  const answer = "The steroid scaffold is four fused rings. ".repeat(190);
  assert.ok(answer.length > 7_800, `the fixture is only ${answer.length} chars`);
  assert.ok(answer.length < MAX_ASSISTANT_TEXT, "the fixture no longer fits under the cap");

  const moment = makeMoment({ assistantText: answer, kind: "assistant" }, "2026-09-01T18:34:44.620Z", "m1");

  assert.equal(moment.assistantText, answer.trim(), "the answer was cut on the way to disk");
  assert.equal(moment.truncated, undefined, "a whole answer was marked truncated");
});

test("🔴🔴 the row is STILL bounded — newest turns keep their text, oldest are demoted not dropped", () => {
  // Raising the per-answer cap without a total budget puts 80 x 16,000 = 1.2MB on every autosave.
  // That would be a different bug with the same cause: a number changed without the constraint
  // that justified it.
  // 🔴 EACH ANSWER IS DISTINCT, AND IT HAS TO BE. Twenty byte-identical replies in a row are what
  // `sameMoment` exists to collapse, so a fixture that repeats one string tests the duplicate guard
  // rather than the budget. The length is what this test is about; the last three characters carry
  // the turn number and the total is unchanged.
  const long = "x".repeat(MAX_ASSISTANT_TEXT - 3);
  let moments: readonly CanvasMoment[] = [];

  for (let turn = 0; turn < 20; turn++) {
    moments = fileMoment(
      moments,
      { assistantText: `${long}${String(turn).padStart(3, "0")}`, kind: "assistant" },
      `2026-09-01T00:00:${String(turn).padStart(2, "0")}.000Z`,
      `m${turn}`,
    ).moments;
  }

  const total = moments.reduce((sum, m) => sum + (m.assistantText?.length ?? 0), 0);
  assert.ok(total <= MOMENT_TEXT_BUDGET + MAX_ASSISTANT_TEXT, `moment text grew to ${total}`);

  // 🔴 NOTHING WAS DROPPED — every turn still has a marker for the rail.
  assert.equal(moments.length, 20, "a moment disappeared instead of being demoted");

  assert.equal(moments[moments.length - 1]?.assistantText?.length, MAX_ASSISTANT_TEXT, "the newest turn was demoted");
  assert.equal(moments[0]?.assistantText?.length, DEMOTED_ASSISTANT_TEXT, "the oldest turn kept its full text");
  assert.equal(moments[0]?.truncated, true, "a demoted turn does not admit it was cut");
});
