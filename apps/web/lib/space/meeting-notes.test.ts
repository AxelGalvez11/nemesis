import assert from "node:assert/strict";
import { test } from "node:test";

import { clockOf, meetingProgress, transcriptLines } from "./meeting-notes";
import { summaryBlocks } from "./meeting-summary";

test("🔴 the written-up notes become blocks inside the meeting block", () => {
  const notes = "## Decisions\n\n- Ship the draft\n- Meet on Friday\n\nThe group agreed on scope.";
  const job = "5b7e2c1a-9d4f-4e8b-a6c3-2f1d0e9b8a7c";
  const { content, blocks } = summaryBlocks(notes, "meeting-1", job);
  assert.deepEqual(summaryBlocks(notes, "meeting-1", job).content, content, "the same job makes the same blocks, so two tabs never write two copies");
  const top = blocks.filter((b) => content.includes(b.id));
  assert.ok(top.length >= 3, "a heading, the list and a paragraph");
  assert.ok(top.every((b) => b.parent === "meeting-1"), "every top-level block sits inside the meeting block");
  assert.match(top[0]!.type, /header/);
  assert.ok(blocks.some((b) => b.type === "bulleted_list"));
});

test("the transcript is listed by paragraph, long paragraphs cut at sentence ends, with no invented times", () => {
  assert.deepEqual(transcriptLines("First point.\n\n  Second   point.  \n\n", "Sam's audio"), [
    { speaker: "Sam's audio", t: "", text: "First point." },
    { speaker: "Sam's audio", t: "", text: "Second point." },
  ]);
  const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} carries on for a while.`).join(" ");
  const lines = transcriptLines(long, "Sam's audio");
  assert.ok(lines.length > 1);
  assert.ok(lines.every((l) => l.text.length <= 650 && /\.$/.test(l.text)), "each line ends on a sentence");
  assert.equal(lines.map((l) => l.text).join(" "), long);
  assert.deepEqual(transcriptLines("   ", "Sam's audio"), []);
});

test("a job's stage reads as progress, and a failure keeps the worker's reason", () => {
  assert.deepEqual(meetingProgress({ status: "processing", stage: "queued" }), { status: "processing", label: "Getting the recording ready" });
  assert.deepEqual(meetingProgress({ status: "processing", stage: "transcribing" }), { status: "processing", label: "Transcribing" });
  assert.deepEqual(meetingProgress({ status: "processing", stage: "composing" }), { status: "processing", label: "Writing the summary" });
  assert.deepEqual(meetingProgress({ status: "ready", stage: "ready" }), { status: "ready" });
  assert.deepEqual(meetingProgress({ status: "failed", error: "The transcript came back empty." }), { status: "failed", error: "The transcript came back empty." });
  assert.equal((meetingProgress({ status: "failed", error: null }) as { error: string }).error, "This recording could not be written up.");
  assert.equal(clockOf(65), "1:05");
  assert.equal(clockOf(3725), "1:02:05");
});
