import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { THINKING_STANCE } from "@nemesis/shared";

import { chatSystemPrompt } from "./workspace/chat-api";

// 🔴 ONE PRODUCT, ONE CHARACTER, AND THIS FILE IS THE ONLY THING THAT KEEPS IT THAT WAY.
//
// Nemesis introduces itself in six different places across two apps, and until 2026-08-27 they had
// already drifted: the chat lane called itself "a rigorous study and research partner", the canvas
// called itself "an academic operating system", and the identical study-partner paragraph was
// copy-pasted into four files, two of them on the phone. Nobody did that on purpose. It is what
// happens when the character lives inside each surface instead of beside all of them.
//
// The owner's rule (2026-08-27) is that Nemesis must not be a yes man: it holds a position when a
// learner pushes back, it flags reasoning that does not hold, it gives a verdict rather than hiding
// behind both sides, and when someone is learning it asks for an attempt once before it tells them.
// That is `THINKING_STANCE` in packages/shared.
//
// 🔴 A STANCE ON FIVE SURFACES AND NOT THE SIXTH IS WORSE THAN NO STANCE AT ALL, which is why this
// is a guard and not a convention. A student who is told firmly they are wrong in the canvas and
// then agreed with in a notebook chat has not met a rigorous tutor; they have met a system whose
// answers depend on which window they were in, and the one they will believe is the one that
// flattered them. The failure is silent, it only shows up in an exam, and no other test in this
// repository would notice a new surface shipping without it.

/** The prompt-building modules that speak AS Nemesis. Each must carry the stance. */
const SURFACES: readonly { file: string; why: string }[] = [
  { file: "lib/learn/turn-router.ts", why: "the canvas conversation, where a learner argues back" },
  { file: "lib/workspace/chat-api.ts", why: "the chat lane" },
  { file: "lib/workspace/study-ai-extras.ts", why: "the study coach beside a card the student got wrong" },
  // 🔴 ADDED 2026-09-04 with the in-document answer lane. It has a follow-up field, so a learner
  // can push back on the answer without leaving the page they are reading — which is exactly the
  // test this list applies: can a student disagree with this output in the moment it is produced?
  { file: "lib/reader/comment-answer.ts", why: "the answer pinned beside a note, which a learner can argue with in place" },
];

const WEB = join(import.meta.dirname, "..");

/**
 * Surfaces that say "You are Nemesis" and are deliberately NOT conversations.
 *
 * 🔴 EXEMPT BECAUSE THEY HAVE NO INTERLOCUTOR, NOT BECAUSE THE STANCE IS OPTIONAL. Each of these
 * returns a JSON payload to a parser and is explicitly told it is not chatting. There is nobody to
 * push back at them, nobody to ask for an attempt, and a stance riding these turns would be paid
 * for on every generation while changing nothing a learner ever sees. Adding a surface here is a
 * real decision: the question to answer is "can a student disagree with this output in the moment
 * it is produced?", and if the answer is yes it is not exempt.
 */
const EXEMPT: readonly string[] = [
  // Writes the study document as JSON blocks. "You are not chatting" is in its own first line.
  "lib/learn/canvas-prompts.ts",
  // Builds a deliverable strictly from supplied material; its output is a file, not a reply.
  "lib/workspace/study-artifact-content.ts",
  // Researches a question and returns a JSON payload; "no greeting, no commentary" in its own text.
  "lib/research/research-prompts.ts",
];

test("every web surface that speaks as Nemesis carries the stance", () => {
  for (const { file, why } of SURFACES) {
    const source = readFileSync(join(WEB, file), "utf8");
    assert.ok(
      source.includes("THINKING_STANCE"),
      `${file} builds a Nemesis prompt without the stance (${why}). Import it from @nemesis/shared.`,
    );
  }
});

test("the assembled prompts really contain the text, not just the import", () => {
  // 🔴 THE IMPORT IS NOT THE WIRING. A module can import the constant, reference it in a comment,
  // and never put it in the string the model reads. Both chat prompts are pure functions or
  // constants, so the assembled output can be checked directly rather than inferred.
  assert.ok(chatSystemPrompt(true).includes(THINKING_STANCE), "tools-on chat prompt drops the stance");
  assert.ok(chatSystemPrompt(false).includes(THINKING_STANCE), "tools-off chat prompt drops the stance");
});

test("🔴 no NEW surface introduces Nemesis without one", () => {
  // The catch-all. Any file that opens a prompt with "You are Nemesis" is claiming the character,
  // so it inherits the character's stance. A new lane added six months from now trips this on the
  // day it is written rather than the day a student notices the product agreeing with them.
  //
  // Deliberately matches the SELF-INTRODUCTION, not the word "Nemesis": plenty of files mention the
  // product, and only these speak as it.
  const missing: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
      if (entry.includes(".test.")) continue;
      const source = readFileSync(path, "utf8");
      // The document writer and the judge are exempt below; everything else that says this must
      // carry the stance.
      if (!/"You are Nemesis[,']/.test(source)) continue;
      if (EXEMPT.some((suffix) => path.endsWith(suffix))) continue;
      if (!source.includes("THINKING_STANCE")) missing.push(path.slice(WEB.length + 1));
    }
  };
  walk(join(WEB, "lib"));
  assert.deepEqual(
    missing,
    [],
    `these introduce themselves as Nemesis but carry no stance:\n  ${missing.join("\n  ")}`,
  );
});
