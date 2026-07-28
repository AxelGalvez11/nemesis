import assert from "node:assert/strict";
import { test } from "node:test";

import { groupTurns } from "./session-turns";
import type { SessionMessage } from "./sessions-store";

const user = (at: string, content = "hi"): SessionMessage => ({ at, content, role: "user" });
const assistant = (at: string, content = "hello"): SessionMessage => ({ at, content, role: "assistant" });

// The exact shape chat_messages holds for a finished recording: one assistant
// row, no user row, artifact on meta.outputs. Before this fix it grouped to
// zero turns and the thread drew its empty state.
const recordingMessage: SessionMessage = {
  at: "2026-07-28T21:03:05.623Z",
  content: "Recording captured. The notes are saved in your Library at Nemesis/Recordings/Recording.md.",
  outputs: [{
    createdAt: "2026-07-28T21:03:04.969Z",
    durationSeconds: 101,
    id: "3912459f-fd27-4b3f-b827-459995c7421d",
    kind: "recording",
    notes: "## What this covered\n…",
    title: "Recording · Jul 28, 2026, 4:03 PM",
    transcript: "So the reviews were harsh …",
  }],
  role: "assistant",
};

test("a recording posted into an empty session is a turn of its own", () => {
  const turns = groupTurns([recordingMessage]);
  assert.equal(turns.length, 1);
  assert.equal(turns[0]?.user, null);
  assert.equal(turns[0]?.assistant, recordingMessage);
  assert.equal(turns[0]?.assistant?.outputs?.[0]?.kind, "recording");
});

test("a question and its answer stay one turn", () => {
  const q = user("1");
  const a = assistant("2");
  const turns = groupTurns([q, a]);
  assert.deepEqual(turns, [{ assistant: a, user: q }]);
});

test("an unanswered question is still a turn", () => {
  const q = user("1");
  assert.deepEqual(groupTurns([q]), [{ assistant: null, user: q }]);
});

test("a recording after a completed turn does not overwrite that answer", () => {
  const q = user("1");
  const a = assistant("2");
  const turns = groupTurns([q, a, recordingMessage]);
  assert.equal(turns.length, 2);
  assert.equal(turns[0]?.assistant, a);
  assert.equal(turns[1]?.user, null);
  assert.equal(turns[1]?.assistant, recordingMessage);
});

test("back-to-back assistant messages each keep their own turn", () => {
  const first = assistant("1", "one");
  const second = assistant("2", "two");
  const turns = groupTurns([first, second]);
  assert.equal(turns.length, 2);
  assert.equal(turns[0]?.assistant, first);
  assert.equal(turns[1]?.assistant, second);
});

test("a recording answers a question that is still waiting", () => {
  // Recording from inside an existing conversation whose last message was the
  // student's: the card belongs to that turn rather than starting a new one.
  const q = user("1");
  const turns = groupTurns([q, recordingMessage]);
  assert.deepEqual(turns, [{ assistant: recordingMessage, user: q }]);
});

test("grouping never mutates the messages it is given", () => {
  const q = user("1");
  const a = assistant("2");
  const input = [q, a, recordingMessage];
  const snapshot = JSON.stringify(input);
  groupTurns(input);
  assert.equal(JSON.stringify(input), snapshot);
});
