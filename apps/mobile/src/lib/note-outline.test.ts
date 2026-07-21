// Deno unit tests (repo convention) for the note outline splitter.
// Run: deno test --no-check apps/mobile/src/lib/note-outline.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { outlineOf, splitSections } from "./note-outline.ts";

Deno.test("splitSections: heading-free note = one heading-less section, content intact", () => {
  const sections = splitSections("just a line\nand another");
  assertEquals(sections, [{ body: "just a line\nand another", heading: null }]);
});

Deno.test("splitSections: preamble keeps index 0, each heading starts a section that includes its own line", () => {
  const sections = splitSections("intro\n\n# One\nalpha\n\n## Two\nbeta");
  assertEquals(sections.length, 3);
  assertEquals(sections[0], { body: "intro\n", heading: null });
  assertEquals(sections[1], { body: "# One\nalpha\n", heading: { level: 1, text: "One" } });
  assertEquals(sections[2], { body: "## Two\nbeta", heading: { level: 2, text: "Two" } });
});

Deno.test("splitSections: rejoining the sections reproduces the note byte for byte", () => {
  const content = "intro\n# A\ntext\n```\n# not a heading\n```\n## B\ntail\n";
  assertEquals(splitSections(content).map((s) => s.body).join("\n"), content);
});

Deno.test("splitSections: a # inside a code fence is code, not a heading", () => {
  const sections = splitSections("# Real\n```js\n# comment-looking line\n```\nafter");
  assertEquals(sections.length, 1);
  assertEquals(sections[0].heading, { level: 1, text: "Real" });
});

Deno.test("splitSections: trailing closing hashes are stripped from the heading text", () => {
  const sections = splitSections("## Dosing ##\nbody");
  assertEquals(sections[0].heading, { level: 2, text: "Dosing" });
});

Deno.test("outlineOf: lists only headed sections, tagged with their section index", () => {
  const outline = outlineOf(splitSections("intro\n# One\n\n## Two\n\ntext"));
  assertEquals(outline, [
    { level: 1, sectionIndex: 1, text: "One" },
    { level: 2, sectionIndex: 2, text: "Two" },
  ]);
});
