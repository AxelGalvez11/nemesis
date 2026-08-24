// The model points at a picture and forgets to ask for one.
//
// 🔴🔴🔴 THE WHOLE FIGURE LANE WORKS EXCEPT THE MODEL'S HALF, MEASURED AGAINST PRODUCTION
// 2026-08-24. Feeding the real decision shape through the real `prepareAnswer` and the real
// `/api/learn/reference-image`: the resolve pass fired, one figure survived validation, and it
// carried a real captioned nephron diagram. What never happens is the model writing the visual.
// Asked "show me a labelled diagram of a nephron" it replied *"Here's a labelled diagram of a
// nephron [figure 1]."* with no `visuals` at all — after the packet had gained the figure shape,
// the marker-needs-a-payload rule AND the short-subject rule. Three instructions, no change.
//
// So code finishes the request, which is this product's own rule: the model emits a semantic
// request and trusted code owns the drawing. These tests hold the narrowness of that repair —
// every case it must decline is worth more here than the case it handles.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fillMissingFigures } from "./figure-fallback";

const wrap = (decision: unknown, prose: string) => "```json\n" + JSON.stringify(decision) + "\n```\n\n" + prose;
const REPLY = { then: "reply", topic: "nephron", milestones: [], needsWeb: false };

/** The decision as it comes back out, so a test can look at what was added. */
function decisionIn(text: string): Record<string, unknown> {
  const block = /```json\s*\n?([\s\S]*?)```/.exec(text);
  return JSON.parse(block?.[1] ?? "{}") as Record<string, unknown>;
}

test("🔴🔴 an orphaned marker gets a figure named by the turn's own topic", () => {
  const out = fillMissingFigures(wrap(REPLY, "Here's a labelled diagram of a nephron [figure 1]."));
  const visuals = decisionIn(out).visuals as Record<string, unknown>[];
  assert.equal(visuals.length, 1, "the marker was left with nothing to resolve against");
  assert.equal(visuals[0]?.kind, "figure");
  assert.equal(visuals[0]?.subject, "nephron", "the subject came from somewhere other than `topic`");
  assert.match(out, /\[figure 1\]/, "the marker was lost, so the picture has nowhere to land");
  assert.match(out, /Here's a labelled diagram of a nephron/, "the prose was altered");
});

test("🔴🔴 the subject is NEVER read out of the prose", () => {
  // 🔴 THE REASON THIS RULE EXISTS, measured against the live repository: "the stages of meiosis"
  // returns the life stages of Naegleria fowleri, "diagram of meiosis showing both divisions"
  // returns the layers of human skin. Every one came back `ok`. A wrong picture is worse than none
  // — it arrives captioned, credited and confidently placed beside prose about something else.
  const out = fillMissingFigures(
    wrap({ ...REPLY, topic: "meiosis" }, "Here's a diagram of the stages of meiosis showing both divisions [figure 1]."),
  );
  const visuals = decisionIn(out).visuals as Record<string, unknown>[];
  assert.equal(visuals[0]?.subject, "meiosis", "a subject was assembled from the sentence instead of taken from `topic`");
});

test("🔴🔴 it declines whenever the model was engaging with the array", () => {
  // A visual already present means the model was working with indices, and second-guessing that
  // risks stamping a picture onto the wrong marker — the positional hazard `figure-lookup.ts`
  // refuses a short result array for.
  const withVisual = wrap(
    { ...REPLY, visuals: [{ kind: "equation", learningGoal: "…", latex: "x^2" }] },
    "As shown [figure 1].",
  );
  assert.equal(fillMissingFigures(withVisual), withVisual, "it overwrote a visual the model wrote");

  // Two markers: which one is missing is ambiguous, so neither is filled.
  const twoMarkers = wrap(REPLY, "First [figure 1], then [figure 2].");
  assert.equal(fillMissingFigures(twoMarkers), twoMarkers, "it guessed at which of two markers to fill");

  // A marker that is not the first does not address index 0, which is the only slot being filled.
  const secondOnly = wrap(REPLY, "See [figure 2].");
  assert.equal(fillMissingFigures(secondOnly), secondOnly, "it filled index 0 for a marker addressing index 1");
});

test("🔴 a topic that is a description, not a name, is declined", () => {
  const wordy = wrap(
    { ...REPLY, topic: "how a four-stroke engine converts fuel into motion" },
    "Here it is [figure 1].",
  );
  assert.equal(fillMissingFigures(wordy), wordy, "a sentence was sent to the repository as a subject");

  for (const topic of ["", "   ", null, undefined, 42]) {
    const text = wrap({ ...REPLY, topic }, "Here it is [figure 1].");
    assert.equal(fillMissingFigures(text), text, `topic ${JSON.stringify(topic)} produced a figure request`);
  }
});

test("🔴 anything it cannot read is returned byte-for-byte", () => {
  for (const text of [
    "No block and no marker at all.",
    "```json\n{not json}\n```\n\nHere [figure 1].",
    wrap(REPLY, "No marker in this prose."),
    "```json\n[1,2,3]\n```\n\nHere [figure 1].",
  ]) {
    assert.equal(fillMissingFigures(text), text, "text was rewritten that should have been left alone");
  }
});

test("🔴🔴 the repair runs BEFORE the resolve pass, or it adds a picture nobody looked up", () => {
  // What it adds carries only a NAME. Ahead of `prepareAnswer`, that name goes through the same
  // lookup, validation and licence gate as anything the model wrote; after it, the figure would
  // reach the learner unresolved and be dropped — the repair would be silently useless.
  const chat = readFileSync(new URL("../../components/workspace/learn/canvas-chat.ts", import.meta.url), "utf8");
  assert.match(
    chat.replace(/\s+/g, " "),
    /prepareAnswer\(fillMissingFigures\(text\)/,
    "the repair no longer runs inside the resolve pass's input",
  );
});

test("🔴 the block it looks for is the same one everything else reads", () => {
  // Three files now agree about where the decision lives. A fourth pattern that drifted would
  // repair one shape and parse another — the subtler version of the bug this lane already had.
  const pattern = /const DECISION_BLOCK = (\/.*\/);/;
  const here = pattern.exec(readFileSync(new URL("./figure-fallback.ts", import.meta.url), "utf8"));
  const router = pattern.exec(readFileSync(new URL("./turn-router.ts", import.meta.url), "utf8"));
  assert.ok(here?.[1] && router?.[1], "one of the two files stopped declaring DECISION_BLOCK");
  assert.equal(here?.[1], router?.[1], "the repair looks for the decision somewhere else than the parser does");
});

console.log("figure-fallback.test.ts OK");
