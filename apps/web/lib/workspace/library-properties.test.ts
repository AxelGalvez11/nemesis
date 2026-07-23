import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addProperty,
  inferPropertyType,
  readFrontmatter,
  removeProperty,
  setPropertyValue,
} from "./library-properties";

const NOTE = `---
title: A New Hope
year: 1977
favorite: true
tags:
  - sci-fi
  - classic
---

# Notes

Body text with a --- divider below.

---

More body.
`;

test("reads every property with its type", () => {
  const front = readFrontmatter(NOTE);
  assert.equal(front.present, true);
  assert.deepEqual(front.properties.map((p) => [p.key, p.type]), [
    ["title", "text"],
    ["year", "number"],
    ["favorite", "checkbox"],
    ["tags", "list"],
  ]);
  assert.deepEqual(front.properties[3]!.value, ["sci-fi", "classic"]);
});

test("frontmatter is recognised ONLY at the very start of the note", () => {
  // The toolbar's Divider inserts "---" mid-document. Treating that as
  // frontmatter would turn every horizontal rule into a properties block.
  assert.equal(readFrontmatter("# Title\n\n---\nnot: frontmatter\n---\n").present, false);
  assert.equal(readFrontmatter("\n---\na: b\n---\n").present, false);
  // An unterminated opening fence is a divider, not an open frontmatter block.
  assert.equal(readFrontmatter("---\na: b\n\nstill body\n").present, false);
  assert.equal(readFrontmatter("").present, false);
  assert.equal(readFrontmatter("---\n---\n").present, true);
});

test("the body is never part of the block", () => {
  const front = readFrontmatter(NOTE);
  assert.equal(NOTE.slice(front.range![1]).trimStart().startsWith("# Notes"), true);
});

test("editing one value leaves every other byte untouched", () => {
  const next = setPropertyValue(NOTE, "year", "1980");
  assert.equal(next.includes("year: 1980"), true);
  // Everything else — including the body's divider — must survive verbatim.
  assert.equal(next.replace("year: 1980", "year: 1977"), NOTE);
});

test("round-trip PRESERVES yaml the UI cannot model", () => {
  // The one failure that loses real work: comments, nested maps, anchors and
  // flow style must survive an edit to an unrelated key. A parse-then-
  // reserialize would silently drop all of this.
  const messy = `---
# a leading comment
title: Kept
nested:
  deep:
    value: 3
flow: [a, b]   # trailing comment
anchor: &ref reused
alias: *ref
---
Body.
`;
  const next = setPropertyValue(messy, "title", "Changed");
  assert.equal(next.includes("# a leading comment"), true);
  assert.equal(next.includes("    value: 3"), true);
  assert.equal(next.includes("flow: [a, b]   # trailing comment"), true);
  assert.equal(next.includes("anchor: &ref reused"), true);
  assert.equal(next.includes("alias: *ref"), true);
  assert.equal(next.includes("title: Changed"), true);
  assert.equal(next.endsWith("---\nBody.\n"), true);
});

test("adding a property to a note that has no frontmatter creates the block", () => {
  const next = addProperty("# Title\n\nBody.\n", "status", "reading");
  assert.equal(next, "---\nstatus: reading\n---\n# Title\n\nBody.\n");
  assert.equal(readFrontmatter(next).properties.length, 1);
});

test("adding appends to an existing block without disturbing it", () => {
  const next = addProperty(NOTE, "status", "reading");
  const front = readFrontmatter(next);
  assert.deepEqual(front.properties.map((p) => p.key), ["title", "year", "favorite", "tags", "status"]);
  assert.equal(next.includes("  - classic\nstatus: reading\n---"), true);
});

test("adding a key that already exists overwrites it instead of duplicating", () => {
  const next = addProperty(NOTE, "year", "1980");
  assert.equal(readFrontmatter(next).properties.filter((p) => p.key === "year").length, 1);
  assert.equal(next.includes("year: 1980"), true);
});

test("removing the last property removes the whole block, leaving no stray fence", () => {
  const one = "---\nstatus: reading\n---\n# Title\n";
  const next = removeProperty(one, "status");
  assert.equal(next, "# Title\n");
  assert.equal(readFrontmatter(next).present, false);
});

test("removing one property of several keeps the block and the others", () => {
  const next = removeProperty(NOTE, "year");
  const front = readFrontmatter(next);
  assert.deepEqual(front.properties.map((p) => p.key), ["title", "favorite", "tags"]);
  assert.equal(next.includes("year"), false);
  assert.equal(next.includes("  - classic"), true);
});

test("removing a multi-line property takes all of its lines", () => {
  const next = removeProperty(NOTE, "tags");
  assert.equal(next.includes("sci-fi"), false);
  assert.equal(next.includes("classic"), false);
  assert.equal(readFrontmatter(next).properties.map((p) => p.key).includes("tags"), false);
});

test("removing a key that isn't there changes nothing", () => {
  assert.equal(removeProperty(NOTE, "nope"), NOTE);
  assert.equal(removeProperty("# Title\n", "nope"), "# Title\n");
});

test("type inference covers Obsidian's six types", () => {
  assert.equal(inferPropertyType("hello"), "text");
  assert.equal(inferPropertyType(1977), "number");
  assert.equal(inferPropertyType(true), "checkbox");
  assert.equal(inferPropertyType(["a", "b"]), "list");
  assert.equal(inferPropertyType(new Date("2020-08-21")), "date");
  // Bare strings that look like dates are still dates — that is how the YAML
  // spec tags them and how Obsidian displays them.
  assert.equal(inferPropertyType("2020-08-21"), "date");
  assert.equal(inferPropertyType("2020-08-21T10:30:00"), "datetime");
  // Null (a key with no value yet) is an empty text field, not a crash.
  assert.equal(inferPropertyType(null), "text");
});

test("a malformed block degrades to no properties instead of throwing", () => {
  const broken = "---\n: : :\n  bad\n---\nBody.\n";
  const front = readFrontmatter(broken);
  assert.equal(front.properties.length, 0);
  // And an edit against it is a no-op rather than a corrupting write.
  assert.equal(setPropertyValue(broken, "anything", "x"), broken);
});

test("CRLF notes keep their line endings", () => {
  const crlf = "---\r\ntitle: Kept\r\n---\r\nBody.\r\n";
  const front = readFrontmatter(crlf);
  assert.equal(front.present, true);
  assert.equal(front.properties[0]!.key, "title");
  const next = setPropertyValue(crlf, "title", "Changed");
  assert.equal(next.includes("\r\n"), true);
  assert.equal(next.includes("Body."), true);
});
