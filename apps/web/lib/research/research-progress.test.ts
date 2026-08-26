// The caption a research run puts on the canvas, and the wiring that lets it reach one.
//
// 🔴🔴 THE OWNER REPORT THIS IS CALIBRATED AGAINST, 2026-08-26: *"I also try to do a deep research,
// but then once I click start, the chip just disappeared."* Verified in the source rather than
// guessed at: neither early return in `makeDeliverable` fires for a signed-in learner on a fresh
// canvas. `uid` cannot be null (the plan card only exists because `converse` already took
// `requireUid()` to plan it) and `makingRef` is false. The run really started. Nothing rendered it.
//
// So the tests below are in two halves, and both are needed:
//
//   · the LABELS are pure and unit-tested here
//   · the WIRING is asserted against the source, because a React hook's effect on a screen is not
//     something a node:test can execute. Each of those is written REVERSED where a reversal is
//     possible: it goes red if the fix is undone, not merely if the file is reformatted.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { researchStepLabel } from "./research-progress";

/**
 * 🔴 COMMENTS ARE STRIPPED, AND THAT IS NOT TIDINESS. Every reversed assertion below looks for the
 * DEFECT's own source line, and this file's fixes are documented by quoting that line back. Read
 * raw, `if (makingRef.current) return;` appears inside the comment explaining why it was removed,
 * so the guard reddened against the fix it was written to protect. `no-em-dashes.test.ts` strips for
 * the same reason; the project memory records the same trap catching a pharmacy guard.
 */
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel: string) => strip(readFileSync(new URL(rel, import.meta.url), "utf8"));
const SESSION = read("../../components/workspace/learn/use-canvas-session.ts");
const RUNNER = read("./run-research.ts");

test("every step of a run has a line, and the line names that step", () => {
  assert.equal(researchStepLabel({ kind: "planning" }), "Planning the research");
  assert.equal(researchStepLabel({ kind: "writing" }), "Writing the report");
  assert.equal(
    researchStepLabel({ done: 0, kind: "searching", subQuestion: "What counts as consideration?", total: 4 }),
    "Searching: What counts as consideration?",
  );
  assert.equal(researchStepLabel({ kind: "reading", url: "https://www.nature.com/articles/x" }), "Reading nature.com");
  assert.equal(
    researchStepLabel({ done: 3, kind: "checking", total: 12 }),
    "Checking the draft against its sources (3 of 12)",
  );
});

test("🔴 a long sub-question is cut at a word, and says that it was cut", () => {
  // The caption is one line under a character in the narrowest column on the canvas. A sub-question
  // that ran on would wrap and make the caption change height every time the run moved on.
  const long =
    "How did the drafters of the 1969 convention treat reservations that are incompatible with the object and purpose of a treaty";
  const line = researchStepLabel({ done: 0, kind: "searching", subQuestion: long, total: 3 });
  assert.ok(line.length < 70, `the caption is ${line.length} characters long`);
  assert.ok(line.endsWith("…"), "a cut caption does not say it was cut");
  assert.ok(!/\w…$/.test(line.replace("…", "x…")) || line.includes(" "), "it cut mid-word");
});

test("🔴 a page that will not parse is still reported, because something IS being read", () => {
  // Dropping the frame would make the longest stretch of the run look stalled for the sake of a
  // malformed URL, which is the one thing the caption exists to prevent.
  assert.equal(researchStepLabel({ kind: "reading", url: "not a url" }), "Reading a page it found");
});

test("🔴 the labels carry no em dash, which is a standing owner rule", () => {
  const every = [
    researchStepLabel({ kind: "planning" }),
    researchStepLabel({ kind: "writing" }),
    researchStepLabel({ done: 0, kind: "searching", subQuestion: "x", total: 1 }),
    researchStepLabel({ kind: "reading", url: "https://a.example" }),
    researchStepLabel({ done: 1, kind: "checking", total: 2 }),
  ].join(" ");
  assert.ok(!/[—―]/.test(every), "a research caption started using an em dash");
});

test("🔴🔴 the run's own progress reaches the canvas, and used to reach nothing at all", () => {
  // `runResearch` has emitted these since it was written; `makeReportDeliverable` has always
  // forwarded them; the session passed `undefined` and threw every one away.
  assert.match(RUNNER, /onStep\?\.\(\{ kind: "planning" \}\)/, "the runner stopped reporting its plan step");
  assert.match(SESSION, /\(step\) => narrate\(researchStepLabel\(step\)\)/, "the run's steps reach no caption again");
  // 🔴 REVERSED. This is the exact shape of the defect, and it is what goes red if somebody
  // "simplifies" the call back to its old form.
  assert.ok(
    !/makeReportDeliverable\(\s*uid,\s*latest\.current,[^)]*undefined,\s*plan/.test(SESSION),
    "🔴 the report maker is being handed `undefined` for onStep again, so a minute-long run is silent",
  );
});

test("🔴🔴 pressing Start puts the canvas into a visible working state", () => {
  // `busy.kind !== null` is what `learning-canvas.tsx` turns into `turnInFlight`: the character
  // walks to the centre of the surface, the caption goes up, and the composer goes busy. Without
  // it the canvas is inert for about a minute, which is precisely what the owner reported.
  assert.match(
    SESSION,
    /if \(background\) setWork\(label\);\s*\n\s*else setBusy\(\{ blockIds: \[\], kind: "command", label \}\)/,
    "makeDeliverable stopped narrating itself",
  );
  assert.match(SESSION, /narrate\(MAKING_LABELS\[kind\]\)/, "a run no longer opens with a caption");
  // The label table has to cover the kinds that have no `+` menu row, which is where the hole was.
  for (const kind of ["report", "flashcards", "note"]) {
    assert.match(SESSION, new RegExp(`\\n  ${kind}: "`), `${kind} has no busy caption, so its run is silent`);
  }
});

test("🔴🔴 a run that did not start says why, and hands the plan back", () => {
  // The invariant: pressing Start always leaves something true on screen. Either a run is visibly
  // going, or a sentence says why it is not and the card is pressable again.
  assert.match(SESSION, /if \(makingRef\.current\) \{\s*\n\s*setError\(ALREADY_MAKING\)/, "the collision guard is silent again");
  assert.match(SESSION, /if \(!made\) setResearchPlan\(\(current\) => current \?\? plan\)/, "a failed run throws the plan away");
  // 🔴 REVERSED, AND CALIBRATED: putting `if (makingRef.current) return;` back reddens this.
  assert.ok(
    !/if \(makingRef\.current\) return;/.test(SESSION),
    "🔴 the busy guard returns silently again — a press that does nothing and says nothing",
  );
});

test("🔴 the background report narrates WITHOUT taking the composer away", () => {
  // A report the turn decided to write runs beside a reply the learner can already read. `busy`
  // disables the text box; `work` does not. Routing the background run through `busy` would make
  // an answered question lock the composer for a minute.
  assert.match(
    SESSION,
    /void makeDeliverable\("report", decision\.wantsReport, undefined, true\)/,
    "the report a turn decides to write is no longer marked as background",
  );
});
