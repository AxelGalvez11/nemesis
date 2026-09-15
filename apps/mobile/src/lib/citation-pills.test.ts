// Deno unit tests (repo convention).
// Run: deno test --no-check --unstable-sloppy-imports --allow-read apps/mobile/src/lib/citation-pills.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { groundedReplyMarkdown, webCitationFaviconUrl, webCitationLabel } from "./citation-pills.ts";

const SOURCES = [
  { excerpts: [], id: "s1", kind: "pdf", title: "Lecture 4" },
  { excerpts: [], id: "s2", kind: "pdf", title: "Syllabus" },
];

const WEB_SOURCES = [
  { title: "Reuters report", url: "https://www.reuters.com/markets/2026/story" },
  { title: "FDA label", url: "https://www.fda.gov/drugs/label" },
];

// ── documents ([sN:eM]) ──────────────────────────────────────────────────────

Deno.test("groundedReplyMarkdown: a marker naming an attached source becomes a pill link", () => {
  const out = groundedReplyMarkdown("This activates the receptor [s1:e1].", SOURCES, []);
  assertEquals(out, "This activates the receptor [Lecture 4](#nemesis-file=s1).");
});

Deno.test("groundedReplyMarkdown: a marker naming a source this canvas does not hold is dropped, not printed raw", () => {
  const out = groundedReplyMarkdown("A claim [s9:e1] here.", SOURCES, []);
  assertEquals(out, "A claim here.");
});

Deno.test("groundedReplyMarkdown: no attached sources deletes every document marker rather than leaving it raw", () => {
  const out = groundedReplyMarkdown("A claim [s1:e1] here.", [], []);
  assertEquals(out, "A claim here.");
});

Deno.test("groundedReplyMarkdown: adjacent document markers into the same source collapse to one pill", () => {
  const out = groundedReplyMarkdown("The rule [s2:e1][s2:e2] holds.", SOURCES, []);
  assertEquals((out.match(/#nemesis-file=/g) ?? []).length, 1);
});

// ── web results ([n]) ────────────────────────────────────────────────────────

Deno.test("groundedReplyMarkdown: an in-range [n] resolves positionally against webSources, not the cited-order list", () => {
  // The model wrote [2] before [1] — a positional resolution must still hand [2] the SECOND
  // entry of webSources, never whichever page happened to be cited first.
  const out = groundedReplyMarkdown("The label warns of this [2]. It was reported first [1].", [], WEB_SOURCES);
  assertEquals(out, "The label warns of this [2](#nemesis-cite=2). It was reported first [1](#nemesis-cite=1).");
});

Deno.test("groundedReplyMarkdown: a [n] past the end of webSources is dropped, never printed raw", () => {
  const out = groundedReplyMarkdown("An invented claim [9].", [], WEB_SOURCES);
  assertEquals(out, "An invented claim.");
});

Deno.test("groundedReplyMarkdown: no web results at all deletes every [n] marker", () => {
  const out = groundedReplyMarkdown("A searched claim [1].", [], []);
  assertEquals(out, "A searched claim.");
});

Deno.test("groundedReplyMarkdown: adjacent [n] markers collapse into one pill with the extra count", () => {
  const out = groundedReplyMarkdown("Two pages agree [1][2].", [], WEB_SOURCES);
  assertEquals(out, "Two pages agree [1](#nemesis-cite=1.1).");
});

// ── both families in one reply ────────────────────────────────────────────────

Deno.test("groundedReplyMarkdown: a reply citing both a document and a web result resolves both, disjointly", () => {
  const out = groundedReplyMarkdown("Your slides say X [s1:e1], and so does this page [1].", SOURCES, WEB_SOURCES);
  assertEquals(out, "Your slides say X [Lecture 4](#nemesis-file=s1), and so does this page [1](#nemesis-cite=1).");
});

Deno.test("groundedReplyMarkdown: prose with no markers at all passes through unchanged", () => {
  const out = groundedReplyMarkdown("Plain sentence, nothing cited.", SOURCES, WEB_SOURCES);
  assertEquals(out, "Plain sentence, nothing cited.");
});

// ── favicon/label helpers ─────────────────────────────────────────────────────

Deno.test("webCitationFaviconUrl: proxies through Nemesis's own route, never Google directly", () => {
  const url = webCitationFaviconUrl("https://www.reuters.com/markets/2026/story");
  assertEquals(url, "https://app.enternemesis.com/api/favicon?domain=www.reuters.com");
});

Deno.test("webCitationFaviconUrl: an unusable URL yields no favicon rather than a broken request", () => {
  assertEquals(webCitationFaviconUrl("not a url"), null);
});

Deno.test("webCitationLabel: a site name, not the raw host, when one is recoverable", () => {
  assertEquals(webCitationLabel("https://en.wikipedia.org/wiki/Retatrutide"), "Wikipedia");
});

console.log("citation-pills: all assertions passed");
