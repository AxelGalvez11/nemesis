// Deno unit tests (repo convention) for the editor's inline syntax dimming.
// Run: deno test --no-check apps/mobile/src/lib/markdown-spans.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { markdownSpans, type Span } from "./markdown-spans.ts";

/** THE invariant: what we paint is exactly what we will save. */
function assertLossless(source: string): Span[] {
  const spans = markdownSpans(source);
  assertEquals(spans.map((s) => s.text).join(""), source, `spans lost or added characters for: ${source}`);
  return spans;
}

const kindsOf = (spans: Span[]) => spans.map((s) => s.kind);
const textOf = (spans: Span[], kind: string) => spans.filter((s) => s.kind === kind).map((s) => s.text);

Deno.test("bold: the asterisks are markers, the words are strong", () => {
  const spans = assertLossless("Plain **bold words** after");
  assertEquals(textOf(spans, "strong"), ["bold words"]);
  assertEquals(textOf(spans, "marker"), ["**", "**"]);
});

Deno.test("bold is tried before italic — ** must not parse as two italics", () => {
  const spans = assertLossless("**bold**");
  assertEquals(kindsOf(spans), ["marker", "strong", "marker"]);
  assert(!kindsOf(spans).includes("em"), "** parsed as italic");
});

Deno.test("italic, highlight, code, strikethrough and underline each get their own kind", () => {
  assertEquals(textOf(assertLossless("*a*"), "em"), ["a"]);
  assertEquals(textOf(assertLossless("==b=="), "mark"), ["b"]);
  assertEquals(textOf(assertLossless("`c`"), "code"), ["c"]);
  assertEquals(textOf(assertLossless("~~d~~"), "strike"), ["d"]);
  assertEquals(textOf(assertLossless("<u>e</u>"), "underline"), ["e"]);
});

Deno.test("line prefixes are markers: heading, bullet, quote, numbered", () => {
  assertEquals(markdownSpans("## Heading")[0], { kind: "marker", text: "## " });
  assertEquals(markdownSpans("- item")[0], { kind: "marker", text: "- " });
  assertEquals(markdownSpans("> quoted")[0], { kind: "marker", text: "> " });
  assertEquals(markdownSpans("1. first")[0], { kind: "marker", text: "1. " });
  assertEquals(markdownSpans("###### deep")[0], { kind: "marker", text: "###### " });
});

Deno.test("a longer heading marker wins over a shorter one", () => {
  // "### " must not be read as "# " followed by "## ".
  assertEquals(markdownSpans("### Three")[0], { kind: "marker", text: "### " });
});

Deno.test("a prefix only counts at the START of the line", () => {
  const spans = assertLossless("not a # heading");
  assert(!spans.some((s) => s.kind === "marker"), "mid-line # treated as a marker");
});

Deno.test("UNMATCHED syntax is ordinary text — this is what half-typed looks like", () => {
  for (const half of ["**unfinished", "start ==", "a * b", "<u>no close", "`open"]) {
    const spans = assertLossless(half);
    assert(!spans.some((s) => s.kind === "marker"), `treated as a marker while incomplete: ${half}`);
  }
});

Deno.test("EMPTY emphasis is literal — **** is four asterisks, not empty bold", () => {
  const spans = assertLossless("****");
  assert(!spans.some((s) => s.kind === "strong"), "**** produced an empty strong run");
});

Deno.test("the invariant holds for a realistic mixed line and for junk", () => {
  assertLossless("## A **bold** and *italic* and ==marked== heading with `code`");
  assertLossless("- item with **bold** and a stray * asterisk");
  assertLossless("1. numbered with ~~strike~~ and <u>under</u>");
  assertLossless("");
  assertLossless("*");
  assertLossless("**");
  assertLossless("***");
  assertLossless("plain prose, nothing special");
  assertLossless("=====");
  assertLossless("`````");
});

Deno.test("adjacent same-kind runs are merged, so plain prose is ONE span", () => {
  const spans = markdownSpans("just some ordinary words");
  assertEquals(spans.length, 1);
  assertEquals(spans[0]?.kind, "text");
});

Deno.test("several emphases on one line each keep their own markers", () => {
  const spans = assertLossless("**a** and *b* and ==c==");
  assertEquals(textOf(spans, "strong"), ["a"]);
  assertEquals(textOf(spans, "em"), ["b"]);
  assertEquals(textOf(spans, "mark"), ["c"]);
  // Six markers: an open and a close for each of the three.
  assertEquals(textOf(spans, "marker").length, 6);
});
