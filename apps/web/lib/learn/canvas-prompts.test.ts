import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { LEVEL_INSTRUCTIONS } from "./canvas-model";
import { commandMessages, documentText, lessonMessages, territoryMessages } from "./canvas-prompts";

test("🔴 NO EM DASHES: every system prompt carries the rule, not just the shared one", () => {
  // Owner rule. It binds what NEMESIS WRITES, which is almost everything on the Canvas below the
  // interface chrome, so it has to be an instruction the model actually receives.
  //
  // 🔴 COUNTED RATHER THAN SPOT-CHECKED, BECAUSE THE ONE THAT WOULD LEAK IS THE ONE NOBODY THINKS
  // OF. Ten of the eleven system prompts here are the shared `CANVAS_SYSTEM`; the eleventh is the
  // judge's own, and the judge writes the FEEDBACK a learner reads — the exact surface the owner
  // was looking at when they made the rule. Asserting "the shared prompt has it" would have passed
  // while that one leaked. A twelfth builder added later fails this until it opts in.
  const source = readFileSync(new URL("./canvas-prompts.ts", import.meta.url), "utf8");
  const systemPrompts = (source.match(/role: "system"/g) ?? []).length;
  const viaShared = (source.match(/content: CANVAS_SYSTEM/g) ?? []).length;
  const viaExplicit = (source.match(/NO_EM_DASH,/g) ?? []).length;

  assert.ok(systemPrompts > 0, "there must be system prompts to check");
  assert.equal(
    viaShared + viaExplicit,
    systemPrompts,
    `${systemPrompts} system prompts but only ${viaShared + viaExplicit} carry the no-em-dash rule — ` +
      "a new prompt must either use CANVAS_SYSTEM or append NO_EM_DASH",
  );

  // And the rule genuinely reaches the wire, rather than merely existing in the module.
  const system = lessonMessages({ level: null, sources: [], topic: "x" })
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");
  assert.ok(system.includes("Never use an em dash"), "the instruction must reach the model");
});

const userText = (level: Parameters<typeof lessonMessages>[0]["level"]) =>
  lessonMessages({ level, sources: [], topic: "Cardiac action potentials" })
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");

// ── the level a learner never gave ──────────────────────────────────────────
//
// 🔴 THE DEFECT THESE PIN. Nemesis no longer asks anyone to classify themselves, so almost every
// canvas now has no level. `generateLesson` used to paper over that with `?? "basics_known"`, which
// meant every learner who was never asked arrived at the model described as knowing the basics — an
// invented claim about a person, applied to everyone, and invisible because the prompt looked
// perfectly well-formed. Reinstate that default and the first test goes red.

test("🔴 a learner who was never asked is not described as knowing the basics", () => {
  const prompt = userText(null);
  for (const [level, instruction] of Object.entries(LEVEL_INSTRUCTIONS)) {
    assert.equal(prompt.includes(instruction), false, `leaked the "${level}" instruction`);
  }
});

test("an unknown level is stated as unknown rather than left silent", () => {
  // Saying nothing would let the model invent a pitch from the subject — "this is pharmacology, so
  // they must be a pharmacy student" — which is the same guess one layer down.
  assert.match(userText(null), /have not been told how much this learner already knows/i);
  assert.match(userText(null), /must not guess a level/i);
});

test("a level the learner actually expressed is still used", () => {
  // 🔴 THE FIELD IS NOT DEPRECATED, THE QUESTIONNAIRE IS. Someone who says "start me from scratch"
  // has given real information, and it should reach the prompt.
  const prompt = userText("fundamentals");
  assert.ok(prompt.includes(LEVEL_INSTRUCTIONS.fundamentals));
  assert.equal(prompt.includes(LEVEL_INSTRUCTIONS.advanced), false);
});

test("the learner's own words reach the prompt, so intent needs no picker", () => {
  const prompt = lessonMessages({ level: null, sources: [], topic: "teach me organic chemistry from scratch" })
    .map((message) => message.content)
    .join("\n");
  assert.match(prompt, /teach me organic chemistry from scratch/);
});

// ── the boundary the defect actually lived at ───────────────────────────────
//
// 🔴 THE TESTS ABOVE CALL `lessonMessages` DIRECTLY, AND THAT IS NOT WHERE THE BUG WAS. The
// substitution happened one layer out, in `generateLesson`, which is what the app actually calls —
// so a prompt-builder test passes happily while every real lesson is generated against an invented
// level. Calibrated and confirmed: re-adding `?? "basics_known"` to canvas-api.ts leaves all four
// tests above green.
//
// Driving the real call needs the chat transport, an auth key and a network round trip, none of
// which belong in a unit test. So this reads the call site instead. A source assertion is a blunt
// instrument and is used here deliberately, for one narrow previously-real regression: the rule is
// that the level travels from the canvas to the prompt UNCHANGED, and the only way to break it is
// to write a fallback at this exact line.

