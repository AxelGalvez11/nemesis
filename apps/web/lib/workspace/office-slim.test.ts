import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync, zipSync } from "fflate";

import { isSlimmableOfficeName, OFFICE_SLIM_THRESHOLD_BYTES, slimOfficeArchive } from "./office-slim";

const SLIDE_XML = `<p:sld><p:txBody><a:p><a:r><a:t>Immunology basics</a:t></a:r></a:p></p:txBody></p:sld>`;

/** Incompressible filler — real pictures don't deflate, and a zero-filled
 *  buffer would make the "original" zip tiny and the shrink test meaningless. */
function noise(bytes: number): Uint8Array {
  const data = new Uint8Array(bytes);
  let state = 0x9e3779b9;
  for (let index = 0; index < bytes; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    data[index] = state & 0xff;
  }
  return data;
}

function fakeDeck(): Uint8Array {
  return zipSync({
    "[Content_Types].xml": new TextEncoder().encode("<Types/>"),
    "ppt/slides/slide1.xml": new TextEncoder().encode(SLIDE_XML),
    "ppt/slides/_rels/slide1.xml.rels": new TextEncoder().encode("<Relationships/>"),
    "ppt/media/image1.png": noise(512 * 1024),
    "ppt/fonts/font1.fntdata": noise(256 * 1024),
    "ppt/embeddings/oleObject1.bin": noise(128 * 1024),
    "word/media/image2.jpeg": noise(64 * 1024),
  });
}

test("slimOfficeArchive drops media, fonts and embeddings but keeps every XML part", () => {
  const slimmed = slimOfficeArchive(fakeDeck());
  const entries = unzipSync(slimmed);
  const names = Object.keys(entries).sort();
  assert.deepEqual(names, ["[Content_Types].xml", "ppt/slides/_rels/slide1.xml.rels", "ppt/slides/slide1.xml"]);
  // The kept slide survives byte-for-byte — slimming must never touch text.
  assert.equal(strFromU8(entries["ppt/slides/slide1.xml"]!), SLIDE_XML);
});

test("slimming shrinks a media-heavy archive dramatically", () => {
  const original = fakeDeck();
  const slimmed = slimOfficeArchive(original);
  assert.ok(slimmed.byteLength < original.byteLength / 10);
});

test("only office archives qualify, and the threshold sits under the route's ceiling", () => {
  assert.equal(isSlimmableOfficeName("Lecture 7.pptx"), true);
  assert.equal(isSlimmableOfficeName("notes.DOCX"), true);
  assert.equal(isSlimmableOfficeName("syllabus.pdf"), false);
  assert.equal(isSlimmableOfficeName("archive.zip"), false);
  assert.ok(OFFICE_SLIM_THRESHOLD_BYTES < 25 * 1024 * 1024);
});

test("a non-zip file throws instead of returning garbage", () => {
  assert.throws(() => slimOfficeArchive(new TextEncoder().encode("just some text")));
});
