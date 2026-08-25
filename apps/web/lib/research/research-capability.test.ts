import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CAPABILITY_COPY, COMPOSER_CAPABILITIES, capabilityBrief, clearsOnSubmit } from "../learn/composer-capability";

// Deep research as a thing you turn on before you type, which is what the owner asked for twice.
//
// 🔴 I ARGUED AGAINST THIS AND I WAS WRONG, so the reasoning is recorded rather than quietly fixed.
// I said a research toggle would be the mode §38 bans. It is not, and `composer-capability.ts` had
// already drawn the line I needed: *"A CAPABILITY SAYS WHAT THIS SUBMISSION IS. A MODE SAYS WHAT
// NEMESIS SHOULD DO NEXT."* Deep research says what this submission is, clears the moment it is
// sent, and tells the teaching engine nothing. It is the same shape as Course and as `+ attach`,
// both of which §38 keeps.

const source = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

const code = (path: string): string =>
  source(path)
    .split("\n")
    .filter((line) => {
      const s = line.trim();
      return !(s.startsWith("//") || s.startsWith("*") || s.startsWith("/*") || s.startsWith("{/*"));
    })
    .join("\n");

test("Deep research is offered as a capability, worded for the learner", () => {
  assert.ok(COMPOSER_CAPABILITIES.includes("research"));
  const copy = CAPABILITY_COPY.research;
  assert.equal(copy.label, "Deep research");
  // §38's copy rule: a control names what the learner GETS, never what the system does. "Search
  // harder" or "Thorough mode" would both describe the machine, and both would be picked by people
  // who wanted an answer in the chat.
  assert.equal(copy.detail, "Get a detailed report");
  assert.ok(copy.icon.length > 0);
});

test("🔴 it clears on submit, which is the whole reason §38 permits it", () => {
  // A capability that survived its own submission would BE a mode, whatever it was called.
  for (const capability of COMPOSER_CAPABILITIES) {
    assert.equal(clearsOnSubmit(capability), true, `${capability} would persist across submissions`);
  }
});

test("🔴 research adds nothing to the turn packet", () => {
  // Course tells the model something it should know while reading the sentence. Research does not
  // reach the turn model at all: the learner declared it, so there is nothing left to weigh, and a
  // brief would only create a way for the model to overrule somebody who was explicit.
  assert.equal(capabilityBrief("research"), "");
  assert.ok(capabilityBrief("course").length > 50, "Course still needs its brief");
});

test("🔴 a declared run PLANS and stops, spending nothing until Start", () => {
  // The safety property, and the reason the card exists. A run is about a minute and several
  // metered searches out of a monthly budget shared with ordinary chat search. Planning is one
  // model call and no searches, so the preview is affordable and everything expensive waits.
  const session = code("../../components/workspace/learn/use-canvas-session.ts");
  assert.match(session, /if \(capability === "research"\)/, "the declaration is not acted on");
  assert.match(session, /await planResearch\(/, "it does not plan");
  assert.ok(
    !/capability === "research"[\s\S]{0,400}makeDeliverable\("report"/.test(session),
    "🔴 a declared submission starts the run directly, with no plan shown and nothing the learner can stop",
  );
  assert.match(session, /const startResearchPlan/, "there is no way to start the planned run");
  assert.match(session, /const cancelResearchPlan/, "there is no way to refuse it");
});

test("🔴 the approved plan is the plan that runs", () => {
  // Re-planning after Start would spend a call to produce a DIFFERENT list, and the run would go
  // and research something the learner never saw. That is worse than showing no plan at all.
  const runner = code("./run-research.ts");
  assert.match(runner, /if \(options\.plan\?\.length\)/, "an approved plan is not honoured");
  assert.match(runner, /subQuestions = \[\.\.\.options\.plan\]/);
  const canvas = code("../../components/workspace/learn/learning-canvas.tsx");
  assert.match(canvas, /subQuestions=\{session\.researchPlan\.subQuestions\}/, "the card shows a different list than it runs");
});

test("🔴 the card cannot start the same run twice", () => {
  const session = code("../../components/workspace/learn/use-canvas-session.ts");
  // Cleared BEFORE the run, so a second press has no plan to start.
  assert.match(session, /setResearchPlan\(null\);\s*\n\s*void makeDeliverable\("report"/);
});

test("no countdown starts a metered run on its own", () => {
  // The reference tool auto-starts after about a minute. A timer that spends a shared budget
  // because somebody walked away from their desk is the exact thing this card exists to prevent.
  const card = code("../../components/workspace/learn/research-plan-card.tsx");
  for (const timer of ["setTimeout", "setInterval", "requestAnimationFrame"]) {
    assert.ok(!card.includes(timer), `🔴 the plan card runs a ${timer} — it can start itself`);
  }
});

test("the learner is told what the run cost, not just that it finished", () => {
  const deliverables = code("../learn/canvas-deliverables.ts");
  assert.match(deliverables, /note: researchSummaryLine\(outcome\)/, "the numbers do not reach the notice");
  const session = code("../../components/workspace/learn/use-canvas-session.ts");
  assert.match(session, /result\.note/, "the notice ignores what the maker reported");
});
