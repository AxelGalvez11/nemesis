import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PHOTO_ANALYSIS_ASK,
  photoTurnText,
  PHOTO_BUCKET,
  photoPathInNote,
  PHOTO_MAX_BYTES,
  PHOTO_URL_TTL_SECONDS,
  photoAttachmentTitle,
  photoNoteBody,
  photoNoteTitle,
  photoObjectPath,
  photoUploadError,
} from "./photo-note.ts";

Deno.test("an object path starts with the uid, because that is what the bucket policy checks", () => {
  assertEquals(photoObjectPath("user-1", "abc"), "user-1/abc.jpg");
  assertEquals(photoObjectPath("user-1", "abc").split("/")[0], "user-1");
  assertEquals(PHOTO_BUCKET, "library-images");
});

Deno.test("the photo size ceiling matches the server's vision ceiling exactly", () => {
  // Bucket file_size_limit (migration), VISION_MAX_BYTES (web) and this number
  // are one number in three places. If they drift, a photo uploads and then
  // cannot be read, which reads to the student as a broken camera.
  assertEquals(PHOTO_MAX_BYTES, 14 * 1024 * 1024);
});

Deno.test("a note's picture URL outlives the sitting it was taken in", () => {
  // An hour-long signed URL — what the study surface uses, because it re-signs
  // at render — would leave a note with a broken image by dinnertime and no way
  // to tell from the text that anything was lost.
  assertEquals(PHOTO_URL_TTL_SECONDS > 30 * 24 * 60 * 60, true);
});

Deno.test("a title survives being turned into a file path", () => {
  // Library notes are stored at `Folder/Title.md`, so a slash in a title would
  // silently create a folder. This is the case that corrupts the library.
  assertEquals(photoNoteTitle("Lecture 3/4: Beta blockers"), "Lecture 3 4 Beta blockers");
  assertEquals(photoNoteTitle("C:\\Notes\\pharm"), "C Notes pharm");
});

Deno.test("a title loses the markdown the transcript arrived wearing", () => {
  assertEquals(photoNoteTitle("## Renal physiology"), "Renal physiology");
  assertEquals(photoNoteTitle("- Loop diuretics"), "Loop diuretics");
  assertEquals(photoNoteTitle("Adverse effects:"), "Adverse effects");
  assertEquals(photoNoteTitle("  spaced   out  words "), "spaced out words");
});

Deno.test("a long first line becomes a name, cut on a word", () => {
  const long = photoNoteTitle(
    "The renin angiotensin aldosterone system and its role in the long term regulation of arterial pressure",
  );
  assertEquals(long.length <= 60, true);
  assertEquals(long.endsWith(" "), false);
  // Cut on a word boundary, not mid-word.
  assertEquals(long, "The renin angiotensin aldosterone system and its role in");
});

Deno.test("a title always exists, even when the picture said nothing usable", () => {
  assertEquals(photoNoteTitle(""), "Photo note");
  assertEquals(photoNoteTitle(null), "Photo note");
  assertEquals(photoNoteTitle("   "), "Photo note");
  assertEquals(photoNoteTitle("###"), "Photo note");
});

Deno.test("one unbroken word longer than the limit is still cut", () => {
  const title = photoNoteTitle("A".repeat(120));
  assertEquals(title.length, 60);
});

Deno.test("the note keeps the photograph, above the transcript", () => {
  const body = photoNoteBody("Beta blockers lower heart rate.", "https://example.test/pic.jpg");
  assertEquals(body, "![Photo](https://example.test/pic.jpg)\n\nBeta blockers lower heart rate.\n");
  // The image comes first: it is the only way a student can check a machine
  // reading of handwriting against what was actually written.
  assertMatch(body, /^!\[Photo\]/);
});

Deno.test("a note without a usable image URL is still a note, not a broken tag", () => {
  assertEquals(photoNoteBody("Just the words.", ""), "Just the words.\n");
  assertEquals(photoNoteBody("Just the words.", "   "), "Just the words.\n");
});

Deno.test("the chat attachment says a photo is a photo", () => {
  // The model must not be told a photograph is a Library note — where a fact
  // came from changes how much weight it deserves.
  assertEquals(photoAttachmentTitle("Renal physiology"), "Photo: Renal physiology");
});

Deno.test("upload failures read as sentences, never as HTTP numbers", () => {
  assertMatch(photoUploadError(401), /re-connect/);
  assertMatch(photoUploadError(403), /re-connect/);
  assertMatch(photoUploadError(413), /too large/);
  assertMatch(photoUploadError(415), /format/);
  assertMatch(photoUploadError(500), /try again/i);
  assertMatch(photoUploadError(503), /try again/i);
  assertMatch(photoUploadError(400), /Couldn't save/);
  for (const status of [400, 401, 403, 413, 415, 500, 503]) {
    assertEquals(/\d/.test(photoUploadError(status)), false, `status ${status} leaked a number`);
  }
});

Deno.test("the note records WHICH object its picture is, so the URL can be re-signed", () => {
  // The URL above it expires. Without the path there would be no way to mint a
  // fresh one — a note holding a broken image with nothing to say what it was.
  const body = photoNoteBody("Words.", "https://example.test/pic.jpg?token=abc", "user-1/uuid.jpg");
  assertEquals(photoPathInNote(body), "user-1/uuid.jpg");
});

Deno.test("the recorded path is invisible — a title, never an HTML comment", () => {
  // The phone's markdown parser runs with html:false, so `<!-- ... -->` would
  // print on screen as literal text.
  const body = photoNoteBody("Words.", "https://example.test/pic.jpg", "user-1/uuid.jpg");
  assertEquals(body.includes("<!--"), false);
  assertEquals(body.startsWith('![Photo](https://example.test/pic.jpg "user-1/uuid.jpg")'), true);
});

Deno.test("a quote in a path can't break out of the title", () => {
  const body = photoNoteBody("Words.", "https://example.test/p.jpg", 'user/we"ird.jpg');
  assertEquals(photoPathInNote(body), "user/weird.jpg");
});

Deno.test("a note with no recorded path reads back as none, not as a crash", () => {
  assertEquals(photoPathInNote(photoNoteBody("Words.", "https://example.test/p.jpg")), null);
  assertEquals(photoPathInNote("Just some prose.\n"), null);
  assertEquals(photoPathInNote(""), null);
});

Deno.test("photoTurnText: the student's own question always wins", () => {
  assertEquals(photoTurnText("which enzyme is circled here?", true), "which enzyme is circled here?");
});

Deno.test("photoTurnText: a photo with an empty composer still asks something", () => {
  // The case the old auto-send existed to cover. Without this, taking a picture
  // and pressing send would do nothing at all.
  assertEquals(photoTurnText("   ", true), PHOTO_ANALYSIS_ASK);
});

Deno.test("photoTurnText: an empty composer with NO photo sends nothing", () => {
  assertEquals(photoTurnText("", false), "");
  assertEquals(photoTurnText("   \n ", false), "");
});

Deno.test("photoTurnText: whitespace around a real question is trimmed, not counted", () => {
  assertEquals(photoTurnText("  what is this?  ", true), "what is this?");
});
