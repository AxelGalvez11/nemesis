/**
 * Nothing a student drops is refused for a reason we control.
 *
 * 🔴 THE DEFECT THIS EXISTS FOR, IN THE OWNER'S WORDS (2026-08-31): "users should be able to drop
 * in anything, any documents like slides, word, PowerPoint slides, and they should be able to
 * parse it. There should be no problem." Before this, old PowerPoint, old Word, Apple Keynote,
 * Pages, Numbers, EPUB textbooks, OpenDocument files, RTF and three image formats were all a 415
 * at the door — and a 415 STORES NOTHING, so the refusal left no row, no counter and no log line
 * anyone could count. The only evidence it ever happened was a modal a student saw once.
 *
 * 🔴 THE THREE LISTS THIS HOLDS TOGETHER HAVE EACH BEEN WRONG, AND EVERY FAILURE WAS SILENT:
 *
 *   picker offers, parser cannot read   → upload fails after the file is chosen
 *   parser reads, picker does not offer → the OS dialog greys the file out and NOTHING runs
 *   both agree, bucket refuses the mime → the file reads inline and no source row is ever written
 *
 * The third is the worst, because chat appears to work. `.md` behaved that way for weeks. So the
 * assertions below walk the SINGLE list and prove every consumer of it agrees.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { kindFor } from "./parse-document";
import {
  NATIVE_EXTENSIONS,
  READABLE_ACCEPT,
  READABLE_EXTENSIONS,
  VENDOR_EXTENSIONS,
} from "./readable-formats";
import { DOCUMENT_EXTENSIONS, DOCUMENT_MIME, IMAGE_EXTENSIONS } from "../workspace/chat-attachments";
import { ACCEPTED_MATERIAL } from "../learn/canvas-tasks";

/**
 * 🔴 WRITTEN OUT BY HAND, ON PURPOSE, AND IT IS THE ONLY LIST IN THIS FILE THAT IS.
 *
 * Every other assertion here derives from `READABLE_EXTENSIONS`, which makes them all blind to the
 * one change that matters most: DELETING a format. Calibrated by removing `.key` from the source
 * list — every test still passed, because the pickers, the mime map and the parser all derive from
 * it and so all agreed it was gone. A consistent regression is still a regression.
 *
 * So this is an independent statement of the PROMISE the owner made the product ("users should be
 * able to drop in anything"), not a restatement of the code. Growing it is expected. Shrinking it
 * is a product decision that has to be made deliberately, in this file, in a diff someone reads.
 */
const PROMISED = [
  "pdf", "docx", "pptx", "xlsx", "csv", "md", "txt",          // what we always read
  "png", "jpg", "jpeg", "webp", "heic", "heif",               // what a phone takes
  "doc", "ppt", "xls",                                        // what a 2004 course site holds
  "pages", "key", "numbers",                                  // what a Mac writes by default
  "odt", "odp", "ods",                                        // what LibreOffice and Google export
  "rtf", "epub", "html",                                      // handouts and textbooks
  "gif", "bmp", "tif", "tiff",                                // pictures no vision model accepts
];

test("🔴 every format the product PROMISES to read is still readable", () => {
  const readable = new Set(READABLE_EXTENSIONS);
  const missing = PROMISED.filter((extension) => !readable.has(extension));
  assert.deepEqual(missing, [], `dropped from the reader: ${missing.join(", ")}`);
});

test("🔴 every readable extension resolves to a real lane — none falls through to a refusal", () => {
  for (const extension of READABLE_EXTENSIONS) {
    const kind = kindFor(`lecture.${extension}`, "");
    assert.ok(kind, `.${extension} is offered to students and resolves to nothing`);
  }
});

test("🔴 the split is honest: native extensions never route to a paid vendor, and vice versa", () => {
  // A format on the wrong side of this line is money. `NATIVE_EXTENSIONS` going to `"other"`
  // would bill per page for files we read locally and free; `VENDOR_EXTENSIONS` resolving to a
  // native kind would send a Keynote to a reader that cannot open it and report an empty parse.
  for (const extension of NATIVE_EXTENSIONS) {
    assert.notEqual(kindFor(`lecture.${extension}`, ""), "other", `.${extension} is billable but should be free`);
  }
  for (const extension of VENDOR_EXTENSIONS) {
    assert.equal(kindFor(`lecture.${extension}`, ""), "other", `.${extension} claims a reader it does not have`);
  }
});

test("🔴 the file dialogs offer exactly what the server reads — both directions", () => {
  // Both doors are built from the same constant, so this is really asserting that nobody has
  // reintroduced a hand-written copy. That is the whole failure history of these three lists.
  assert.equal(ACCEPTED_MATERIAL, READABLE_ACCEPT, "the canvas picker has drifted from the reader");
  for (const extension of READABLE_EXTENSIONS) {
    assert.ok(READABLE_ACCEPT.includes(`.${extension}`), `.${extension} is readable but not offered`);
  }
});

test("🔴 every document extension has a mime, because a missing one is a file stored nowhere", () => {
  // `persistChatAttachment` reads DOCUMENT_MIME to pick the content type it uploads under. A
  // missing entry falls back to whatever the browser guessed, the bucket allowlist refuses it,
  // and the attachment degrades to metadata-only — visible in chat, absent from the Library.
  for (const extension of DOCUMENT_EXTENSIONS) {
    assert.ok(DOCUMENT_MIME[extension], `${extension} would upload under a guessed mime`);
  }
});

test("🔴 pictures and documents partition the list — nothing is in both lanes or neither", () => {
  const documents = new Set(DOCUMENT_EXTENSIONS);
  const images = new Set(IMAGE_EXTENSIONS);
  for (const extension of READABLE_EXTENSIONS) {
    const dotted = `.${extension}`;
    const inDocuments = documents.has(dotted);
    const inImages = images.has(dotted);
    assert.ok(inDocuments || inImages, `${dotted} is readable but belongs to no upload lane`);
    assert.ok(!(inDocuments && inImages), `${dotted} would be uploaded twice, to two buckets`);
  }
});

test("🔴 the image formats no vision model accepts travel the DOCUMENT lane, not the picture lane", () => {
  // Gemini takes PNG, JPEG, WEBP, HEIC and HEIF and nothing else. A .gif or .tiff sent to the
  // picture lane reaches a reader that refuses it and comes back empty; sent to the document lane
  // it reaches a vendor that rasterises first. This is the one place where "it is an image" is
  // the wrong way to route an image.
  for (const extension of [".gif", ".bmp", ".tif", ".tiff"]) {
    assert.ok(DOCUMENT_EXTENSIONS.includes(extension), `${extension} would be sent to a model that cannot open it`);
    assert.ok(!IMAGE_EXTENSIONS.includes(extension), `${extension} is in the picture lane`);
  }
});
