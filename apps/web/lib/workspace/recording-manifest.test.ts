import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ABANDONED_AFTER_MS,
  appendPart,
  approximateSeconds,
  assemblyOrder,
  isContiguous,
  looksAbandoned,
  missingParts,
  newManifest,
  playability,
  recoverable,
  retirable,
  totalBytes,
  type RecordingManifest,
  type RecordingPart,
} from "./recording-manifest";
import { isOwnedPath, recordingPartPath } from "./recording-paths";

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
  return { index, path: recordingPartPath({ extension: "webm", recordingId: "r1", sequence: index, userId: "u1" }), bytes, uploadedAt: at };
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
  const paths = [0, 2, 10, 100].map((index) => recordingPartPath({ extension: "webm", recordingId: "r1", sequence: index, userId: "u1" }));
  assert.deepEqual([...paths].sort(), paths);
});

test("🔴 every part is written under the uploader's own id, or the bucket refuses it", () => {
  // The `recordings` bucket's RLS is (storage.foldername(name))[1] = auth.uid()::text on select,
  // insert AND delete. The first version of partPath returned "parts/<session>/…", whose first
  // segment is the literal "parts" — so every upload was refused by the database, silently,
  // because the capture loop treats a failed upload as something to retry rather than report.
  // The unit tests all passed against an injected uploader while nothing was being stored.
  const path = recordingPartPath({ extension: "webm", recordingId: "r1", sequence: 7, userId: "user-abc" });
  assert.equal(path.split("/")[0], "user-abc");
  assert.ok(isOwnedPath(path, "user-abc"));
  assert.equal(isOwnedPath(path, "someone-else"), false, "and one account cannot reach another's");
  assert.equal(isOwnedPath("parts/r1/00007.webm", "user-abc"), false, "the shape that was refused");
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

test("🔴 a set missing its first part is unplayable, not merely short", () => {
  // MediaRecorder emits ONE file cut into pieces. The container header rides in the first one,
  // so without it the rest is bytes rather than audio — a recovery that uploaded it would
  // report success and deliver silence.
  let headerless = manifest();
  for (const index of [1, 2, 3]) headerless = appendPart(headerless, part(index));
  assert.equal(playability(headerless), "unplayable");
  assert.deepEqual(
    recoverable([headerless], new Date("2026-08-11T11:00:00.000Z")),
    [],
    "and it is never offered back",
  );
});

test("a gap anywhere else is recoverable, because the lecture still plays with a skip", () => {
  // The distinction that matters to a student: 55 minutes with a hole beats nothing at all.
  let gapped = manifest();
  for (const index of [0, 1, 3]) gapped = appendPart(gapped, part(index));
  assert.equal(playability(gapped), "gapped");
  assert.equal(recoverable([gapped], new Date("2026-08-11T11:00:00.000Z")).length, 1);
});

test("playability names the empty and the complete cases too", () => {
  assert.equal(playability(manifest()), "empty");
  let whole = manifest();
  for (const index of [0, 1, 2]) whole = appendPart(whole, part(index));
  assert.equal(playability(whole), "complete");
});

test("the recovery offer can say roughly how much audio survived", () => {
  // Derived from the part cadence, not the bytes: the exact duration needs the decoded file,
  // which recovery does not have yet. Never overstates.
  let current = manifest();
  for (const index of [0, 1, 2]) current = appendPart(current, part(index));
  assert.equal(approximateSeconds(current, 20), 60);
  assert.equal(approximateSeconds(manifest(), 20), 0);
  // A gap does not shrink the estimate — the audio either side of it still happened.
  const gapped = appendPart(manifest(), part(5));
  assert.equal(approximateSeconds(gapped, 20), 120);
});

test("🔴 a recording is recoverable even though nobody pressed finish", () => {
  // The exact case this was built for: the tab died mid-lecture. Requiring a clean finish would
  // exclude it.
  const crashed = { ...manifest(), state: "recording" as const, parts: [part(0), part(1)] };
  const found = recoverable([crashed], new Date("2026-08-11T10:30:00.000Z"));
  assert.equal(found.length, 1);
  assert.equal(found[0]!.sessionId, "r1");
});

test("🔴 a device whose clock runs fast does not lose its recovery", () => {
  // Found by seeding a manifest in the browser and watching nothing appear. `updatedAt` is
  // written from the RECORDING DEVICE's clock, so a laptop a few seconds ahead — or one whose
  // timezone was corrected mid-lecture — produced a timestamp "in the future" and an earlier
  // sanity filter dropped it. Real audio in storage, nothing offering it back, no error.
  const ahead = { ...manifest(), parts: [part(0), part(1)], updatedAt: "2026-08-11T12:00:00.000Z" };
  const found = recoverable([ahead], new Date("2026-08-11T10:00:00.000Z"));
  assert.equal(found.length, 1, "the bytes exist regardless of what the clock says");
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

test("🔴 a live recording in another tab is never swept up by the prune", () => {
  // The dangerous case. A session that started ten seconds ago has no parts yet and is
  // therefore "unplayable" — pruning on playability alone would delete the recovery record of
  // the lecture currently being recorded, in the first seconds of it.
  const justStarted = { ...manifest(), parts: [], updatedAt: "2026-08-11T10:00:00.000Z" };
  const now = new Date("2026-08-11T10:00:10.000Z");
  assert.deepEqual(retirable([justStarted], now), [], "still live, still quiet-adjacent, keep it");
});

test("a record that can never be offered is retired once it has gone quiet", () => {
  const headerless = { ...manifest(), parts: [part(4), part(5)], updatedAt: "2026-08-11T10:00:00.000Z" };
  const later = new Date(Date.parse("2026-08-11T10:00:00.000Z") + ABANDONED_AFTER_MS + 1000);
  assert.equal(retirable([headerless], later).length, 1);

  // But a recoverable one is left alone however long it sits there — it is still worth offering.
  const good = { ...manifest(), sessionId: "r2", parts: [part(0), part(1)], updatedAt: "2026-08-11T10:00:00.000Z" };
  assert.deepEqual(retirable([good], later), []);
});
