// Deno unit tests (repo convention) for the chat routing helpers — mirrors
// apps/web/lib/workspace/chat-routing.test.ts (translated to Deno's assert style
// to match this package's test convention).
// Run: deno test --no-check apps/mobile/src/lib/chat-routing.test.ts
import { assertEquals, assertMatch, assertNotEquals, assertNotMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyChatRequest,
  detectsSaveRequest,
  routeForTurn,
  routeInstruction,
  WORKSPACE_INSTRUCTION,
  type ChatRouteDecision,
} from "./chat-routing.ts";

// `casual: true` is part of the answer for "hello" and this assertion had gone
// stale without it (found 2026-08-21 while running this suite under node — Deno
// is not installed on this machine, so the file had not actually executed in a
// while). The flag is not decoration: api/chat.ts:581 reads it to skip the paid
// web-need pre-flight, so a greeting must carry it. Asserting the WHOLE object
// rather than a field at a time is what caught the drift; keep it that way.
Deno.test("classifyChatRequest: ordinary conversation stays on the least expensive lane", () => {
  assertEquals(classifyChatRequest("hello"), {
    casual: true,
    model: "deepseek-chat",
    route: "conversation",
    searchWeb: false,
  });
});

Deno.test("classifyChatRequest: learning is discipline-neutral and gets Flash thinking, not a premium model request", () => {
  const prompts = [
    "Explain eigenvectors geometrically",
    "Compare negligence and strict liability",
    "Debug this TypeScript recursion",
    "Analyze the symbolism in Beloved",
    "Derive the IS-LM equilibrium",
    "Teach me the renin-angiotensin system",
  ];
  for (const prompt of prompts) {
    const decision = classifyChatRequest(prompt);
    assertEquals(decision.route, "learning", prompt);
    assertEquals(decision.model, "deepseek-reasoner", prompt);
    assertEquals(decision.searchWeb, false, prompt);
    assertEquals(decision.reasoningEffort, undefined, prompt);
  }
});

Deno.test("classifyChatRequest: current-events and explicit-web prompts route to current + searchWeb", () => {
  assertEquals(classifyChatRequest("What is the latest Next.js release?"), {
    route: "current",
    model: "deepseek-reasoner",
    searchWeb: true,
  });
});

Deno.test("classifyChatRequest: research prompts get the premium reasoning effort", () => {
  assertEquals(classifyChatRequest("Write a literature review with peer-reviewed sources about urban heat islands"), {
    route: "research",
    model: "deepseek-reasoner",
    searchWeb: true,
    reasoningEffort: "high",
  });
});

