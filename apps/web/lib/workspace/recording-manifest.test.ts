import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ABANDONED_AFTER_MS,
  appendPart,
  assemblyOrder,
  isContiguous,
  looksAbandoned,
  missingParts,
  newManifest,
  partPath,
  recoverable,
  totalBytes,
  type RecordingManifest,
  type RecordingPart,
} from "./recording-manifest";

const START = "2026-08-11T10:00:00.000Z";

function manifest(): RecordingManifest {
  return newManifest({
    sessionId: "r1",
    userId: "u1",
    mimeType: "audio/webm;codecs=opus",
    extension: "webm",
    targetPath: "u1/r1.webm",
    startedAt: START,
  });
}

function part(index: number, bytes = 1000, at = START): RecordingPart {
  return { index, path: partPath("r1", index, "webm"), bytes, uploadedAt: at };
}

test("🔴 an uploaded part can never be removed by any operation here", () => {
  // The invariant the whole module exists for. Nothing exported takes a part away.
  let current = manifest();
  for (let index = 0; index < 5; index += 1) current = appendPart(current, part(index));
  assert.equal(current.parts.length, 5);

  // Re-appending, appending out of order, appending a smaller retry — none may lose bytes.
  current = appendPart(current, part(2));
  current = appendPart(current, part(2, 10));
  current = appendPart(current, part(0, 1));
  assert.equal(current.parts.length, 5, "no duplicates and no drops");
  assert.equal(totalBytes(current), 5000, "a smaller retry must not shrink a part that landed");
});

test("a retry that captured MORE bytes replaces the shorter one", () => {
  // The other direction: a part truncated by a failed write should be upgraded, not kept.
  let current = appendPart(manifest(), part(0, 500));
  current = appendPart(current, part(0, 1200));
  assert.equal(current.parts.length, 1);
  assert.equal(totalBytes(current), 1200);
});

test("🔴 order is preserved regardless of arrival order — audio joined wrong is noise", () => {
  let current = manifest();
  for (const index of [3, 0, 4, 1, 2]) current = appendPart(current, part(index));
  assert.deepEqual(current.parts.map((entry) => entry.index), [0, 1, 2, 3, 4]);
  assert.deepEqual(
    assemblyOrder(current).map((path) => path.split("/").pop()),
    ["00000.webm", "00001.webm", "00002.webm", "00003.webm", "00004.webm"],
  );
});

test("🔴 part paths sort lexically into the correct order", () => {
  // Recovery may list storage rather than trust the manifest. Unpadded names sort part10 before
  // part2, which reassembles the lecture scrambled — and it plays, which is the dangerous part.
  const paths = [0, 2, 10, 100].map((index) => partPath("r1", index, "webm"));
  assert.deepEqual([...paths].sort(), paths);
});

test("a gap is reported rather than silently joined over", () => {
  let current = manifest();
  for (const index of [0, 1, 3, 4]) current = appendPart(current, part(index));
  assert.deepEqual(missingParts(current), [2]);
  assert.equal(isContiguous(current), false);
  // A file that jumps in time reads as a transcription error later, and nobody traces it back
  // to a failed upload three weeks earlier.
});

test("a complete recording reports no gaps", () => {
  let current = manifest();
  for (const index of [0, 1, 2]) current = appendPart(current, part(index));
  assert.deepEqual(missingParts(current), []);
  assert.ok(isContiguous(current));
  assert.deepEqual(missingParts(manifest()), [], "an empty manifest has no gaps, not a gap at 0");
});

test("🔴 a recording is recoverable even though nobody pressed finish", () => {
  // The exact case this was built for: the tab died mid-lecture. Requiring a clean finish would
  // exclude it.
  const crashed = { ...manifest(), state: "recording" as const, parts: [part(0), part(1)] };
  const found = recoverable([crashed], new Date("2026-08-11T10:30:00.000Z"));
  assert.equal(found.length, 1);
  assert.equal(found[0]!.sessionId, "r1");
});

test("a finished recording is not offered back, and neither is an empty one", () => {
  const done = { ...manifest(), state: "finalized" as const, parts: [part(0)] };
  const empty = { ...manifest(), sessionId: "r2", state: "recording" as const, parts: [] };
  assert.deepEqual(recoverable([done, empty], new Date("2026-08-11T10:30:00.000Z")), []);
});

test("the most recently touched recovery comes first", () => {
  const older = { ...manifest(), sessionId: "old", parts: [part(0)], updatedAt: "2026-08-11T09:00:00.000Z" };
  const newer = { ...manifest(), sessionId: "new", parts: [part(0)], updatedAt: "2026-08-11T10:00:00.000Z" };
  const found = recoverable([older, newer], new Date("2026-08-11T11:00:00.000Z"));
  assert.deepEqual(found.map((entry) => entry.sessionId), ["new", "old"]);
});

test("a session goes quiet before it is called abandoned", () => {
  const live = { ...manifest(), parts: [part(0)], updatedAt: "2026-08-11T10:00:00.000Z" };
  // Still mid-recording a minute later: not abandoned, or an active lecture would be offered
  // back to the person currently recording it.
  assert.equal(looksAbandoned(live, new Date("2026-08-11T10:01:00.000Z")), false);
  assert.equal(
    looksAbandoned(live, new Date(Date.parse(live.updatedAt) + ABANDONED_AFTER_MS + 1000)),
    true,
  );
});

test("appending never mutates the manifest it was given", () => {
  const before = manifest();
  const snapshot = JSON.stringify(before);
  appendPart(before, part(0));
  assert.equal(JSON.stringify(before), snapshot);
});

test("updatedAt tracks the last part that landed", () => {
  const later = "2026-08-11T10:05:00.000Z";
  const current = appendPart(manifest(), part(0, 1000, later));
  assert.equal(current.updatedAt, later, "how a stale session is recognised on recovery");
});
