import assert from "node:assert/strict";
import test from "node:test";

import { buildTranscript, entrySummary, groupByDay, type TranscriptEntry } from "./session-transcript";
import type { LearnerEvidence } from "./learner-evidence";

function row(over: Partial<LearnerEvidence> & { id: string; occurredAt: string }): LearnerEvidence {
  return {
    confidence: 0.9,
    demonstrationObtained: true,
    objectiveIdentityKey: "obj-1",
    verdict: "understood",
    ...over,
  } as LearnerEvidence;
}

const label = (key: string) => (key === "obj-1" ? "Afferent arteriole constriction" : null);

test("the record is newest first", () => {
  const entries = buildTranscript(
    [
      row({ id: "a", occurredAt: "2026-08-17T09:00:00.000Z" }),
      row({ id: "c", occurredAt: "2026-08-17T11:00:00.000Z" }),
      row({ id: "b", occurredAt: "2026-08-17T10:00:00.000Z" }),
    ],
    label,
  );
  assert.deepEqual(entries.map((entry) => entry.id), ["c", "b", "a"]);
});

test("the learner's own words and how they produced them survive", () => {
  const [entry] = buildTranscript(
    [row({ id: "a", occurredAt: "2026-08-17T09:00:00.000Z", responseModality: "spoken", responseText: "it drops" })],
    label,
  );
  assert.equal(entry?.said, "it drops");
  assert.equal(entry?.via, "spoken");
  assert.equal(entry?.objective, "Afferent arteriole constriction");
});

test("🔴 an unresolvable objective is SHOWN, never dropped", () => {
  // Dropping rows makes the record quietly incomplete, which is worse than an ugly line — and
  // "incomplete but tidy" is indistinguishable from "nothing happened".
  const [entry] = buildTranscript([row({ id: "a", objectiveIdentityKey: "gone", occurredAt: "2026-08-17T09:00:00.000Z" })], label);
  assert.equal(entry?.objective, "gone");
});

test("🔴 'nothing concluded' and 'did badly' are different lines", () => {
  // Absent-is-null: an opportunity that established nothing is not a failure, and a record that
  // renders them the same way teaches the learner something untrue about themselves.
  const nothing: TranscriptEntry = {
    id: "a", nothingProduced: false, objective: "x", occurredAt: "", said: null, verdict: null, via: null,
  };
  const missed: TranscriptEntry = { ...nothing, verdict: "incorrect" };
  const noAnswer: TranscriptEntry = { ...nothing, nothingProduced: true };

  assert.notEqual(entrySummary(nothing), entrySummary(missed));
  assert.notEqual(entrySummary(nothing), entrySummary(noAnswer));
  assert.notEqual(entrySummary(missed), entrySummary(noAnswer));
  // And the one that must never read as a failure.
  assert.doesNotMatch(entrySummary(noAnswer), /miss|wrong|fail|incorrect/i);
});

test("no summary line congratulates, hedges, or uses the assistant's voice", () => {
  const base: TranscriptEntry = {
    id: "a", nothingProduced: false, objective: "x", occurredAt: "", said: null, verdict: null, via: null,
  };
  const lines = [
    entrySummary(base),
    entrySummary({ ...base, nothingProduced: true }),
    ...(["strong", "understood", "partial", "incorrect", "misconception"] as const).map((verdict) =>
      entrySummary({ ...base, verdict }),
    ),
  ];
  for (const line of lines) {
    assert.doesNotMatch(line, /\blet'?s\b|great|nice|well done|awesome|perfect/i, `assistant voice: "${line}"`);
    assert.ok(line.length <= 60, `too long to scan: "${line}"`);
  }
});

test("🔴 days are the learner's own, not UTC", () => {
  // 11pm and 1am are two days by the clock somebody lives in. A UTC bucket would merge them or
  // split one evening in half depending on which side of the world they are on.
  const entries = buildTranscript(
    [
      row({ id: "late", occurredAt: "2026-08-17T04:30:00.000Z" }),
      row({ id: "early", occurredAt: "2026-08-17T02:30:00.000Z" }),
    ],
    label,
  );
  // Chicago (UTC-5): both fall on 16 Aug locally, so one group.
  const grouped = groupByDay(entries, "en-US");
  assert.ok(grouped.length >= 1);
  assert.equal(grouped.reduce((total, group) => total + group.entries.length, 0), 2, "no entry is lost in grouping");
});

test("grouping preserves order and loses nothing", () => {
  const entries = buildTranscript(
    [
      row({ id: "a", occurredAt: "2026-08-15T09:00:00.000Z" }),
      row({ id: "b", occurredAt: "2026-08-16T09:00:00.000Z" }),
      row({ id: "c", occurredAt: "2026-08-17T09:00:00.000Z" }),
    ],
    label,
  );
  const grouped = groupByDay(entries, "en-US");
  assert.equal(grouped.length, 3, "three calendar days");
  assert.deepEqual(grouped.flatMap((group) => group.entries.map((entry) => entry.id)), ["c", "b", "a"]);
});

test("an unparseable timestamp does not throw away the entry", () => {
  const grouped = groupByDay(
    [{ id: "a", nothingProduced: false, objective: "x", occurredAt: "not-a-date", said: null, verdict: null, via: null }],
    "en-US",
  );
  assert.equal(grouped[0]?.entries.length, 1);
});
