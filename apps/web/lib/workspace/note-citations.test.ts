import assert from "node:assert/strict";
import test from "node:test";

import {
  citationAnchor,
  citationClock,
  citationSourceId,
  citationSources,
  describeCitation,
  extractNoteCitations,
  isSafeExternalHref,
} from "./note-citations";

test("extracts web and source citations in order of first appearance", () => {
  const markdown = [
    "T-cells mature in the thymus [1](https://pubmed.ncbi.nlm.nih.gov/123).",
    "",
    "The lecture covers this on slide 12 [2](?source=abc-123), and again [1](https://pubmed.ncbi.nlm.nih.gov/123).",
  ].join("\n");
  assert.deepEqual(extractNoteCitations(markdown), [
    { href: "https://pubmed.ncbi.nlm.nih.gov/123", n: 1 },
    { href: "?source=abc-123", n: 2 },
  ]);
});

test("ignores images, wiki links, ordinary links and fenced code", () => {
  const markdown = [
    "![1](https://example.com/pic.png)",
    "A real link: [the study](https://example.com/study).",
    "A wiki link label: [[1]] stays untouched.",
    "```",
    "[1](https://in-code.example.com)",
    "```",
    "But this counts [3](https://example.com/paper).",
  ].join("\n");
  assert.deepEqual(extractNoteCitations(markdown), [{ href: "https://example.com/paper", n: 3 }]);
});

test("citationSourceId reads only ?source= targets", () => {
  assert.equal(citationSourceId("?source=abc-123"), "abc-123");
  assert.equal(citationSourceId("?source=a%20b"), "a b");
  assert.equal(citationSourceId("https://example.com/?source=abc"), null);
  assert.equal(citationSourceId("?source="), null);
});

// 🔴 The regression that made anchored citations necessary AND broke them:
// citationSourceId used to take "everything after ?source=", which swallowed
// "&page=18" into the id and made every anchored citation look up a source that
// does not exist. Every pill fell back to a bare dot and every Sources row to
// "a file from your Library".
test("an anchor does not leak into the source id", () => {
  assert.equal(citationSourceId("?source=abc-123&page=18"), "abc-123");
  assert.equal(citationSourceId("?source=abc-123&t=762"), "abc-123");
  assert.equal(citationSourceId("?source=abc-123&page=4&q=commerce+clause"), "abc-123");
});

test("an anchor is read from the same parameters the reader consumes", () => {
  assert.deepEqual(citationAnchor("?source=x&page=18"), { query: null, seconds: null, unit: 18 });
  assert.deepEqual(citationAnchor("?source=x&slide=7"), { query: null, seconds: null, unit: 7 });
  assert.deepEqual(citationAnchor("?source=x&page=4&q=commerce+clause"), { query: "commerce clause", seconds: null, unit: 4 });
  assert.deepEqual(citationAnchor("?source=x&t=762"), { query: null, seconds: 762, unit: null });
});

test("a citation with no anchor still parses — nothing written before today breaks", () => {
  assert.equal(citationSourceId("?source=abc-123"), "abc-123");
  assert.deepEqual(citationAnchor("?source=abc-123"), { query: null, seconds: null, unit: null });
  assert.deepEqual(citationAnchor("https://example.com/?page=2"), { query: null, seconds: null, unit: null });
});

// Dropped, never clamped: a link claiming "page banana" is broken, and quietly
// landing on page 1 hides that.
test("a nonsense anchor is dropped rather than guessed", () => {
  assert.equal(citationAnchor("?source=x&page=banana").unit, null);
  assert.equal(citationAnchor("?source=x&page=-3").unit, null);
  assert.equal(citationAnchor("?source=x&page=0").unit, null, "there is no page 0");
  assert.equal(citationAnchor("?source=x&t=soon").seconds, null);
  // Zero IS a legitimate timestamp, unlike a page number.
  assert.equal(citationAnchor("?source=x&t=0").seconds, 0);
});

test("a pill says the source and where in it — the shapes the owner asked for", () => {
  assert.equal(
    describeCitation({ kind: "slides", name: "Lecture 6.pptx" }, citationAnchor("?source=x&slide=18")),
    "Lecture 6 · Slide 18",
  );
  assert.equal(
    describeCitation({ kind: "pdf", name: "Syllabus.pdf" }, citationAnchor("?source=x&page=4")),
    "Syllabus · Page 4",
  );
  assert.equal(
    describeCitation({ kind: "audio", name: "Transcript.m4a" }, citationAnchor("?source=x&t=762")),
    "Transcript · 12:42",
  );
});

test("a pill with no anchor is just the source — honest about not knowing where", () => {
  assert.equal(describeCitation({ kind: "pdf", name: "Syllabus.pdf" }, citationAnchor("?source=x")), "Syllabus");
});

test("a long file name is clipped so the pill cannot outgrow its sentence", () => {
  const label = describeCitation(
    { kind: "slides", name: "Constitutional Law Week 4 — Commerce Power and Federalism.pptx" },
    citationAnchor("?source=x&slide=2"),
  );
  assert.ok(label.length <= 34, label);
  assert.match(label, /…/);
  assert.match(label, /Slide 2$/);
});

test("clock times read the way a student would say them", () => {
  assert.equal(citationClock(0), "0:00");
  assert.equal(citationClock(62), "1:02");
  assert.equal(citationClock(762), "12:42");
  assert.equal(citationClock(3_723), "1:02:03");
});

// The prose cites three different slides of one deck; the Sources index is a
// list of FILES. Listing the same lecture three times reads as three lectures.
test("the Sources list groups by file while the pills stay per claim", () => {
  const markdown = [
    "One [1](?source=deck&page=2).",
    "Two [2](?source=deck&page=18).",
    "Three [3](https://example.com/a).",
  ].join("\n");
  const citations = extractNoteCitations(markdown);
  assert.equal(citations.length, 3, "each claim keeps its own pill");
  assert.deepEqual(citationSources(citations).map((citation) => citation.n), [1, 3]);
});

test("only http(s) counts as a safe external link", () => {
  assert.equal(isSafeExternalHref("https://example.com"), true);
  assert.equal(isSafeExternalHref("http://example.com"), true);
  // eslint-disable-next-line no-script-url -- the attack string under test
  assert.equal(isSafeExternalHref("javascript:alert(1)"), false);
  assert.equal(isSafeExternalHref("?source=abc"), false);
  assert.equal(isSafeExternalHref("mailto:a@b.c"), false);
});
