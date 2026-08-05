import assert from "node:assert/strict";
import { test } from "node:test";

import { ingestScratchKey, isScratchKey, MAX_SOURCE_BYTES, readIngestRef } from "./ingest-ref";

const UID = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";
const good = { bucket: "library-sources", fileName: "Lecture 4.pptx", mimeType: null, path: `${UID}/abc.pptx` };

test("a well-formed reference to the caller's own object is accepted", () => {
  const check = readIngestRef(good, UID);
  assert.equal(check.ok, true);
  assert.deepEqual(check.ok && check.ref, {
    bucket: "library-sources",
    fileName: "Lecture 4.pptx",
    mimeType: null,
    path: `${UID}/abc.pptx`,
  });
});

test("a body that is not a reference reports 'absent', so multipart still works", () => {
  // The route must be able to tell "posted a form" apart from "posted a bad
  // reference" — one falls through to the old path, the other is an error.
  for (const body of [null, undefined, {}, "hello", 42, { file: "x" }]) {
    const check = readIngestRef(body, UID);
    assert.equal(check.ok, false, JSON.stringify(body));
    assert.equal(check.ok === false && check.reason, "absent", JSON.stringify(body));
  }
});

test("🔴 another user's object is FORBIDDEN — the whole point of the module", () => {
  const check = readIngestRef({ ...good, path: `${OTHER}/abc.pptx` }, UID);
  assert.equal(check.ok, false);
  assert.equal(check.ok === false && check.reason, "forbidden");
});

test("🔴 every traversal and prefix trick is refused, not normalised", () => {
  const attacks = [
    `${UID}/../${OTHER}/secret.pdf`, // climb out
    `${UID}/./abc.pdf`, // dot segment
    `../${UID}/abc.pdf`, // climb in front
    `/${UID}/abc.pdf`, // absolute
    `${UID}//abc.pdf`, // empty segment
    `${UID}\\abc.pdf`, // backslash as separator
    `${UID}/abc\u0000.pdf`, // NUL
    `${UID}x/abc.pdf`, // prefix that merely STARTS with the uid
    `${UID}`, // the folder itself, no object
    "", // empty
  ];
  for (const path of attacks) {
    const check = readIngestRef({ ...good, path }, UID);
    assert.equal(check.ok, false, path);
    assert.equal(check.ok === false && check.reason, "forbidden", path);
  }
});

test("🔴 a uid that is a PREFIX of the caller's cannot borrow it", () => {
  // Segment equality, not startsWith: "111" must not reach "1111…"'s folder.
  assert.equal(readIngestRef({ ...good, path: `${UID}extra/a.pdf` }, UID).ok, false);
  assert.equal(readIngestRef({ ...good, path: `${UID.slice(0, 8)}/a.pdf` }, UID).ok, false);
});

test("only the two ingest buckets are readable", () => {
  assert.equal(readIngestRef({ ...good, bucket: "library-images" }, UID).ok, true);
  for (const bucket of ["study-images", "avatars", "", "LIBRARY-SOURCES", 7, null]) {
    const check = readIngestRef({ ...good, bucket }, UID);
    assert.equal(check.ok, false, String(bucket));
    assert.equal(check.ok === false && check.reason, "malformed", String(bucket));
  }
});

test("a reference without a usable display name is malformed", () => {
  for (const fileName of ["", "   ", null, 42]) {
    const check = readIngestRef({ ...good, fileName }, UID);
    assert.equal(check.ok, false, String(fileName));
    assert.equal(check.ok === false && check.reason, "malformed", String(fileName));
  }
});

test("oversized strings are bounded rather than rejected where they are harmless", () => {
  const check = readIngestRef({ ...good, fileName: "x".repeat(9_000), mimeType: "y".repeat(9_000) }, UID);
  assert.equal(check.ok, true);
  assert.equal(check.ok && check.ref.fileName.length, 512);
  assert.equal(check.ok && check.ref.mimeType?.length, 255);
});

test("an absurdly long path is refused outright", () => {
  assert.equal(readIngestRef({ ...good, path: `${UID}/${"a".repeat(2_000)}.pdf` }, UID).ok, false);
});

test("the product ceiling matches the bucket's own file_size_limit", () => {
  // If these two ever disagree, a file can upload and then fail to be read, or
  // be readable and fail to upload — both look like "it just doesn't work".
  assert.equal(MAX_SOURCE_BYTES, 52_428_800);
});

test("scratch keys land under the caller's own folder and are recognisable", () => {
  const key = ingestScratchKey(UID, "Syllabus Fall 2026.pdf");
  assert.match(key, new RegExp(`^${UID}/ingest/[0-9a-f-]{36}\\.pdf$`));
  assert.equal(isScratchKey(key), true);
  // A scratch key must survive its own ownership check.
  assert.equal(readIngestRef({ ...good, path: key }, UID).ok, true);
});

test("a hostile extension never reaches the key", () => {
  for (const name of ["a.p df", "a.../x", "a." + "z".repeat(40), "noextension"]) {
    const key = ingestScratchKey(UID, name);
    assert.match(key, new RegExp(`^${UID}/ingest/[0-9a-f-]{36}(\\.[a-z0-9]{1,12})?$`), name);
    assert.equal(isScratchKey(key), true, name);
  }
});

test("a Library original is not mistaken for a throwaway", () => {
  assert.equal(isScratchKey(`${UID}/abc.pptx`), false);
  assert.equal(isScratchKey(`${UID}/chat/abc.pptx`), false);
});
