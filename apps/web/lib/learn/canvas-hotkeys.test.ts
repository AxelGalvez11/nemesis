import assert from "node:assert/strict";
import { test } from "node:test";

import {
  endsPushToTalk,
  isTypingTarget,
  pressesContinue,
  startsPushToTalk,
} from "./canvas-hotkeys";

// Every test here is a way a keyboard shortcut fails SILENTLY. None of them throw, none of them
// log, and all of them look like the feature simply not working — or, worse, like the learner's
// own typing going missing.

const KEY = { altKey: false, ctrlKey: false, key: " ", metaKey: false, repeat: false, shiftKey: false };
const CAN_TALK = { drawing: false, listening: false, supported: true, typing: false };

// ── Who has focus ───────────────────────────────────────────────────────────

test("a text field is being typed into", () => {
  assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isTypingTarget({ tagName: "input" }), true, "tag names arrive in either case");
  assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
});

test("🔴 a contenteditable counts, even though this surface has none today", () => {
  // The canvas has no contenteditable right now, so this guard protects nothing yet. It is here
  // because "complete today" is how a guard rots: add one later and space-to-talk starts eating
  // spaces out of it, with nothing failing until somebody types.
  assert.equal(isTypingTarget({ isContentEditable: true, tagName: "DIV" }), true);
});

test("the page body is not a text field", () => {
  assert.equal(isTypingTarget({ tagName: "BODY" }), false);
  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTypingTarget(null), false);
});

// ── Hold space to talk ──────────────────────────────────────────────────────

test("a bare space press on the page opens the microphone", () => {
  assert.equal(startsPushToTalk(KEY, CAN_TALK), true);
});

test("🔴🔴 space never opens the microphone while the learner is typing", () => {
  // The single worst outcome in this file: a space eaten out of an answer, and a microphone opened
  // over it. Calibration: drop the `typing` clause and this reddens alone.
  assert.equal(startsPushToTalk(KEY, { ...CAN_TALK, typing: true }), false);
});

test("🔴 nor while they are writing on the sheet", () => {
  assert.equal(startsPushToTalk(KEY, { ...CAN_TALK, drawing: true }), false);
});

test("🔴🔴 a key REPEAT does not restart dictation", () => {
  // Holding a key fires keydown over and over. `startDictation` snapshots the text typed
  // beforehand on every call, so a second one part-way through a hold would overwrite that
  // snapshot with the transcript already in the box — the learner's typing, gone mid-sentence.
  assert.equal(startsPushToTalk({ ...KEY, repeat: true }, CAN_TALK), false);
});

test("🔴 a modified space belongs to the operating system", () => {
  // Cmd-Space is Spotlight; Ctrl-Space and Alt-Space are input switchers and window menus.
  for (const modifier of ["metaKey", "ctrlKey", "altKey", "shiftKey"] as const) {
    assert.equal(startsPushToTalk({ ...KEY, [modifier]: true }, CAN_TALK), false, modifier);
  }
});

test("🔴 a browser with no speech API is not offered a microphone", () => {
  assert.equal(startsPushToTalk(KEY, { ...CAN_TALK, supported: false }), false);
});

test("space does not restart a microphone that is already listening", () => {
  assert.equal(startsPushToTalk(KEY, { ...CAN_TALK, listening: true }), false);
});

test("another key is not space", () => {
  assert.equal(startsPushToTalk({ ...KEY, key: "a" }, CAN_TALK), false);
  assert.equal(startsPushToTalk({ ...KEY, key: "Spacebar" }, CAN_TALK), false, "the legacy name is not the modern one");
});

test("🔴🔴 releasing is never refused", () => {
  // Starting is a decision, stopping is a release. If any state could block this, a state that
  // changed mid-hold would leave the microphone open — the one failure that costs money and
  // privacy rather than a click.
  assert.equal(endsPushToTalk({ key: " " }), true);
  assert.equal(endsPushToTalk({ key: "a" }), false);
});

// ── Command-Enter continues ─────────────────────────────────────────────────

const CONTINUE = { altKey: false, ctrlKey: false, key: "Enter", metaKey: true, repeat: false, shiftKey: false };

test("command-enter presses the Continue that is on screen", () => {
  assert.equal(pressesContinue(CONTINUE, { available: true, typing: false }), true);
});

test("🔴 control-enter does the same, because not everyone is on a Mac", () => {
  assert.equal(pressesContinue({ ...CONTINUE, ctrlKey: true, metaKey: false }, { available: true, typing: false }), true);
});

test("🔴🔴 it does nothing when there is no Continue on screen", () => {
  // `available` is `continueOwner`'s answer, which is null while a demonstration is owed and while
  // the canvas is busy. The shortcut inherits that guard rather than re-deciding it, so there is no
  // second place answering "may the learner move on?".
  assert.equal(pressesContinue(CONTINUE, { available: false, typing: false }), false);
});

test("🔴 it stands down inside the composer, where Enter already means something", () => {
  // The textarea submits on `Enter && !shiftKey`, which command-enter already satisfies — so it
  // submits there today and still does after this change.
  assert.equal(pressesContinue(CONTINUE, { available: true, typing: true }), false);
});

test("a bare Enter is not the shortcut", () => {
  assert.equal(pressesContinue({ ...CONTINUE, metaKey: false }, { available: true, typing: false }), false);
});

test("adding shift or alt makes it a different instruction", () => {
  assert.equal(pressesContinue({ ...CONTINUE, shiftKey: true }, { available: true, typing: false }), false);
  assert.equal(pressesContinue({ ...CONTINUE, altKey: true }, { available: true, typing: false }), false);
});
