import assert from "node:assert/strict";
import { test } from "node:test";

import { LEVEL_INSTRUCTIONS } from "./canvas-model";
import { lessonMessages } from "./canvas-prompts";

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
