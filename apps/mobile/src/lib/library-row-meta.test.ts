// Deno unit tests (repo convention) for the library-row-meta pure helpers.
// Run: deno test --no-check apps/mobile/src/lib/library-row-meta.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fileKindOf, firstContentLine, folderNoteCounts } from "./library-row-meta.ts";

Deno.test("fileKindOf: pdf and doc/docx extensions, case-insensitive", () => {
  assertEquals(fileKindOf("Unit 3/Handout.pdf"), "pdf");
  assertEquals(fileKindOf("Unit 3/Handout.PDF"), "pdf");
  assertEquals(fileKindOf("Syllabus.doc"), "doc");
  assertEquals(fileKindOf("Syllabus.DOCX"), "doc");
});

Deno.test("fileKindOf: markdown/text/no-extension all read as a plain note", () => {
  assertEquals(fileKindOf("Unit 3/Cardiology.md"), "note");
  assertEquals(fileKindOf("Unit 3/Cardiology.markdown"), "note");
  assertEquals(fileKindOf("Unit 3/Cardiology.txt"), "note");
  assertEquals(fileKindOf("Unit 3/Cardiology"), "note");
});

Deno.test("firstContentLine: returns the first non-empty line, trimmed", () => {
  assertEquals(firstContentLine("\n\n  Hello there.  \nMore text"), "Hello there.");
});

Deno.test("firstContentLine: strips common markdown leaders", () => {
  assertEquals(firstContentLine("## Heading here\nbody"), "Heading here");
  assertEquals(firstContentLine("- bullet point"), "bullet point");
  assertEquals(firstContentLine("* star bullet"), "star bullet");
  assertEquals(firstContentLine("1. numbered item"), "numbered item");
  assertEquals(firstContentLine("2) numbered item"), "numbered item");
  assertEquals(firstContentLine("> a quote"), "a quote");
});

Deno.test("firstContentLine: skips a leading heading matching the title, case-insensitively", () => {
  const content = "# My Note Title\n\nSome real body text.";
  assertEquals(firstContentLine(content, "My Note Title"), "Some real body text.");
  assertEquals(firstContentLine(content, "my note title"), "Some real body text.");
});

Deno.test("firstContentLine: no skip title still returns the heading line, cleaned", () => {
  assertEquals(firstContentLine("# My Note Title\n\nbody"), "My Note Title");
});

Deno.test("firstContentLine: empty, whitespace-only, or all-skipped content returns \"\"", () => {
  assertEquals(firstContentLine(""), "");
  assertEquals(firstContentLine("   \n  \n\t"), "");
  assertEquals(firstContentLine("# Same Title", "Same Title"), "");
});

Deno.test("folderNoteCounts: root-level notes don't count toward any folder", () => {
  const counts = folderNoteCounts(["Root Note.md"]);
  assertEquals(counts.size, 0);
});

Deno.test("folderNoteCounts: recursive — a parent folder counts everything nested inside it", () => {
  const counts = folderNoteCounts([
    "PHCY 1205/Unit 1/Cardio.md",
    "PHCY 1205/Unit 1/Renal.md",
    "PHCY 1205/Unit 2/Hepatic.md",
    "PHCY 1205/Overview.md",
  ]);
  assertEquals(counts.get("PHCY 1205"), 4);
  assertEquals(counts.get("PHCY 1205/Unit 1"), 2);
  assertEquals(counts.get("PHCY 1205/Unit 2"), 1);
});

Deno.test("folderNoteCounts: empty input returns an empty map", () => {
  assertEquals(folderNoteCounts([]).size, 0);
});
