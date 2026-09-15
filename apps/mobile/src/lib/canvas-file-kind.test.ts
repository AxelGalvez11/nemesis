// Deno unit tests (repo convention).
// Run: deno test --no-check --unstable-sloppy-imports --allow-read apps/mobile/src/lib/canvas-file-kind.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fileKindFromTitle, fileKindLabel } from "./canvas-file-kind.ts";

Deno.test("fileKindFromTitle: reads the extension, not the words in the title", () => {
  assertEquals(fileKindFromTitle("Trinity_Care_Plan_New_Template_Notes.docx"), "word");
  assertEquals(fileKindFromTitle("brief.pdf"), "pdf");
  assertEquals(fileKindFromTitle("Heart_Failure_Clinical_Foundations_2026.pptx"), "slides");
  assertEquals(fileKindFromTitle("ledger.xlsx"), "sheet");
  assertEquals(fileKindFromTitle("hf_montage.png"), "image");
  assertEquals(fileKindFromTitle("notes"), "generic");
  assertEquals(fileKindFromTitle("README"), "generic");
});

Deno.test("fileKindFromTitle: case-insensitive, trailing dot and empty extension are generic", () => {
  assertEquals(fileKindFromTitle("REPORT.PDF"), "pdf");
  assertEquals(fileKindFromTitle("weird."), "generic");
  assertEquals(fileKindFromTitle(""), "generic");
});

Deno.test("fileKindLabel: the card's second line", () => {
  assertEquals(fileKindLabel("plan.docx"), "Word document");
  assertEquals(fileKindLabel("brief.pdf"), "PDF");
  assertEquals(fileKindLabel("deck.pptx"), "PowerPoint");
  assertEquals(fileKindLabel("data.csv"), "Spreadsheet");
  assertEquals(fileKindLabel("photo.jpg"), "Image");
  assertEquals(fileKindLabel("mystery.xyz"), "File");
  // A Library note has no extension; it is a note, not an unknown file.
  assertEquals(fileKindLabel("research retatrutide"), "Note");
});
