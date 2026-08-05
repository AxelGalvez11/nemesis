import assert from "node:assert/strict";
import { test } from "node:test";

import { courseOf, describeSource, folderTrail, readerKind } from "./reader-source";

test("the course is the first folder segment, whatever the field", () => {
  assert.equal(courseOf("Constitutional law/Commerce power"), "Constitutional law");
  assert.equal(courseOf("Thermodynamics"), "Thermodynamics");
  assert.equal(courseOf(""), null);
  assert.equal(courseOf("  /  "), null);
});

test("the folder trail drops empty segments", () => {
  assert.deepEqual(folderTrail("A//B/ C "), ["A", "B", "C"]);
  assert.deepEqual(folderTrail(""), []);
});

test("the extension decides the lane", () => {
  assert.equal(readerKind("lecture.pdf"), "pdf");
  assert.equal(readerKind("Week 4.PPTX"), "slides");
  assert.equal(readerKind("brief.docx"), "document");
  assert.equal(readerKind("scan.HEIC"), "image");
  assert.equal(readerKind("lecture.m4a"), "audio");
});

test("an unknown extension falls through to the MIME type", () => {
  assert.equal(readerKind("mystery.bin", "application/pdf"), "pdf");
  assert.equal(readerKind("mystery.bin", "image/png"), "image");
  assert.equal(readerKind("mystery.bin", null), "file");
});

test("a file with no extension at all still uses its MIME type", () => {
  assert.equal(readerKind("scan", "image/jpeg"), "image");
  assert.equal(readerKind("Makefile", "text/plain"), "document");
  assert.equal(readerKind("blob", null), "file");
});

test("a known extension beats a MIME type the uploader guessed wrong", () => {
  assert.equal(readerKind("lecture.pdf", "application/octet-stream"), "pdf");
});

test("the meta line leaves out what it does not know", () => {
  // Binary megabytes, matching formatSourceSize, which is what the rest of the
  // Library already shows for the same file.
  assert.equal(describeSource({ sizeBytes: 2_460_000, createdAt: null }, "PDF"), "PDF · 2.3 MB");
  assert.equal(describeSource({ sizeBytes: null, createdAt: null }, "PDF"), "PDF");
  assert.equal(describeSource({ sizeBytes: 512, createdAt: "not a date" }, "Image"), "Image · 512 B");
});
