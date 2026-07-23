import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeLibraryHits } from "./library-search-merge";

const sem = (path: string, similarity: number) => ({ path, title: path, content: `body of ${path}`, similarity });
const lex = (path: string) => ({ path, title: path, snippet: `snippet of ${path}` });

test("semantic hits come first, ordered by similarity", () => {
  const merged = mergeLibraryHits([sem("b.md", 0.4), sem("a.md", 0.9)], [], 10);
  assert.deepEqual(merged.map((h) => h.path), ["a.md", "b.md"]);
});

test("a note found by both arms appears once, marked both", () => {
  const merged = mergeLibraryHits([sem("a.md", 0.8)], [lex("a.md")], 10);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.source, "both");
});

test("lexical-only hits are kept after semantic ones", () => {
  const merged = mergeLibraryHits([sem("a.md", 0.8)], [lex("z.md")], 10);
  assert.deepEqual(merged.map((h) => h.path), ["a.md", "z.md"]);
  assert.equal(merged[1]?.source, "lexical");
});

test("the limit is respected", () => {
  const merged = mergeLibraryHits([sem("a.md", 0.9), sem("b.md", 0.8)], [lex("c.md")], 2);
  assert.equal(merged.length, 2);
});

test("no semantic results degrades cleanly to the lexical list", () => {
  const merged = mergeLibraryHits([], [lex("a.md"), lex("b.md")], 10);
  assert.deepEqual(merged.map((h) => h.source), ["lexical", "lexical"]);
});
