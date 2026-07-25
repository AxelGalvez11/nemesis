// Deno unit tests (repo convention) for the study-artifact validators.
// Run: deno test --no-check apps/mobile/src/lib/study-artifact-content.test.ts
//
// These exist because the phone now WRITES these blobs as well as reading them
// (the chat tool lane). A question that cannot be scored has to be refused on the
// way IN, not discovered as a blank row on the Study page later.
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { bestAttempt, parseOutline, scoreAttempt, toQuestion, usableQuestions } from "./study-artifact-content.ts";

Deno.test("a well-formed question survives, trimmed and collapsed", () => {
  const question = toQuestion({
    answer: 2,
    options: ["  Alpha ", "Beta", "Gamma\n\nextra", "Delta"],
    q: "  Which   receptor is blocked  ",
    why: "Because it is.",
  });
  assertStrictEquals(question?.q, "Which receptor is blocked");
  assertStrictEquals(question?.options[0], "Alpha");
  assertStrictEquals(question?.options[2], "Gamma extra");
  assertStrictEquals(question?.answer, 2);
});

Deno.test("the model's own field names are accepted", () => {
  // Models reach for `question`/`explanation` about as often as `q`/`why`.
  const question = toQuestion({
    answer: 0,
    explanation: "First one.",
    options: ["yes", "no"],
    question: "Is this accepted",
  });
  assertStrictEquals(question?.q, "Is this accepted");
  assertStrictEquals(question?.why, "First one.");
});

Deno.test("an answer index outside the options is refused, not clamped", () => {
  // Clamping would silently mark a different option correct — a test that
  // teaches the wrong fact is worse than a test that never appears.
  assertStrictEquals(toQuestion({ answer: 4, options: ["a", "b"], q: "Q" }), null);
  assertStrictEquals(toQuestion({ answer: -1, options: ["a", "b"], q: "Q" }), null);
  assertStrictEquals(toQuestion({ answer: 1.5, options: ["a", "b"], q: "Q" }), null);
  assertStrictEquals(toQuestion({ answer: "1", options: ["a", "b"], q: "Q" })?.answer, 1);
});

Deno.test("a question with fewer than two options or no prompt is refused", () => {
  assertStrictEquals(toQuestion({ answer: 0, options: ["only"], q: "Q" }), null);
  assertStrictEquals(toQuestion({ answer: 0, options: ["a", "b"], q: "   " }), null);
  assertStrictEquals(toQuestion(null), null);
  assertStrictEquals(toQuestion("a question"), null);
});

Deno.test("usableQuestions keeps the good ones and drops the rest", () => {
  const kept = usableQuestions([
    { answer: 0, options: ["a", "b"], q: "Good one" },
    { answer: 9, options: ["a", "b"], q: "Bad index" },
    "not an object",
    { answer: 1, options: ["c", "d"], q: "Good two" },
  ]);
  assertStrictEquals(kept.length, 2);
  assertEquals(kept.map((question) => question.q), ["Good one", "Good two"]);
});

Deno.test("usableQuestions on a non-array is empty, never a throw", () => {
  // The argument comes straight off a model's JSON — it can be anything.
  assertEquals(usableQuestions(undefined), []);
  assertEquals(usableQuestions({ questions: [] }), []);
});

Deno.test("an outline is read bare, fenced, or inside a JSON wrapper", () => {
  const bare = "# RAAS\n- Renin\n  - Kidney";
  assertStrictEquals(parseOutline(bare), bare);
  assertStrictEquals(parseOutline("```markdown\n" + bare + "\n```"), bare);
  assertStrictEquals(parseOutline(JSON.stringify({ outline: bare })), bare);
});

Deno.test("prose with no heading and no bullet is not an outline", () => {
  // A mind map with no structure draws a single blob, which is not a mind map.
  assertStrictEquals(parseOutline("RAAS is a hormone system that regulates blood pressure."), null);
  assertStrictEquals(parseOutline("   "), null);
});

Deno.test("a JSON wrapper cut off by a token limit is salvaged, not pasted in raw", () => {
  // Real failure shape: the model's JSON runs out of tokens mid-string. Without
  // the salvage arm the bare fallback matches the "- point" line inside the
  // broken JSON and the map's first node renders as the text `{"outline": "`.
  assertStrictEquals(parseOutline('{"outline": "# Topic\\n- point'), "# Topic\n- point");
  assertStrictEquals(parseOutline('{"outline": "# Topic\\n- point"'), "# Topic\n- point");
  // Escapes are put back by JSON.parse, so a tab or a unicode escape survives.
  assertStrictEquals(parseOutline('{"outline": "# A\\n- b\\u00e9ta'), "# A\n- béta");
});

Deno.test("a wrapper with no readable outline field is refused outright", () => {
  // Refused rather than handed to the bare arm, which would return JSON
  // punctuation as outline text.
  assertStrictEquals(parseOutline('{"title": "x", "outline"'), null);
  assertStrictEquals(parseOutline('{"outline": "'), null);
  assertStrictEquals(parseOutline('{"nodes": ["# a", "- b"]'), null);
});

Deno.test("an unanswered question counts as missed, not as correct", () => {
  const questions = [
    { answer: 0, options: ["a", "b"], q: "One", why: "" },
    { answer: 1, options: ["a", "b"], q: "Two", why: "" },
  ];
  const attempt = scoreAttempt(questions, [0], "2026-07-24T00:00:00.000Z");
  assertStrictEquals(attempt.score, 1);
  assertStrictEquals(attempt.total, 2);
  assertEquals(attempt.missed, [{ picked: -1, questionIndex: 1 }]);
});

Deno.test("the best attempt wins, newest on a tie", () => {
  const attempts = [
    { at: "1", missed: [], score: 3, total: 5 },
    { at: "2", missed: [], score: 4, total: 5 },
    { at: "3", missed: [], score: 4, total: 5 },
  ];
  assertStrictEquals(bestAttempt(attempts)?.at, "3");
  assertStrictEquals(bestAttempt([]), null);
});
