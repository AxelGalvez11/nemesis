import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync, zipSync } from "fflate";

import { MAX_SOURCE_BYTES } from "../notebooks/ingest-ref";
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

test("only office archives qualify, and the threshold is the storage ceiling itself", () => {
  assert.equal(isSlimmableOfficeName("Lecture 7.pptx"), true);
  assert.equal(isSlimmableOfficeName("notes.DOCX"), true);
  assert.equal(isSlimmableOfficeName("syllabus.pdf"), false);
  assert.equal(isSlimmableOfficeName("archive.zip"), false);
  // 🔴 This assertion used to read `< 25 MB`, guarding a route ceiling that was
  // never reachable — Vercel refused the body at ~4.5 MB long before it. The
  // consequence ran both ways: a 10 MB deck was not slimmed and died anyway,
  // and a 30 MB deck was slimmed and lost every figure for nothing. Slimming is
  // now the last resort before a file cannot be STORED, so the threshold must
  // equal the bucket limit exactly — one byte lower and we discard pictures we
  // could have kept, one byte higher and the upload fails.
  assert.equal(OFFICE_SLIM_THRESHOLD_BYTES, MAX_SOURCE_BYTES);
});

test("a real lecture deck now keeps its pictures instead of being stripped", () => {
  // 5-to-50 MB is where real decks live. This is the band the old threshold got
  // wrong in both directions, and the whole visual pipeline depends on it.
  for (const mb of [6, 10, 24, 30, 49]) {
    assert.ok(mb * 1024 * 1024 < OFFICE_SLIM_THRESHOLD_BYTES, `${mb} MB must not be slimmed`);
  }
});

test("a non-zip file throws instead of returning garbage", () => {
  assert.throws(() => slimOfficeArchive(new TextEncoder().encode("just some text")));
});
