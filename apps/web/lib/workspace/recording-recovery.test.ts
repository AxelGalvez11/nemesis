import assert from "node:assert/strict";
import { test } from "node:test";

import { appendPart, newManifest, partPath, type RecordingManifest, type RecordingPart } from "./recording-manifest";
import { recoveryOffer, recoveryOrder, recoveryRequest } from "./recording-recovery";

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

function part(index: number, bytes = 1000): RecordingPart {
  return { bytes, index, path: partPath("u1", "r1", index, "webm"), uploadedAt: START };
}

function withParts(indices: number[]): RecordingManifest {
  return indices.reduce((current, index) => appendPart(current, part(index)), manifest());
}

test("an interrupted lecture is offered back in minutes, not parts", () => {
  // "141 parts" is an engineer's number. "47m 00s" is one a student can decide with.
  const offer = recoveryOffer(withParts([...Array(141).keys()]), 20);
  assert.ok(offer);
  assert.equal(offer.duration, "47m 00s");
  assert.equal(offer.caveat, null, "a whole recording needs no caveat");
});

test("a recording over an hour reads in hours", () => {
  const offer = recoveryOffer(withParts([...Array(200).keys()]), 20);
  assert.equal(offer?.duration, "1h 06m");
});

test("🔴 a set whose first part never landed is not offered at all", () => {
  // The container header is in part 0. Offering these bytes would rebuild a file that uploads
  // cleanly, transcribes to nothing, and reads to the student as a lost lecture with no error
  // anywhere to explain it.
  assert.equal(recoveryOffer(withParts([1, 2, 3]), 20), null);
  assert.equal(recoveryOffer(manifest(), 20), null, "and neither is an empty one");
});

test("a gap in the middle is named, not hidden", () => {
  const offer = recoveryOffer(withParts([0, 1, 3, 4]), 20);
  assert.ok(offer);
  assert.match(offer.caveat ?? "", /skips once/);
  assert.equal(offer.duration, "1m 40s", "and the estimate still covers the whole span");
});

test("more than one gap is counted", () => {
  const offer = recoveryOffer(withParts([0, 2, 4]), 20);
  assert.match(offer?.caveat ?? "", /skips 2 times/);
});

test("🔴 the request carries the parts in playing order, whatever order they landed in", () => {
  const scrambled = [3, 0, 4, 1, 2].reduce((current, index) => appendPart(current, part(index)), manifest());
  assert.deepEqual(
    recoveryRequest(scrambled).parts.map((entry) => entry.index),
    [0, 1, 2, 3, 4],
  );
  assert.deepEqual(
    recoveryOrder(scrambled).map((path) => path.split("/").pop()),
    ["00000.webm", "00001.webm", "00002.webm", "00003.webm", "00004.webm"],
  );
});

test("the content type is the bare one the bucket allows", () => {
  // MediaRecorder reports "audio/webm;codecs=opus"; the bucket's allow-list holds bare types, so
  // sending the parameterised string risks a rejection for a container it actually accepts.
  assert.equal(recoveryRequest(withParts([0])).contentType, "audio/webm");
});

test("every path in the request is under the account's own prefix", () => {
  // The recover route reads with the service role and therefore bypasses the bucket's RLS, so
  // this is the shape it re-checks. A request that named another account's object would
  // otherwise hand back their audio.
  const request = recoveryRequest(withParts([0, 1]));
  assert.ok(request.parts.every((entry) => entry.path.startsWith("u1/")));
  assert.ok(request.targetPath.startsWith("u1/"));
});
