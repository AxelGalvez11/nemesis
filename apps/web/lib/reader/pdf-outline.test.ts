import assert from "node:assert/strict";
import { test } from "node:test";

import { flattenOutline, outlineFromHeadings } from "./pdf-outline";
import { at } from "./test-helpers";

test("a nested bookmark tree flattens in document order with depth", () => {
  const entries = flattenOutline([
    {
      title: "Part I",
      dest: "p1",
      items: [
        { title: "Chapter 1", dest: "c1", items: [{ title: "1.1 Scope", dest: "s1" }] },
        { title: "Chapter 2", dest: "c2" },
      ],
    },
    { title: "Part II", dest: "p2" },
  ]);
  assert.deepEqual(
    entries.map((entry) => [entry.title, entry.depth]),
    [
      ["Part I", 0],
      ["Chapter 1", 1],
      ["1.1 Scope", 2],
      ["Chapter 2", 1],
      ["Part II", 0],
    ],
  );
});

test("a leaf that goes nowhere is dropped; a grouping with children is kept", () => {
  const entries = flattenOutline([
    { title: "Dead end", dest: null },
    { title: "Grouping", dest: null, items: [{ title: "Real", dest: "x" }] },
  ]);
  assert.deepEqual(entries.map((entry) => entry.title), ["Grouping", "Real"]);
});

test("untitled and whitespace-only bookmarks are dropped", () => {
  const entries = flattenOutline([{ title: "   ", dest: "a" }, { title: "Kept", dest: "b" }]);
  assert.deepEqual(entries.map((entry) => entry.title), ["Kept"]);
});

test("titles are collapsed onto one line", () => {
  const entries = flattenOutline([{ title: "A  title\nover two lines", dest: "a" }]);
  assert.equal(at(entries, 0).title, "A title over two lines");
});

test("no outline at all is an empty list, not a crash", () => {
  assert.deepEqual(flattenOutline(null), []);
  assert.deepEqual(flattenOutline(undefined), []);
  assert.deepEqual(flattenOutline([]), []);
});

test("a pathologically deep tree stops rather than recursing forever", () => {
  let node: { title: string; dest: string; items?: unknown[] } = { title: "leaf", dest: "x" };
  for (let depth = 0; depth < 40; depth += 1) node = { title: `level ${depth}`, dest: "x", items: [node] };
  const entries = flattenOutline([node as never]);
  assert.ok(entries.length <= 8, `expected the walk to stop, got ${entries.length}`);
});

test("headings stand in for a document with no bookmarks, carrying their page", () => {
  const entries = outlineFromHeadings([
    { kind: "heading", text: "Overview", unit: 1, level: 1 },
    { kind: "paragraph", text: "ignored", unit: 1 },
    { kind: "heading", text: "Method", unit: 3, level: 2 },
  ]);
  assert.deepEqual(
    entries.map((entry) => [entry.title, entry.depth, entry.unit]),
    [
      ["Overview", 0, 1],
      ["Method", 1, 3],
    ],
  );
});

test("repeated section names in one PDF get distinct ids", () => {
  // 🔴 Real: a Journal of Cardiac Failure course packet is TWO articles in one
  // PDF, each with "Disclosures" and "CRediT authorship contribution statement"
  // at the same depth and the same position under their own parent. Keying on
  // (depth, sibling index, title) collided and React dropped outline rows.
  const entries = flattenOutline([
    { title: "Article one", dest: "a", items: [{ title: "Disclosures", dest: "a1", items: null }] },
    { title: "Article two", dest: "b", items: [{ title: "Disclosures", dest: "b1", items: null }] },
  ]);
  const ids = entries.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, `ids collided: ${JSON.stringify(ids)}`);
  assert.deepEqual(entries.map((entry) => entry.title), ["Article one", "Disclosures", "Article two", "Disclosures"]);
});
