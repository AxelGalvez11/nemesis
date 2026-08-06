import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_SESSION,
  hasSessionProgress,
  parseSessionState,
  popUndo,
  pruneSessionState,
  pushUndo,
  serializeSessionState,
  studySessionKey,
  type StudySessionState,
} from "./study-session-state";

const sitting: StudySessionState = {
  passedIds: ["a", "b"],
  priorityId: "c",
  progressById: { c: 1, d: 2 },
  retryIds: ["d"],
};

describe("study session persistence", () => {
  it("round-trips a half-finished sitting", () => {
    assert.deepEqual(parseSessionState(serializeSessionState(sitting)), sitting);
  });

  // The key must carry the account. A bare deck key would restore one
  // account's sitting into another account's session on a shared browser.
  it("keys by account and deck together", () => {
    assert.equal(studySessionKey("user-1", "deck-1"), "nemesis.web.study-session.user-1.deck-1");
    assert.notEqual(studySessionKey("user-1", "deck-1"), studySessionKey("user-2", "deck-1"));
    assert.equal(studySessionKey(null, "deck-1"), null);
    assert.equal(studySessionKey("user-1", null), null);
  });

  // Stored text is data from a previous version of the app, not something to
  // trust. None of these may throw into a render.
  it("restores an empty sitting from anything unreadable", () => {
    for (const raw of [null, "", "not json", "[]", '"a string"', "null", "42"]) {
      assert.deepEqual(parseSessionState(raw), EMPTY_SESSION, `failed on ${JSON.stringify(raw)}`);
    }
  });

  it("ignores a payload from a different version", () => {
    const future = JSON.stringify({ passedIds: ["a"], priorityId: null, progressById: {}, retryIds: [], version: 99 });
    assert.deepEqual(parseSessionState(future), EMPTY_SESSION);
  });

  it("drops junk inside an otherwise valid payload", () => {
    const messy = JSON.stringify({
      passedIds: ["a", 7, null, "b"],
      priorityId: 12,
      progressById: { good: 2, bad: "two", negative: -1, nan: Number.NaN },
      retryIds: "not an array",
      version: 1,
    });
    assert.deepEqual(parseSessionState(messy), { passedIds: ["a", "b"], priorityId: null, progressById: { good: 2 }, retryIds: [] });
  });

  it("knows an untouched sitting from a started one", () => {
    assert.equal(hasSessionProgress(EMPTY_SESSION), false);
    assert.equal(hasSessionProgress(sitting), true);
    assert.equal(hasSessionProgress({ ...EMPTY_SESSION, priorityId: "c" }), true);
    assert.equal(hasSessionProgress({ ...EMPTY_SESSION, progressById: { a: 1 } }), true);
  });

  // Cards get deleted or suspended between sittings. A stale id would keep a
  // finished sitting looking unfinished forever.
  it("prunes ids the deck no longer has", () => {
    const pruned = pruneSessionState(sitting, new Set(["a", "d"]));
    assert.deepEqual(pruned, { passedIds: ["a"], priorityId: null, progressById: { d: 2 }, retryIds: ["d"] });
  });

  it("prunes to empty when every card is gone", () => {
    assert.equal(hasSessionProgress(pruneSessionState(sitting, new Set())), false);
  });
});

describe("undo stack", () => {
  const entry = (cardId: string) => ({ cardId, progress: 0, snapshot: { dueAt: "2026-08-06" }, wasRetry: false });

  // The reported defect: undo worked exactly once, because the component kept
  // one slot and nulled it after unwinding.
  it("undoes more than once, most recent first", () => {
    let stack = pushUndo(pushUndo(pushUndo([], entry("a")), entry("b")), entry("c"));
    const first = popUndo(stack);
    assert.equal(first.entry?.cardId, "c");
    const second = popUndo(first.rest);
    assert.equal(second.entry?.cardId, "b");
    const third = popUndo(second.rest);
    assert.equal(third.entry?.cardId, "a");
    stack = third.rest;
    assert.equal(popUndo(stack).entry, null);
  });

  it("reports nothing to undo on an empty stack", () => {
    assert.deepEqual(popUndo([]), { entry: null, rest: [] });
  });

  it("never mutates the stack it is given", () => {
    const original = [entry("a")];
    pushUndo(original, entry("b"));
    popUndo(original);
    assert.equal(original.length, 1);
  });

  // A session-only learning step wrote nothing, so it has no snapshot — but it
  // still has to be undoable, or the counter and the queue drift.
  it("keeps session-only presses on the stack", () => {
    const stack = pushUndo([], { cardId: "a", progress: 1, snapshot: null, wasRetry: false });
    assert.equal(popUndo(stack).entry?.snapshot, null);
  });
});
