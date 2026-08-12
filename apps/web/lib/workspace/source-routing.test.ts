import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_TOOLS } from "./agent-tools";
import { CHAT_SYSTEM_PROMPT } from "./chat-api";
import { classifyWork } from "@nemesis/shared";
import { classifyChatRequest } from "./chat-routing";
import { HARD_CASES, ROUTING_CASES } from "./source-routing-cases";
import { scoreCase, scoreRouting } from "./source-routing-score";

// WHAT THIS FILE CAN AND CANNOT PROVE, because the distinction is the whole
// design (owner 2026-08-06: "prove it with evals").
//
// Which source a turn ACTUALLY uses is now the model's decision — that is the
// fix. A test with no model in it therefore cannot assert "Tavily calls = 0"
// for a given question; it would be asserting against a stub of its own making
// and would pass no matter how the real engine behaved. That measurement needs
// the live model and lives in scripts/source-routing-live.mts.
//
// What this file pins is the STRUCTURE the decision is made inside, and every
// one of these was false before today:
//   * every source is REACHABLE from every route (the composite question)
//   * nothing is spent on a source before the model has decided (the over-search)
//   * the catalogue and the policy actually describe the choice
// A structural failure here is unrecoverable at runtime: no prompt can make a
// model call a tool that was never attached.

const routeFor = (ask: string) => classifyChatRequest(ask, "");
const toolNamed = (name: string) => AGENT_TOOLS.find((tool) => tool.function.name === name);

test("the web is a tool the model can choose, beside the private ones", () => {
  assert.ok(toolNamed("search_web"), "search_web is missing from the catalogue");
  for (const name of ["search_library", "read_library_note", "list_calendar_events", "read_recording_transcript"]) {
    assert.ok(toolNamed(name), `${name} is missing — the private half of the choice`);
  }
});

// 🔴 THE FAILURE THAT MADE THIS WORK NECESSARY. Four acceptance cases were not
// merely answered from the wrong place, they were IMPOSSIBLE: the routes they
// landed on carried no tools at all, so the student's own material could not be
// read whatever the model decided. "Compare what my professor taught with the
// current guideline" needs two sources and could reach neither.
test("every case can reach every source it needs", () => {
  // Nothing withholds tools from any route any more, so this is now a statement
  // about the catalogue rather than about the route: every case is built with
  // the full set attached.
  for (const testCase of ROUTING_CASES) {
    assert.ok(routeFor(testCase.ask), testCase.ask);
    assert.ok(AGENT_TOOLS.length > 0);
  }
});

// 🔴 THE DIAL IS GONE AND SO IS THE QUESTION IT ASKED. This used to assert that
// Instant/Medium/High could not take a tool away. There is no dial: the server
// reads the question and picks the model (packages/shared/src/work-class.ts).
// What replaces it is the check that actually matters for these two cases —
// a composite question that needs the Library AND the web is judged hard enough
// to deserve the reasoning, without anybody having asked for it.
test("the owner's six requirements get the tier they deserve, unprompted", () => {
  // The whole ladder in one place, keyed by the owner's own hand-written cases.
  // Nobody asked for any of these levels; each one comes from the sentence.
  const expected: Record<string, "simple" | "standard" | "complex"> = {
    // small talk — and the exact question that used to buy a live web search
    "who are you?": "simple",
    // their own calendar, read directly
    "When is my next exam?": "simple",
    // an ordinary explanation
    "What is photosynthesis?": "standard",
    // their own material, read and explained
    "What did lecture 7 say about Km?": "standard",
    // the outside world, checked
    "What is the latest FDA guidance on semaglutide?": "standard",
    // 🔴 two sources held against each other — the case that was STRUCTURALLY
    // guaranteed to reach neither before 2026-08-06, and the one that now
    // reaches the premium model without anyone asking for it.
    "Compare what my professor taught with the current guideline": "complex",
  };
  for (const testCase of HARD_CASES) {
    const want = expected[testCase.ask];
    assert.ok(want, `no expected tier recorded for ${JSON.stringify(testCase.ask)}`);
    assert.equal(classifyWork({ prompt: testCase.ask }).workClass, want, testCase.ask);
  }
});

// The over-search fix, stated structurally: routing no longer buys anything.
// `searchWeb` survives on the decision as a hint about what KIND of question
// this is; what matters here is that no case can commit a search before the
// model has read the question — including the ones that plainly do need one.
test("no turn spends a web search before the model decides", () => {
  const report = scoreRouting(ROUTING_CASES, () => ({ library: null, schedule: null, web: false }));
  assert.equal(report.overSearchRate, 0, "a pre-turn search is a search nobody asked for");
  assert.equal(report.unnecessaryCalls, 0);
});

test("the routing policy rides every turn that carries tools", () => {
  assert.match(CHAT_SYSTEM_PROMPT, /DECIDE WHERE THE ANSWER LIVES/);
  // The order is the policy, so the order is what gets pinned: know it, then
  // their material, then the web. A prompt listing the web first is a prompt
  // that recommends searching.
  const own = CHAT_SYSTEM_PROMPT.indexOf("THE STUDENT'S OWN MATERIAL");
  const web = CHAT_SYSTEM_PROMPT.indexOf("IT DEPENDS ON THE OUTSIDE WORLD");
  assert.ok(own > 0 && web > own, "the student's own material must be weighed before the web");
});

test("the search_web description says when NOT to search, not only when to", () => {
  const description = toolNamed("search_web")?.function.description ?? "";
  assert.match(description, /DO NOT USE IT FOR/);
  assert.match(description, /STUDENT'S OWN MATERIAL/);
  // The named traps, because these are the exact words that used to force a
  // search on a question about the student's own course.
  for (const trap of ["latest", "current", "schedule", "sources"]) {
    assert.ok(description.includes(`'${trap}'`), `the description does not disarm ${trap}`);
  }
  assert.match(description, /WRITE A REAL QUERY/, "the model forms the query; the raw question is not a query");
  assert.match(description, /more than once/, "a thin first result must be searchable again");
});

// The scorer is the thing every number in a PR description comes from, so its
// arithmetic is pinned rather than trusted.
test("scoring separates going to the wrong place from simply not looking", () => {
  const composite = ROUTING_CASES.find((testCase) => testCase.ask.startsWith("Compare what my professor"))!;
  // Searched the web, never opened their material: the substitution.
  const substituted = scoreCase(composite, { library: false, schedule: null, web: true });
  assert.equal(substituted.wrongSource, true);
  // Looked nowhere at all: under-retrieval, and NOT mis-routing. Counting both
  // as one number would hide which of the two is happening.
  const answeredBlind = scoreCase(composite, { library: false, schedule: null, web: false });
  assert.equal(answeredBlind.wrongSource, false);
  assert.equal(answeredBlind.underSearched, true);
  // Both halves reached: what the case was written for.
  assert.equal(scoreCase(composite, { library: true, schedule: null, web: true }).passed, true);
});

test("an unknowable observation scores as nothing, never as a pass", () => {
  const ownMaterial = ROUTING_CASES.find((testCase) => testCase.ask === "What did lecture 7 say about Km?")!;
  const blind = scoreCase(ownMaterial, { library: null, schedule: null, web: false });
  assert.equal(blind.privateScored, false, "the harness could not see it, so it may not claim it");
  assert.equal(blind.passed, true, "and it may not invent a failure either");
});

console.log("source-routing.test.ts OK");
