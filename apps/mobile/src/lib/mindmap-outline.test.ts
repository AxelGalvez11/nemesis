// Deno unit tests (repo convention) for the mind-map outline helpers.
// Run: deno test --no-check apps/mobile/src/lib/mindmap-outline.test.ts
import { assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { outlineNodes } from "./mindmap-outline.ts";

const OUTLINE = `# RAAS pathway
- Renin
  - Released by juxtaglomerular cells
  - Triggered by low perfusion
- Angiotensin II
  - Vasoconstriction
  - Aldosterone release`;

Deno.test("nodes are counted, not estimated — the row shows this number", () => {
  assertStrictEquals(outlineNodes(OUTLINE), 7);
});

Deno.test("blank lines and stray prose are not nodes", () => {
  // Models sometimes wrap an outline in a sentence. Counting those would put a
  // number on the row that does not match what the student then sees.
  const messy = `Here is the map you asked for:

# Topic

- One

- Two
That trailing sentence is not a node.`;
  assertStrictEquals(outlineNodes(messy), 3);
});

Deno.test("all three bullet markers count, and empty bullets do not", () => {
  assertStrictEquals(outlineNodes("- a\n* b\n+ c"), 3);
  assertStrictEquals(outlineNodes("-\n*  \n+"), 0);
  assertStrictEquals(outlineNodes("#\n#  "), 0);
});

Deno.test("an empty outline is zero, not a crash", () => {
  assertStrictEquals(outlineNodes(""), 0);
  assertStrictEquals(outlineNodes("\n\n\n"), 0);
});

Deno.test("deeper headings count too — a map can nest with them", () => {
  assertStrictEquals(outlineNodes("# One\n## Two\n###### Six"), 3);
  // Seven hashes is not a heading in markdown, so it is not a node either.
  assertStrictEquals(outlineNodes("####### Seven"), 0);
});
