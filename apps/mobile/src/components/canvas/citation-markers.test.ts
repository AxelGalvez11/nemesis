// Deno unit tests (repo convention) for the citation-marker pre-process — the phone's counterpart
// to apps/web/lib/workspace/chat-citations.test.ts, plus the bare-URL test the web has no need for.
// Run: deno test --no-check apps/mobile/src/components/canvas/citation-markers.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  citationTarget,
  citationsToMarkdown,
  groupCitationRuns,
  isBareUrlLink,
} from "./citation-markers.ts";

Deno.test("citationsToMarkdown: an in-range marker becomes a link the renderer can catch", () => {
  assertEquals(
    citationsToMarkdown("The release landed in March [1].", 3),
    "The release landed in March [1](#nemesis-cite=1).",
  );
});

Deno.test("citationsToMarkdown: an out-of-range marker is left as plain text", () => {
  // The model invents numbers. A literal "[9]" is a smaller wrong than a chip naming a page that
  // was never consulted.
  assertEquals(citationsToMarkdown("Claimed in [9].", 2), "Claimed in [9].");
});

Deno.test("citationsToMarkdown: with no sources at all, nothing is touched", () => {
  assertEquals(citationsToMarkdown("array[1] and [2]", 0), "array[1] and [2]");
});

Deno.test("citationsToMarkdown: code spans and fences are passed through untouched", () => {
  assertEquals(citationsToMarkdown("Use `a[1]` here [1].", 2), "Use `a[1]` here [1](#nemesis-cite=1).");
  assertEquals(citationsToMarkdown("```\nvals[1]\n```\n[1]", 2), "```\nvals[1]\n```\n[1](#nemesis-cite=1)");
});

Deno.test("citationsToMarkdown: an existing markdown link is not re-marked", () => {
  assertEquals(citationsToMarkdown("[1](https://example.com)", 2), "[1](https://example.com)");
});

Deno.test("groupCitationRuns: adjacent markers collapse into one chip carrying the extra count", () => {
  assertEquals(
    groupCitationRuns(citationsToMarkdown("Confirmed [1][2] [3].", 3)),
    "Confirmed [1](#nemesis-cite=1.2).",
  );
});

Deno.test("groupCitationRuns: markers separated by prose are two citation events", () => {
  assertEquals(
    groupCitationRuns(citationsToMarkdown("Said [1] and later [2].", 2)),
    "Said [1](#nemesis-cite=1) and later [2](#nemesis-cite=2).",
  );
});

Deno.test("citationTarget: reads the index and the extra count, and refuses anything else", () => {
  assertEquals(citationTarget("#nemesis-cite=1"), { index: 1, extra: 0 });
  assertEquals(citationTarget("#nemesis-cite=3.2"), { index: 3, extra: 2 });
  assertEquals(citationTarget("https://example.com"), null);
  assertEquals(citationTarget("#nemesis-note=Cells"), null);
  assertEquals(citationTarget("#nemesis-cite=0"), null);
});

Deno.test("isBareUrlLink: an address the model typed is one; an authored link is not", () => {
  assertEquals(isBareUrlLink("https://api-docs.deepseek.com/updates", "https://api-docs.deepseek.com/updates"), true);
  // linkify normalises the scheme onto the href while the text stays as typed.
  assertEquals(isBareUrlLink("http://www.bbc.co.uk", "www.bbc.co.uk"), true);
  assertEquals(isBareUrlLink("https://example.com/", "https://example.com"), true);
  assertEquals(isBareUrlLink("https://nature.com/x", "the 2019 trial"), false);
  assertEquals(isBareUrlLink("https://nature.com/x", ""), false);
});