test("🔴 generateLesson does not substitute a level for a learner who never gave one", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("./canvas-api.ts", import.meta.url), "utf8");
  const call = source.slice(source.indexOf("export async function generateLesson"));
  // 🔴 COMMENTS STRIPPED FIRST. Without this the guard trips on the comment that explains the
  // removed default — it names `"basics_known"` in prose, and a guard that cannot tell code from
  // the note about the code is a guard that fails for the wrong reason and gets deleted.
  const body = call
    .slice(0, call.indexOf("\n}"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  const passesLevelThrough = /lessonMessages\(\{[^}]*level:\s*input\.level\s*[,}]/.test(body);
  assert.ok(passesLevelThrough, "generateLesson no longer forwards input.level unchanged");

  for (const level of Object.keys(LEVEL_INSTRUCTIONS)) {
    assert.equal(
      body.includes(`"${level}"`),
      false,
      `generateLesson names the "${level}" level, which means it is inventing one`,
    );
  }
});

// ── unknown stays unknown, everywhere ───────────────────────────────────────

test("🔴 no level is a global property of the learner", async () => {
  // "Advanced" is meaningless on its own: advanced at calculus, novice at organic chemistry. A
  // coarse label attached to a PERSON would leak into unrelated sessions and misteach them — the
  // "global mode" this architecture exists to remove. The level lives on one canvas or nowhere.
  const { readFile } = await import("node:fs/promises");
  // Comments stripped first, the same way the guard above does it: the doc comment on CanvasLevel
  // NAMES `user.level` in order to forbid it, and a guard that cannot tell code from the note
  // about the code fails for the wrong reason and gets deleted by whoever hits it next.
  const model = (await readFile(new URL("./canvas-model.ts", import.meta.url), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  for (const forbidden of ["user.level", "userLevel", "learnerLevel", "sessionMode"]) {
    assert.equal(model.includes(forbidden), false, `${forbidden} makes the level a property of the person`);
  }
});

// ── J2: neither `collapsed` nor `known` may decide what gets taught ──────────────────────────────

test("🔴 a collapsed block still reaches generation — a model may have collapsed it", () => {
  // `collapse_block` is an operation the MODEL may use on any chat command, so this boolean has two
  // possible authors and they are indistinguishable downstream. Filtering on it let a model's layout
  // decision silently remove material from recall and test generation, under a comment asserting the
  // learner had said so.
  const text = documentText([
    { content: "Losartan is an angiotensin receptor blocker.", id: "b1", type: "paragraph" },
    { collapsed: true, content: "Its brand name is Cozaar.", id: "b2", type: "paragraph" },
  ]);

  assert.ok(text.includes("angiotensin receptor blocker"));
  assert.ok(
    text.includes("Cozaar"),
    "a folded block is hidden from the reading flow, not withdrawn from what may be taught",
  );
});

test("🔴 a block marked 'I already know this' still reaches generation — self-report is not evidence", () => {
  // This text feeds recall and both test-generation branches, and those cards are written through to
  // study_decks/study_cards. Filtering here meant one click, with no demonstration behind it,
  // permanently removed material from spaced repetition.
  const text = documentText([
    { content: "The kidney regulates blood volume.", id: "b1", type: "paragraph" },
    { content: "Aldosterone increases sodium reabsorption.", id: "b2", known: true, type: "paragraph" },
  ]);

  assert.ok(text.includes("blood volume"));
  assert.ok(
    text.includes("Aldosterone"),
    "saying you know something is not demonstrating it, and must not suppress curriculum",
  );
});

test("🔴 every block reaches generation, whatever flags it carries", () => {
  const blocks = [
    { content: "One.", id: "b1", type: "paragraph" as const },
    { collapsed: true, content: "Two.", id: "b2", type: "paragraph" as const },
    { content: "Three.", id: "b3", known: true, type: "paragraph" as const },
    { collapsed: true, content: "Four.", id: "b4", known: true, type: "paragraph" as const },
  ];
  const text = documentText(blocks);
  for (const block of blocks) assert.ok(text.includes(block.content), `${block.id} was dropped`);
});

// ── §24: source ingestion is not source summarization ────────────────────────────────────────────

const LECTURE = {
  excerpts: [{ id: "s1:e4", label: "Insulin secretion", text: "Beta cells release insulin.", unitId: "u7" }],
  id: "s1",
  kind: "pdf",
  librarySourceId: "lib-1",
  title: "Physiology of Diabetes Mellitus",
} as never;

const askedOf = (messages: readonly { role: string; content: string }[]): string =>
  messages.find((message) => message.role === "user")?.content ?? "";

test("🔴 ACCEPTANCE: reading a document for knowledge NEVER asks for a document back", () => {
  // 🔴 §24, AND IT IS THE WHOLE POINT. The failure being guarded against is specific and shipped:
  // the owner uploaded a lecture and the Canvas opened on "What this document covers" followed by
  // paragraphs summarising the material they had just handed over.
  //
  // The lesson prompt asks for BLOCKS. This one asks for PAIRS and forbids prose in the same
  // sentence, so a summary is not something it can accidentally return.
  const asked = askedOf(territoryMessages({ count: 24, sources: [LECTURE], topic: "Diabetes" }));

  assert.match(asked, /name the specific, checkable facts IT teaches, as PAIRS/i);
  assert.match(asked, /Do not write a lesson, an introduction, an explanation, or any prose/i);
  assert.doesNotMatch(asked, /"blocks"/, "a block is a thing to read; this lane must not be able to request one");
  assert.doesNotMatch(asked, /heading/i);

  // And the material really is in there, with the ids a citation has to name.
  assert.match(asked, /\[s1:e4\]/);
});

test("🔴 a grounded reading takes what the DOCUMENT states, not what the model knows", () => {
  // Without this the lane launders the model's own knowledge of the subject into the learner's
  // lecture, and they are then asked about something their document never said.
  const asked = askedOf(territoryMessages({ count: 24, sources: [LECTURE], topic: "Diabetes" }));

  assert.match(asked, /Take only what the material actually states/i);
  assert.match(asked, /Do not add facts from your own knowledge/i);
  assert.match(asked, /"excerptId" MUST be the id of the excerpt the pair was read from/i);
  assert.match(asked, /If you cannot point at the excerpt a pair came from, leave the pair out/i);
});

test("🔴 the topic lane keeps its own wording, and asks for no excerpt it could not have", () => {
  // §18 is one runtime, not one prompt that pretends a topic has material.
  const asked = askedOf(territoryMessages({ count: 24, topic: "photosynthesis" }));

  assert.match(asked, /Someone wants to learn: "photosynthesis"/);
  assert.doesNotMatch(asked, /excerptId/, "there is nothing to cite, so asking for a citation invites an invented one");
  assert.match(asked, /Do not restate the topic itself as a fact/i);
});

test("🔴 \"Summarize this\" still works on a canvas that was never given anything to read", () => {
  // 🔴 §24 KEEPS THIS PATH EXPLICITLY, AND REMOVING THE OPENING LESSON IS WHAT PUT IT AT RISK. With
  // no blocks on the canvas, every scoped operation names a block that does not exist — so without
  // an empty-canvas case the learner's own request would silently produce nothing.
  const empty = askedOf(
    commandMessages({
      blocks: [],
      canvasTitle: "Physiology of Diabetes Mellitus",
      command: "Summarize this",
      concepts: [],
      level: null,
      selected: [],
      sources: [LECTURE],
    }),
  );

  assert.match(empty, /This canvas has no content yet/i);
  assert.match(empty, /replace_canvas/);
  assert.doesNotMatch(empty, /Document outline/, "there is no outline to show, and printing an empty one invites an edit to nothing");
  assert.match(empty, /\[s1:e4\]/, "and the summary is still grounded in their material");
});

test("🔴 the moment the canvas holds anything, whole-page rewriting is closed again", () => {
  // The scoping discipline is what keeps "fix this paragraph" from regenerating the page. The empty
  // case is an exception justified by there being no paragraph to lose, and it must expire the
  // instant there is one.
  const withContent = askedOf(
    commandMessages({
      blocks: [{ content: "Beta cells release insulin.", id: "b1", type: "paragraph" }] as never,
      canvasTitle: "Physiology of Diabetes Mellitus",
      command: "Summarize this",
      concepts: [],
      level: null,
      selected: [],
      sources: [LECTURE],
    }),
  );

  assert.doesNotMatch(withContent, /replace_canvas/);
  assert.match(withContent, /Change as little as possible/i);
  assert.match(withContent, /Document outline/);
});
