import assert from "node:assert/strict";
import { test } from "node:test";

import { recordingStoragePath } from "./recording-capture";
import {
  isOwnedPath,
  recordingFinalPath,
  recordingPartPath,
  recordingPartsPrefix,
} from "./recording-paths";

const UID = "11111111-1111-4111-8111-111111111111";

/** Every path this codebase can write into the `recordings` bucket. Add new builders HERE — the
 *  first test below is the one that would have caught the defect that started all of this. */
const EVERY_BUILDER: { name: string; build: (userId: string) => string }[] = [
  { build: (userId) => recordingPartPath({ extension: "webm", recordingId: "r1", sequence: 0, userId }), name: "part" },
  { build: (userId) => recordingPartPath({ extension: "webm", recordingId: "r1", sequence: 4321, userId }), name: "part (high sequence)" },
  { build: (userId) => recordingFinalPath({ extension: "webm", recordingId: "r1", userId }), name: "final" },
  { build: (userId) => recordingPartsPrefix({ recordingId: "r1", userId }), name: "parts prefix" },
  { build: (userId) => recordingStoragePath(userId, "r1", "webm"), name: "legacy recordingStoragePath" },
];

test("🔴 the first segment of every recording path is the authenticated user's id", () => {
  // THE TEST THIS MODULE EXISTS FOR. The bucket's RLS is, on select, insert AND delete:
  //
  //   bucket_id = 'recordings' AND (storage.foldername(name))[1] = auth.uid()::text
  //
  // The multipart uploader built `parts/<session>/…`, whose first segment is the literal word
  // "parts". Every upload was refused by the database — silently, because the capture loop
  // treats a failed upload as something to retry rather than something to report. The feature
  // passed its unit tests against an injected uploader while storing nothing at all.
  //
  // The rule is checked against EVERY builder rather than one, because the real defect was that
  // the contract was restated by hand in two files and one copy was wrong.
  for (const builder of EVERY_BUILDER) {
    const path = builder.build(UID);
    assert.equal(path.split("/")[0], UID, `${builder.name} does not start with the user id`);
    assert.ok(isOwnedPath(path, UID), `${builder.name} fails the ownership check`);
    assert.equal(isOwnedPath(path, "someone-else"), false, `${builder.name} is reachable by another account`);
  }
});

test("a path cannot be built without an owner", () => {
  // Loud, and deliberately not a silent fallback: a path with no owner is one the database will
  // refuse without telling anyone, which is the exact failure this whole module is a reaction to.
  for (const builder of EVERY_BUILDER) {
    assert.throws(() => builder.build(""), /user/i, `${builder.name} accepted an empty user id`);
    assert.throws(() => builder.build("   "), /user/i, `${builder.name} accepted a blank user id`);
  }
});

test("🔴 part sequences are zero-padded so a lexical listing is also the right order", () => {
  // A SAFEGUARD, not the ordering rule — assembly sorts numerically from the manifest. It matters
  // because a recovery that ever fell back to listing storage would otherwise join part10 before
  // part2, and the result still plays, which is what makes it dangerous.
  const paths = [0, 2, 10, 100, 1000].map((sequence) =>
    recordingPartPath({ extension: "webm", recordingId: "r1", sequence, userId: UID }),
  );
  assert.deepEqual([...paths].sort(), paths);
});

test("parts live under the recording they belong to", () => {
  const part = recordingPartPath({ extension: "webm", recordingId: "lecture-9", sequence: 3, userId: UID });
  assert.ok(part.startsWith(recordingPartsPrefix({ recordingId: "lecture-9", userId: UID })));
  // And one recording's prefix never matches another's parts.
  assert.ok(!part.startsWith(recordingPartsPrefix({ recordingId: "lecture-8", userId: UID })));
});

test("a fractional or negative sequence cannot produce a colliding path", () => {
  // Defensive: the sequence comes from a counter, but a path builder that silently accepted
  // rubbish would put two different runs of audio at one address.
  assert.equal(
    recordingPartPath({ extension: "webm", recordingId: "r1", sequence: -5, userId: UID }),
    recordingPartPath({ extension: "webm", recordingId: "r1", sequence: 0, userId: UID }),
  );
  assert.equal(
    recordingPartPath({ extension: "webm", recordingId: "r1", sequence: 7.9, userId: UID }),
    recordingPartPath({ extension: "webm", recordingId: "r1", sequence: 7, userId: UID }),
  );
});

test("the final file is distinguishable from the parts that built it", () => {
  const final = recordingFinalPath({ extension: "webm", recordingId: "r1", userId: UID });
  const part = recordingPartPath({ extension: "webm", recordingId: "r1", sequence: 0, userId: UID });
  assert.notEqual(final, part);
  assert.ok(!final.startsWith(recordingPartsPrefix({ recordingId: "r1", userId: UID })));
});
