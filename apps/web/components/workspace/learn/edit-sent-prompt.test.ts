import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── editing a prompt you already sent ─────────────────────────────────────────────────────────
//
// Owner, 2026-09-01: *"add edit prompt"*. The reference puts the control under the learner's own
// bubble and swaps the bubble for a field holding the same words.

const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const EDIT = strip(read("./edit-sent-prompt.tsx"));
const CANVAS = strip(read("./learning-canvas.tsx"));

test("🔴🔴 editing RE-ASKS; it never rewrites or deletes a turn", () => {
  // `retryTurn` is `converse`, the one path a turn has ever taken, so the exchange being edited
  // files into the thread exactly as it would have and the new sentence becomes the current turn.
  // The reference forks the conversation at the edited message; doing that here would delete turns
  // the learner has already read, which is a far larger claim than "add edit prompt".
  assert.match(CANVAS, /onSubmit=\{\(next\) => \{[\s\S]*?retryTurn\(next\);/, "an edited prompt no longer goes down the ordinary turn path");
  assert.ok(!/setThread\(\s*\(past\)\s*=>\s*past\.slice/.test(CANVAS), "editing started truncating the thread");
});

test("🔴 the field is the bubble's own shape", () => {
  // A field that arrives in a different shape reads as a different object, and the learner loses
  // track of what they are editing. Same numbers as `learner-utterance.tsx`, measured off the
  // reference: radius 22px, padding 10/16, 16px on a 24px line.
  assert.match(EDIT, /rounded-\[22px\] px-\[16px\] py-\[10px\]/, "the editor left the bubble's geometry");
  assert.match(EDIT, /leading-\[24px\]/, "the editor left the bubble's line height");
});

test("🔴 the caret lands at the end, not over a selection", () => {
  // Selecting the whole thing means the first keystroke destroys what they were trying to amend,
  // which is the opposite of what "edit" promised.
  assert.match(EDIT, /setSelectionRange\(node\.value\.length, node\.value\.length\)/, "the editor selects the message again");
});

test("🔴 unchanged or emptied is a cancel, not a send", () => {
  // Re-asking the identical question spends a turn to produce the same answer; an emptied field is
  // somebody backing out.
  assert.match(EDIT, /if \(!next \|\| next === initial\.trim\(\)\) \{\s*onCancel\(\);/, "an unchanged prompt is sent again");
});

test("🔴 the composer's own keys, not a second set", () => {
  assert.match(EDIT, /event\.key === "Escape"/, "Escape stopped backing out");
  assert.match(EDIT, /event\.key === "Enter" && !event\.shiftKey/, "Enter/Shift+Enter left the composer's contract");
});

test("🔴 no edit offered while an answer is still forming", () => {
  // Two turns racing for one surface is the state this feature could most easily create.
  assert.match(CANVAS, /\{!turnInFlight && <EditSentPrompt/, "the edit control is offered mid-turn");
  // And a new turn closes the editor: the sentence it was editing is no longer the current one.
  assert.match(CANVAS, /setSendSeq\(\(n\) => n \+ 1\);\s*setEditingPrompt\(false\);/, "a new turn leaves the editor open on a stale sentence");
});
