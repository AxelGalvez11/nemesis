import assert from "node:assert/strict";
import test from "node:test";

import { citationSourceId, extractNoteCitations, isSafeExternalHref } from "./note-citations";

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

test("only http(s) counts as a safe external link", () => {
  assert.equal(isSafeExternalHref("https://example.com"), true);
  assert.equal(isSafeExternalHref("http://example.com"), true);
  // eslint-disable-next-line no-script-url -- the attack string under test
  assert.equal(isSafeExternalHref("javascript:alert(1)"), false);
  assert.equal(isSafeExternalHref("?source=abc"), false);
  assert.equal(isSafeExternalHref("mailto:a@b.c"), false);
});
