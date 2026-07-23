// Deno unit tests (repo convention) for the tag-boundary rule — the one piece
// of the Obsidian inline rules that is pure and worth pinning down, since it
// decides whether "#" starts a tag or is just a character in a URL.
// The rules' wiring into markdown-it is verified by the screenshot pass.
// Run: deno test --no-check apps/mobile/src/lib/markdown-obsidian.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isTagStart, TAG_BODY } from "./markdown-obsidian.ts";

Deno.test("a tag opens a word: start of line or after whitespace", () => {
  assertEquals(isTagStart("#pharm", 0), true);
  assertEquals(isTagStart("see #pharm", 4), true);
  assertEquals(isTagStart("line\n#pharm", 5), true);
});

Deno.test("a mid-word # is never a tag — URLs and C# stay intact", () => {
  // The fragment in a link: "…/a#b". Position of "#" is 3, preceded by "a".
  assertEquals(isTagStart("x/a#b", 3), false);
  assertEquals(isTagStart("C#", 1), false);
});

Deno.test("a bare # with nothing after it is not a tag", () => {
  assertEquals(isTagStart("#", 0), false);
  assertEquals(isTagStart("# heading", 0), false);
  assertEquals(isTagStart("## heading", 0), false);
});

Deno.test("tag bodies allow unicode, digits, dash, underscore and nesting", () => {
  assertEquals(TAG_BODY.exec("pharm")?.[0], "pharm");
  assertEquals(TAG_BODY.exec("chem/organic more")?.[0], "chem/organic");
  assertEquals(TAG_BODY.exec("week-3_notes rest")?.[0], "week-3_notes");
  // Non-Latin scripts count as letters — \p{L}, same as web's own pattern.
  assertEquals(TAG_BODY.exec("药理学")?.[0], "药理学");
});

Deno.test("a tag stops at punctuation, so trailing commas stay prose", () => {
  assertEquals(TAG_BODY.exec("pharm, and")?.[0], "pharm");
  assertEquals(TAG_BODY.exec("pharm.")?.[0], "pharm");
});