Deno.test("routeInstruction: one line per route, mentioning its own framing", () => {
  assertMatch(routeInstruction("learning"), /learner's level/);
  assertMatch(routeInstruction("research"), /limitations/);
  assertMatch(routeInstruction("current"), /time-sensitive/);
  assertMatch(routeInstruction("conversation"), /directly/);
});

// ── The prompt must never ask for a raw address ──────────────────────────────
// 🔴 THIS IS THE REGRESSION TEST FOR THE OWNER'S "the responses still return url
// strings" (owner 2026-08-21). The base prompt and the evidence block had
// already been fixed to demand bracketed numbers, but routeInstruction still
// said "cite URLs beside supported claims" (research) and "cite relevant URLs"
// (current) — the two routes every searching turn actually takes — so the model
// received both rules in one request and followed the more concrete one.
// The assertion is deliberately about the WHOLE function, not the two lines that
// were wrong: the next raw-address instruction will be added to whichever route
// nobody is watching. `assertNotMatch` on /cite .*URLs?/i is what makes a
// re-sync from web (which still carries the contradictory wording) fail here
// instead of on a student's screen.
// Every route AND every evidence form: notebooks pass no `sources` prop either,
// so MessageBody's bare-URL demotion is off there too and an address written into
// a notebook answer stays a raw underlined address on screen.
Deno.test("routeInstruction: no route ever asks for a raw URL in the prose", () => {
  for (const evidence of ["numbered-web-results", "named-sources"] as const) {
    for (const route of ["research", "current", "learning", "conversation"] as const) {
      assertNotMatch(routeInstruction(route, evidence), /cite\s+(?:the\s+|relevant\s+)?URLs?/i, `${route}/${evidence}`);
    }
  }
});

// The two searching routes must actively teach the bracket form, in the SAME
// words chat-thread.ts uses, so the request never carries two citation styles.
// Explicit about the evidence form: the default IS chat's form, but a test that
// relies on a default cannot tell "chat is right" from "the default drifted".
Deno.test("routeInstruction: the searching routes ask for bracketed numbers, not addresses", () => {
  for (const route of ["research", "current"] as const) {
    assertMatch(routeInstruction(route, "numbered-web-results"), /cite them by their bracketed number, like \[1\]/, route);
    assertMatch(routeInstruction(route, "numbered-web-results"), /Never write a raw URL in the prose\./, route);
  }
});

// ── A turn whose evidence has no numbers must not be asked for numbers ───────
// 🔴 REGRESSION TEST FOR THE NOTEBOOK LEAK (owner 2026-08-21). The bracket fix
// above was right for chat and wrong for notebooks, which share this function:
// notebook sources are headed "### Source: <name>" and never numbered
// (notebook-model.ts:buildSourceContext), notebooks attach no live web results,
// and app/notebook.tsx renders through <MessageBody> with no `sources` prop —
// so citationsToMarkdown sees a source count of 0, every marker is out of range,
// and a "[1]" is left on screen as literal text pointing at nothing.
Deno.test("routeInstruction: named-sources evidence is never asked for a bracketed number", () => {
  for (const route of ["research", "current", "learning", "conversation"] as const) {
    assertNotMatch(routeInstruction(route, "named-sources"), /\[1\]/, route);
    assertNotMatch(routeInstruction(route, "named-sources"), /bracketed number/, route);
  }
  // …and it must still ask for attribution, or the grounded surface reads the
  // silence as permission not to attribute at all.
  for (const route of ["research", "current"] as const) {
    assertMatch(routeInstruction(route, "named-sources"), /name the source/, route);
    assertMatch(routeInstruction(route, "named-sources"), /Never write a raw URL in the prose\./, route);
  }
});

// The routes that carry no evidence say the same thing either way — the form is
// a property of the evidence, and those two turns have none to address.
Deno.test("routeInstruction: the evidence-free routes are identical under both forms", () => {
  for (const route of ["learning", "conversation"] as const) {
    assertEquals(
      routeInstruction(route, "named-sources"),
      routeInstruction(route, "numbered-web-results"),
      route,
    );
  }
});

// chat-thread.ts:buildWireMessages calls routeInstruction with one argument and
// is not this lane's file to edit, so the default has to BE chat's form. If the
// default is ever changed, chat silently starts asking for the wrong citation
// style — this is the test that catches it.
Deno.test("routeInstruction: the default form is chat's, for the one-argument caller", () => {
  for (const route of ["research", "current", "learning", "conversation"] as const) {
    assertEquals(routeInstruction(route), routeInstruction(route, "numbered-web-results"), route);
  }
});

// ── The workspace line must describe what this surface really sends ──────────
// 🔴 THIS TEST PINNED A FALSE SENTENCE ONCE ALREADY (owner 2026-08-21). It used
// to assert that WORKSPACE_INSTRUCTION says nothing about their workspace is
// attached up front, on the strength of a grep of the phone for the word
// "snapshot" coming back empty. The phone does not use web's word; it does send
// the thing. api/chat.ts:603 recalls the second-brain packet, :638 formats it,
// and chat-thread.ts:258 ships it as its own system message headed "Background
// retrieved automatically from this student's workspace" — the student's
// matching Library notes, linked notes, Calendar events and weak Study cards.
// What the phone lacks is web's structured LISTING, whose counts are complete;
// what it sends is a semantic recall of whatever matched the question. Both
// assertions below are about that distinction, not about the missing word.
Deno.test("WORKSPACE_INSTRUCTION: describes the semantic recall the phone really attaches", () => {
  // It must NOT deny the attachment — the exact false claim that shipped.
  assertNotMatch(WORKSPACE_INSTRUCTION, /nothing about their workspace is attached/i);
  // It must say what IS attached, and that it is a recall rather than a listing.
  assertMatch(WORKSPACE_INSTRUCTION, /semantic recall/);
  assertMatch(WORKSPACE_INSTRUCTION, /matched this question/);
  assertMatch(WORKSPACE_INSTRUCTION, /what the tools return THIS turn/);
  // Web's snapshot wording stays out: the phone builds no such document, and
  // "the counts are complete" (web chat-api.ts:313) is untrue of a recall.
  assertNotMatch(WORKSPACE_INSTRUCTION, /snapshot/i);
  // The "do not mistake a partial view for the whole picture" warning survived
  // BOTH rewrites, and now covers the recall as well as the tool results.
  assertMatch(WORKSPACE_INSTRUCTION, /may be empty/);
  assertMatch(WORKSPACE_INSTRUCTION, /partial by default/);
  assertMatch(WORKSPACE_INSTRUCTION, /read the complete state first/);
});

// Every tool the workspace line names must really be advertised by the phone —
// the same rule that made the bracket diverge from web's in the first place.
Deno.test("WORKSPACE_INSTRUCTION: names only tools the phone actually carries", () => {
  for (const tool of ["search_library", "list_calendar_events", "list_study_decks", "list_study_artifacts"]) {
    assertMatch(WORKSPACE_INSTRUCTION, new RegExp(tool), tool);
  }
  for (const webOnly of ["get_library_tree", "get_study_overview"]) {
    assertNotMatch(WORKSPACE_INSTRUCTION, new RegExp(webOnly), webOnly);
  }
});

// ── Save requests keep the tools-capable model ───────────────────────────────
// The prompt list is copied VERBATIM from the web suite, which is the only thing
// that keeps this file the faithful copy its header claims to be. Each phrasing
// MUST leave on deepseek-chat — the only model whose tool calls ride — and must
// carry no high effort, or the write turns back into prose that saves nothing.

const SAVE_PROMPTS = [
  "make me flashcards on beta blockers",
  "make flashcards about the Krebs cycle",
  "create a deck for pharmacology",
  "build me a mind map of the RAAS pathway",
  "turn this into a mind map",
  "generate a practice test on ACE inhibitors",
  "I need flashcards on cellular respiration",
  "Flashcards on cellular respiration",
  "Slides about cellular respiration",
  "Study notes on cellular respiration",
  "Practice test on cellular respiration",
  "Create a test on biochemistry",
  "add these to my deck",
  "save this as a note",
  "save this to my library",
  "put my exam on my calendar",
  "add my exam to my calendar",
];

Deno.test("a save request routes to the model whose tools work", () => {
  for (const prompt of SAVE_PROMPTS) {
    assertEquals(detectsSaveRequest(prompt), true, prompt);
    const decision = classifyChatRequest(prompt);
    assertEquals(decision.model, "deepseek-chat", prompt);
    assertNotEquals(decision.route, "conversation", prompt);
    assertEquals(decision.reasoningEffort, undefined, prompt);
    assertEquals(decision.savesToWorkspace, true, prompt);
  }
});

Deno.test("a save about a current topic keeps live search AND the tools model", () => {
  const decision = classifyChatRequest("make flashcards about the latest COVID variants");
  assertEquals(decision.model, "deepseek-chat");
  assertEquals(decision.searchWeb, true);
  assertEquals(decision.savesToWorkspace, true);
});

Deno.test("ordinary learning and research requests are not saves", () => {
  // "write" is deliberately not a save verb, and the ambiguous nouns only count
  // when anchored to the student's own deck/library/notes/calendar. Otherwise
  // every "explain X" would lose the reasoner it needs.
  for (const prompt of [
    "explain how beta blockers work",
    "Write a literature review with peer-reviewed sources about urban heat islands",
    "write a test for this function",
    "what's on my schedule today",
    "Teach me the renin-angiotensin system",
    "Compare negligence and strict liability",
  ]) {
    assertEquals(detectsSaveRequest(prompt), false, prompt);
  }
  assertEquals(classifyChatRequest("explain how beta blockers work").model, "deepseek-reasoner");
  assertEquals(classifyChatRequest("explain how beta blockers work").savesToWorkspace, undefined);
});

Deno.test("a reply to the test-preference question keeps the original save route", () => {
  const prior =
    "Before I build the test: what do you want for how many questions, the difficulty (easy, medium, hard, or mixed), and the question types (multiple choice, true/false, or a mix)?";
  assertEquals(detectsSaveRequest("20, hard, with a mix", prior), true);
  const decision = classifyChatRequest("20, hard, with a mix", prior);
  assertEquals(decision.model, "deepseek-chat");
  assertEquals(decision.savesToWorkspace, true);
});

// ── Deep research toggle vs a save ───────────────────────────────────────────

const FORCED_RESEARCH: ChatRouteDecision = {
  model: "deepseek-reasoner",
  reasoningEffort: "high",
  route: "research",
  searchWeb: true,
};

Deno.test("the Deep research toggle wins on an ordinary question", () => {
  assertEquals(routeForTurn("explain how beta blockers work", FORCED_RESEARCH), FORCED_RESEARCH);
});

Deno.test("a save beats the Deep research toggle, because research carries no tools", () => {
  // The toggle is a persistent switch the student may have flipped days ago;
  // "make me flashcards" is what they typed a second ago. Left the other way
  // round, the turn returns an essay and saves nothing, with no way to tell why.
  const decision = routeForTurn("make me flashcards on beta blockers", FORCED_RESEARCH);
  assertEquals(decision.model, "deepseek-chat");
  assertEquals(decision.savesToWorkspace, true);
  assertEquals(decision.reasoningEffort, undefined);
});

Deno.test("with the toggle off, routeForTurn is just the classifier", () => {
  for (const prompt of ["hello", "explain osmosis", ...SAVE_PROMPTS]) {
    assertEquals(routeForTurn(prompt, null), classifyChatRequest(prompt), prompt);
  }
});
