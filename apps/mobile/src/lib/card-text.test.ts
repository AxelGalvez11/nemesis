// Deno unit tests (repo convention) for the flashcard text normalizer.
// Run: deno test --no-check apps/mobile/src/lib/card-text.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeCardText } from "./card-text.ts";

Deno.test("an <img> tag becomes a markdown image so the picture renders", () => {
  assertEquals(
    normalizeCardText('<img src="https://example.supabase.co/storage/v1/pic.png">'),
    "![](https://example.supabase.co/storage/v1/pic.png)",
  );
  assertEquals(normalizeCardText("<img src='a.png' width='40' />"), "![](a.png)");
  assertEquals(normalizeCardText('Before <img alt="x" src="a.png"> after'), "Before ![](a.png) after");
});

Deno.test("an <img> with no usable src is dropped rather than shown as a tag", () => {
  assertEquals(normalizeCardText("<img>"), "");
  assertEquals(normalizeCardText('<img src="">'), "");
});

Deno.test("sub/sup become real Unicode when every character maps", () => {
  assertEquals(normalizeCardText("H<sub>2</sub>O"), "H₂O");
  assertEquals(normalizeCardText("Ca<sup>2+</sup>"), "Ca²⁺");
  assertEquals(normalizeCardText("x<sup>n</sup>"), "xⁿ");
});

Deno.test("an unmappable sub/sup run keeps its text instead of losing it", () => {
  // "Q" has no Unicode subscript — dropping the tags beats dropping the letter.
  assertEquals(normalizeCardText("A<sub>Q</sub>"), "AQ");
  assertEquals(normalizeCardText("A<sup>[1]</sup>"), "A[1]");
});

Deno.test("line-break and block tags become newlines", () => {
  assertEquals(normalizeCardText("one<br>two"), "one\ntwo");
  assertEquals(normalizeCardText("one<br />two"), "one\ntwo");
  assertEquals(normalizeCardText("<div>one</div><div>two</div>"), "one\ntwo\n");
});

Deno.test("bold/italic tags become markdown; underline keeps its words", () => {
  assertEquals(normalizeCardText("<b>bold</b>"), "**bold**");
  assertEquals(normalizeCardText("<i>it</i>"), "*it*");
  assertEquals(normalizeCardText("<u>under</u>"), "under");
});

Deno.test("HTML entities decode, with or without other tags present", () => {
  assertEquals(normalizeCardText("a &amp; b"), "a & b");
  assertEquals(normalizeCardText("5&nbsp;mg"), "5 mg");
  assertEquals(normalizeCardText("<b>a</b> &lt;3"), "**a** <3");
});

Deno.test("real markdown passes through untouched", () => {
  const md = "**bold** and `code`\n\n- one\n- two\n\n![](https://cdn.example/x.png)\n\n$E = mc^2$";
  assertEquals(normalizeCardText(md), md);
});

Deno.test("normalizing is idempotent", () => {
  const inputs = ["H<sub>2</sub>O", '<img src="a.png">', "<div>x</div>", "a &amp; b", "plain text"];
  for (const input of inputs) {
    const once = normalizeCardText(input);
    assertEquals(normalizeCardText(once), once, `not idempotent for ${JSON.stringify(input)}`);
  }
});

Deno.test("empty and tagless input is safe", () => {
  assertEquals(normalizeCardText(""), "");
  assertEquals(normalizeCardText("just words"), "just words");
});
