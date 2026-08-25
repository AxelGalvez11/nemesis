import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readTurnDecision, turnRouterMessages, type TurnContext } from "../learn/turn-router";

// When a turn becomes a minute of searching and a saved document, rather than an answer.
//
// 🔴 THIS FILE REPLACES A REGEX THAT LIVED FOR ONE DAY. `readResearchAsk` matched an explicit verb
// — research / look into / dig into / deep dive / investigate — and every objection in
// `turn-router.ts`'s own header applied to it on arrival: a learner writing "I need everything on X
// for my essay, with sources" got nothing, and a learner writing in Spanish could never get a
// report at all. `chat-intent.ts` had ALREADY deleted a `RESEARCH_PATTERN` for those reasons, in
// this product, and names it in the list of what it replaced. The decision is the model's now.

/**
 * A file's CODE, with comment lines removed.
 *
 * 🔴 Comments are stripped for the same reason `source-trust.test.ts` and `field-agnostic.test.ts`
 * strip them: a rule that bans a name has to be explained somewhere, and the explanation has to say
 * the name. All three of those guards failed on their own first run against their own headers,
 * which is a decent sign they are actually reading the file.
 */
const code = (file: string): string =>
  readFileSync(new URL(file, import.meta.url), "utf8")
    .split("\n")
    .filter((line) => {
      const s = line.trim();
      return !(s.startsWith("//") || s.startsWith("*") || s.startsWith("/*") || s.startsWith("{/*"));
    })
    .join("\n");

const EMPTY: TurnContext = {
  canvasTitle: "",
  clarified: [],
  courseRequested: false,
  demonstrated: 0,
  history: [],
  lessonInProgress: false,
  materialContext: "",
  memory: "",
  objectives: 0,
  passages: 0,
  searchesLeft: 0,
  sources: 0,
  stagedPassage: "",
  toolCatalogue: "",
  toolContext: "",
  toolRoundsLeft: 0,
  today: "Tuesday, 25 August 2026",
  webContext: "",
};

const contract = (): string =>
  turnRouterMessages({ context: EMPTY, utterance: "anything at all" })
    .map((message) => message.content)
    .join("\n");

test("🔴 there is no phrase list deciding what gets researched", () => {
  // The cheapest way for this to come back is somebody noticing one phrasing that did not trigger a
  // report and adding a pattern "just for that case". That is how the four language understanders
  // this product already deleted were each built, one exception at a time.
  const deliverables = code("../learn/canvas-deliverables.ts");
  assert.ok(!deliverables.includes("readResearchAsk"), "🔴 the research regex is back");
  assert.ok(
    !/deep[\s-]?dive|dig into|look into|investigate/i.test(deliverables),
    "🔴 a research phrase list appeared in the deliverables module",
  );
  const session = code("../../components/workspace/learn/use-canvas-session.ts");
  assert.match(session, /decision\.wantsReport/, "the session no longer honours the model's decision");
});

test("🔴 the contract states the three-way distinction, and states the cost", () => {
  // needsWeb, needsPapers and wantsReport answer three different questions. Told only that a report
  // is good, a model picks it for anything with sources in it, and a learner who wanted two lines
  // waits a minute for a file they did not ask for.
  const packet = contract();
  assert.match(packet, /"wantsReport"/, "the field is not in the contract");
  assert.match(packet, /not a bigger version of needsWeb/i, "the two are not distinguished");
  assert.match(packet, /saved into their Library/i, "the model is not told what a report IS");
  assert.match(packet, /about a minute/i, "the model is not told what a report COSTS");
  assert.match(packet, /The words they use do not decide this/i, "the model may think it is matching phrases");
  assert.match(packet, /when it is genuinely borderline, answer them now/i, "no tie-break, so it will over-choose");
});

test("a report ask survives the parser with the research question on it", () => {
  const decision = readTurnDecision(
    '```json\n{"then":"reply","say":"On it.","wantsReport":"does fin spacing affect natural convection performance",'
    + '"needsWeb":false,"needsPapers":false,"topic":"heatsinks","milestones":[],"remember":[],"visuals":[],'
    + '"wantsTest":false,"check":null,"checkFigure":null,"question":null,"webQuery":null,"webResults":null,"webFreshness":null}\n```\nOn it.',
  );
  assert.equal(decision?.wantsReport, "does fin spacing affect natural convection performance");
});

test("🔴 a report is NOT gated on the turn's kind, unlike a clarifying question", () => {
  // `question` parks the turn behind a card and is honoured only on a "study" turn, because the
  // cost of guessing a BUILD wrong is binning the work. A report touches nothing on the page: it
  // goes away, searches, and writes a note into the Library. "Here is the short answer, and I will
  // go research it properly" is a coherent turn and a common one.
  //
  // (`wantsTest` is deliberately NOT the comparison here. It was gated on `then === "study"` until
  // the rigid lane came out; a "quiz me" is an ordinary reply now, and gating it made the chips
  // unreachable. I asserted the old behaviour here first and the code corrected me.)
  const decision = readTurnDecision(
    '```json\n{"then":"reply","say":"Here is the short answer.","wantsReport":"how the commerce power narrowed after 1995",'
    + '"needsWeb":true,"needsPapers":false,"topic":"commerce clause","milestones":[],"remember":[],"visuals":[],'
    + '"wantsTest":true,"check":null,"checkFigure":null,"question":null,"webQuery":"commerce clause","webResults":null,"webFreshness":null}\n```\nHere is the short answer.',
  );
  assert.equal(decision?.then, "reply");
  assert.ok(decision?.wantsReport, "a report was dropped because the turn was a reply");
  assert.equal(decision?.question, null, "a clarifying question on a reply turn should still be dropped");
});

test("an empty or runaway research question is not a report", () => {
  // This string becomes the question a run plans its sub-questions from. An empty one would spend a
  // minute on nothing; an essay-length one plans badly.
  const build = (value: string) =>
    readTurnDecision(
      `\`\`\`json\n{"then":"reply","say":"ok","wantsReport":${value},"needsWeb":false,"needsPapers":false,`
      + '"topic":null,"milestones":[],"remember":[],"visuals":[],"wantsTest":false,"check":null,"checkFigure":null,'
      + '"question":null,"webQuery":null,"webResults":null,"webFreshness":null}\n```\nok',
    );
  assert.equal(build('""')?.wantsReport, null);
  assert.equal(build('"   "')?.wantsReport, null);
  assert.equal(build('"short"')?.wantsReport, null, "too short to be a research question");
  assert.equal(build("null")?.wantsReport, null);
  assert.equal(build("123")?.wantsReport, null, "a number is not a question");
  assert.equal(build(JSON.stringify("x".repeat(900)))?.wantsReport?.length, 500, "capped");
});

test("an ordinary turn asks for no report", () => {
  const decision = readTurnDecision(
    '```json\n{"then":"reply","say":"Because the fins add surface area.","needsWeb":false,"needsPapers":false,'
    + '"topic":"heatsinks","milestones":[],"remember":[],"visuals":[],"wantsTest":false,"check":null,"checkFigure":null,'
    + '"question":null,"webQuery":null,"webResults":null,"webFreshness":null}\n```\nBecause the fins add surface area.',
  );
  assert.equal(decision?.wantsReport, null, "a missing field became a report");
});
