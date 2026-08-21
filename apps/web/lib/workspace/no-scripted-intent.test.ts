import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Nothing on the path that reads a turn may read the learner's WORDS.
//
// 🔴 WHY A GUARD AND NOT JUST A DELETED FILE. Every keyword list this repo has ever carried was
// added the same way: a real phrasing failed in production, a rule was added for it, a neighbouring
// phrasing collided, an exception was added for that. The files' own comments record the cycle —
// `wordes?` never matching the singular "class"; "test me" having to be checked before the noun
// "test"; "exam"/"test"/"quiz" having to be REMOVED from a schedule list because "make me a
// practice test" then read as a timetable question. Deleting the lists does not stop the next one
// from being added under exactly the same pressure, at 2am, by somebody fixing a real bug. This
// does.
//
// 🔴 WHAT IT ACTUALLY FORBIDS. A regular expression tested against text a person typed, inside a
// module whose job is to decide what a turn MEANS. It does not touch parsing a document, validating
// a format, matching a marker Nemesis itself wrote, linting Nemesis's own output, or detecting a
// URL — all of which are facts about a string rather than readings of somebody's intent, and all of
// which are used freely elsewhere in this codebase.

const WATCHED: readonly string[] = [
  "../../../../packages/shared/src/chat-intent.ts",
  "../../../../packages/shared/src/chat-decision.ts",
  "../../../../packages/shared/src/brain-context.ts",
  "../../../../apps/mobile/src/lib/chat-routing.ts",
  "../../../../apps/mobile/src/lib/academic-skills.ts",
  "./chat-routing.ts",
  "./chat-intent.ts",
  "./chat-skills.ts",
  "./chat-web-search.ts",
  "../learn/turn-router.ts",
  "../learn/canvas-phrases.ts",
  "../learn/topic-grounding.ts",
];

/**
 * The names a person's own words go by in this codebase.
 *
 * Deliberately the identifiers rather than the types: a rule reading `text` is the shape being
 * forbidden regardless of what it was declared as, and a new name for the same thing is a name
 * somebody chose while writing the rule this test exists to catch.
 */
const USER_TEXT = [
  "text", "userText", "ask", "askText", "said", "question", "utterance", "message", "query",
  "prompt", "response", "compact", "trimmed", "normalised", "normalized", "topic", "raw", "wireText",
];

/**
 * The ONE exception, argued rather than assumed.
 *
 * A URL is not a reading of what somebody meant: the address is literally in the message, and no
 * interpretation of the sentence changes whether one is present. It is also checked in ADDITION to
 * the model's answer rather than instead of it, so it can only ever add a search, never suppress
 * one. See `carriesUrl` in chat-web-search.ts.
 */
const ALLOWED = new Set(["carriesUrl"]);

/** Source with comments and string literals removed, so prose about a regex is not a regex. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, '""')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

/** The name of the function a given offset sits inside, for a message somebody can act on. */
function enclosingFunction(source: string, index: number): string {
  const before = source.slice(0, index);
  const matches = [...before.matchAll(/(?:function|const)\s+([A-Za-z_$][\w$]*)/g)];
  return matches.at(-1)?.[1] ?? "(top level)";
}

for (const relative of WATCHED) {
  const path = new URL(relative, import.meta.url);
  const source = code(readFileSync(path, "utf8"));
  const name = relative.split("/").slice(-1)[0];

  test(`${name}: no regex is tested against what a person typed`, () => {
    // `/…/.test(text)` and `RE.test(text)` — the shape every deleted classifier was built from.
    const tested = [...source.matchAll(/([A-Za-z_$][\w$]*|\/(?:[^/\\\n]|\\.)+\/[a-z]*)\s*\.test\(\s*([A-Za-z_$][\w$]*)/g)];
    for (const match of tested) {
      const subject = match[2] ?? "";
      if (!USER_TEXT.includes(subject)) continue;
      const where = enclosingFunction(source, match.index ?? 0);
      assert.ok(
        ALLOWED.has(where),
        `${name}: ${where} tests a regex against \`${subject}\`. Deciding what a person MEANT belongs `
        + "to the model (chat-intent.ts / turn-router.ts); this file may only read facts about the turn. "
        + "If it is genuinely a fact rather than a reading — a URL, a marker Nemesis itself wrote — add "
        + "it to ALLOWED with the argument written down.",
      );
    }

    // `text.match(/…/)`, `text.replace(/…/, …)`, `text.search(/…/)` — the same rule wearing a
    // different method. `replace` is included because stripping phrases off somebody's sentence is
    // how `groundingQuery` inferred a subject, which is a reading by another name.
    const called = [...source.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.(match|search|replace)\(\s*\//g)];
    for (const match of called) {
      const subject = match[1] ?? "";
      if (!USER_TEXT.includes(subject)) continue;
      const where = enclosingFunction(source, match.index ?? 0);
      assert.ok(
        ALLOWED.has(where),
        `${name}: ${where} runs .${match[2]}() with a regex over \`${subject}\`.`,
      );
    }
  });
}

// 🔴 AND THE MODEL MUST STILL BE ASKED. A guard that only forbids regexes is satisfied by a file
// that decides nothing at all, so this pins the other half: the decision is a real model call, made
// before anything acts on the turn.
test("the turn decision is a model call, not a default nobody asked for", () => {
  const api = code(readFileSync(new URL("./chat-api.ts", import.meta.url), "utf8"));
  assert.match(api, /export async function readTurnIntent/, "the intent call was removed");
  assert.match(api, /intentMessages\(/, "the intent call stopped sending the intent packet");
  assert.match(api, /readChatIntent\(/, "the reply is no longer read as a decision");
  // Failure is a working turn, never an error: every path out of the call falls back to a decision
  // that answers the student on the tools-capable model.
  assert.match(api, /DEFAULT_INTENT/, "a failed read no longer falls back to a usable decision");
});
