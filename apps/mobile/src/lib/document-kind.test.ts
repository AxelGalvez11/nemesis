import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  DOCUMENT_MAX_BYTES,
  documentChipTitle,
  documentMime,
  documentRefusal,
  formatMb,
} from "./document-kind.ts";

Deno.test("the three kinds the server can actually read get a mime", () => {
  assertEquals(documentMime("Lecture 4.pdf"), "application/pdf");
  assertMatch(documentMime("notes.docx") ?? "", /wordprocessingml\.document$/);
  assertMatch(documentMime("deck.pptx") ?? "", /presentationml\.presentation$/);
});

Deno.test("extension wins over case, and an unreadable kind has no mime", () => {
  assertEquals(documentMime("DECK.PPTX"), documentMime("deck.pptx"));
  assertEquals(documentMime("sheet.numbers"), null);
  assertEquals(documentMime("noextension"), null);
});

Deno.test("the OLD binary formats get a fix the student can carry out", () => {
  // .doc/.ppt are the near-misses: telling someone "unsupported" leaves them stuck,
  // telling them to re-save as .docx does not.
  assertMatch(documentRefusal("essay.doc", 100) ?? "", /save as \.docx/);
  assertMatch(documentRefusal("slides.ppt", 100) ?? "", /save as \.pptx/);
});

Deno.test("an unreadable kind is named by its own extension", () => {
  assertMatch(documentRefusal("photo.heic", 100) ?? "", /\.heic/);
});

Deno.test("oversize is refused BEFORE the upload, with the real size named", () => {
  assertMatch(documentRefusal("huge.pdf", 80 * 1024 * 1024) ?? "", /80\.0 MB/);
  assertMatch(documentRefusal("huge.pdf", 80 * 1024 * 1024) ?? "", /limit is 50 MB/);
});

Deno.test("a normal lecture deck is no longer refused on this phone", () => {
  // 🔴 The gate was 25 MB against a real platform limit of ~4.5 MB, so a 12 MB
  // deck passed this check, uploaded for a minute, and failed with a message
  // that named no cause. Files now go to storage by reference, so the ceiling is
  // the bucket's and a normal deck simply works.
  for (const mb of [6, 12, 24, 40, 49]) {
    assertEquals(documentRefusal("Lecture 4.pptx", mb * 1024 * 1024), null);
  }
});

Deno.test("a file barely over the cap does not contradict itself", () => {
  // Rounding made the refusal read "that file is 50.0 MB, the limit is 50 MB",
  // which reads as a bug to a student rather than as a limit.
  const refusal = documentRefusal("huge.pdf", DOCUMENT_MAX_BYTES + 1) ?? "";
  assertEquals(refusal, "That file is just over the 50 MB limit.");
});

Deno.test("a readable file at or under the ceiling is not refused", () => {
  assertEquals(documentRefusal("deck.pptx", DOCUMENT_MAX_BYTES), null);
  assertEquals(documentRefusal("deck.pptx", null), null);
});

Deno.test("the chip shows the file's name without its extension", () => {
  assertEquals(documentChipTitle("PHCY_1202_Lecture_4.pptx"), "PHCY_1202_Lecture_4");
  assertEquals(documentChipTitle("no-extension"), "no-extension");
  // A file called ".pdf" must not produce an empty chip.
  assertEquals(documentChipTitle(".pdf"), ".pdf");
  assertEquals(documentChipTitle(`${"x".repeat(200)}.pdf`).length, 120);
});

Deno.test("formatMb reads like a size, not a float", () => {
  assertEquals(formatMb(1024 * 1024), "1.0 MB");
  assertEquals(formatMb(26_214_400), "25.0 MB");
});
