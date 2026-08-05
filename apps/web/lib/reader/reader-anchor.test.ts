import assert from "node:assert/strict";
import { test } from "node:test";

import { NO_ANCHOR, parseReaderAnchor, readerHref, readerHrefFrom, resolveAnchorUnit } from "./reader-anchor";

test("readerHref writes a bare source link when there is nothing to anchor", () => {
  assert.equal(readerHref("abc"), "/library/source/abc");
  assert.equal(readerHref("abc", NO_ANCHOR), "/library/source/abc");
});

test("readerHref carries a measured page and a highlight query", () => {
  assert.equal(readerHref("abc", { unit: 7, query: "commerce clause" }), "/library/source/abc?page=7&q=commerce+clause");
});

test("readerHref refuses to write a page number that is not a real page", () => {
  assert.equal(readerHref("abc", { unit: 0, query: null }), "/library/source/abc");
  assert.equal(readerHref("abc", { unit: -3, query: null }), "/library/source/abc");
  assert.equal(readerHref("abc", { unit: 2.5, query: null }), "/library/source/abc");
});

test("readerHref escapes an id that would otherwise break the path", () => {
  assert.equal(readerHref("a/b c"), "/library/source/a%2Fb%20c");
});

test("parseReaderAnchor reads page, slide and query", () => {
  assert.deepEqual(parseReaderAnchor(new URLSearchParams("page=12")), { unit: 12, query: null });
  assert.deepEqual(parseReaderAnchor(new URLSearchParams("slide=3")), { unit: 3, query: null });
  assert.deepEqual(parseReaderAnchor(new URLSearchParams("page=4&q=ohm")), { unit: 4, query: "ohm" });
});

test("parseReaderAnchor drops a nonsense page rather than landing on page 1", () => {
  assert.deepEqual(parseReaderAnchor(new URLSearchParams("page=banana")), { unit: null, query: null });
  assert.deepEqual(parseReaderAnchor(new URLSearchParams("page=0")), { unit: null, query: null });
  assert.deepEqual(parseReaderAnchor(new URLSearchParams("page=-2")), { unit: null, query: null });
  assert.deepEqual(parseReaderAnchor(new URLSearchParams("page=1.5")), { unit: null, query: null });
});

test("parseReaderAnchor accepts a plain object as well as URLSearchParams", () => {
  assert.deepEqual(parseReaderAnchor({ page: "9", q: " tort " }), { unit: 9, query: "tort" });
  assert.deepEqual(parseReaderAnchor({}), { unit: null, query: null });
});

test("page wins over slide when a link somehow carries both", () => {
  assert.deepEqual(parseReaderAnchor(new URLSearchParams("page=2&slide=8")), { unit: 2, query: null });
});

test("resolveAnchorUnit refuses to invent a page the document does not have", () => {
  assert.equal(resolveAnchorUnit({ unit: 7, query: null }, 40), 7);
  assert.equal(resolveAnchorUnit({ unit: 41, query: null }, 40), null);
  assert.equal(resolveAnchorUnit({ unit: null, query: null }, 40), null);
  assert.equal(resolveAnchorUnit({ unit: 1, query: null }, 0), null);
});

test("a link from a real workspace surface points at the gated reader route", () => {
  assert.equal(readerHrefFrom("/library", "abc"), "/library/source/abc");
  assert.equal(readerHrefFrom("/library/classic", "abc", { unit: 4, query: null }), "/library/source/abc?page=4");
});

test("a link from the signed-out harness stays inside the harness", () => {
  // Otherwise the demo dead-ends at /sign-in on exactly the click this
  // feature exists for.
  assert.equal(readerHrefFrom("/dev-preview/workspace/library", "abc"), "/dev-preview/reader?source=abc");
  assert.equal(
    readerHrefFrom("/dev-preview/workspace/library", "abc", { unit: 3, query: "ohm" }),
    "/dev-preview/reader?page=3&q=ohm&source=abc",
  );
});
