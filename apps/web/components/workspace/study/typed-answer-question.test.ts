import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// ── type-to-answer in the test sitting ───────────────────────────────────────
//
// Owner, 2026-08-31: *"since the app has tests too, the test could include type
// to answer."* The pure halves (parsing, matching, scoring) are value-tested in
// lib/workspace/study-artifact-content.test.ts; what remains provable here is
// the WIRING in the dialog, which wraps hooks and a cloud store and cannot run
// under this runner — so these are source assertions, with calibrations.

const dialogs = readFileSync(new URL("./study-artifact-dialogs.tsx", import.meta.url), "utf8");

test("🔴 a typed question gets its own input inside the sitting, and submitting LOCKS it", () => {
  // Calibration: route the typed text anywhere but setPicked — or let an empty
  // submit through — and these redden.
  assert.match(dialogs, /data-testid="test-typed"/, "the typed arm lost its surface");
  assert.match(dialogs, /function submitTyped\(\) \{\s*if \(picked !== null\) return;\s*const text = typedDraft\.trim\(\);\s*if \(!text\) return;\s*setPicked\(text\);/, "submitTyped no longer locks the trimmed text as the pick");
  assert.match(dialogs, /onSubmit=\{\(event\) => \{\s*event\.preventDefault\(\);\s*submitTyped\(\);/, "Enter no longer submits the typed answer");
});

test("🔴 the reveal grades by the same rule the final score uses", () => {
  // One grader, two moments. Calibration: hand-roll a === comparison in the
  // dialog and this reddens — drift between the reveal and scoreAttempt is the
  // bug this test exists to prevent.
  assert.match(dialogs, /typedAnswerMatches\(picked, question\)/, "the reveal stopped asking typedAnswerMatches");
  assert.match(dialogs, /scoreAttempt\(questions, picks,/, "the final grade no longer comes from scoreAttempt");
});

test("a strict miss that is only the marks gets named, not a flat wrong", () => {
  // The re-check runs the SAME matcher with strict off — never a second rule.
  assert.match(dialogs, /typedAnswerMatches\(picked, \{ \.\.\.question, strict: false \}\)/, "the marks-only re-check no longer reuses the matcher");
  assert.match(dialogs, /the accent is the difference/, "the marks-only reveal copy is gone");
});

test("Explain and Rewrite stay choice-question tools", () => {
  // Their prompts are built from options and an answer index, which a typed
  // question does not have — so the buttons must not render for one.
  assert.match(dialogs, /picked !== null && !isTypedQuestion\(question\)/, "the sitting's Explain button lost its typed guard");
  assert.match(dialogs, /explainCandidate && !isTypedQuestion\(explainCandidate\)/, "the explain target is no longer narrowed to choice questions");
});

test("🔴 a typed miss shows the student what they wrote, not an option letter", () => {
  assert.match(dialogs, /typeof miss\.picked === "string" \? miss\.picked/, "the review no longer prints the typed text back");
  assert.match(dialogs, /you typed/, "the review lost the 'you typed' label");
});
