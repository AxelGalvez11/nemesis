import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeLibraryHits } from "./library-search-merge";

// The tool's contract under a dead semantic arm: an empty semantic list must
// still yield today's substring results, in today's shape. This is the guarantee
// that shipping semantic search cannot make the agent WORSE at finding notes.
// (searchLibrary itself imports the browser Supabase client, so the invariant is
// asserted here against the pure merge it delegates to.)
test("a dead semantic arm degrades to exactly the lexical results", () => {
  const lexical = [
    { path: "Pharmacology/ACE inhibitors.md", title: "ACE inhibitors", snippet: "block angiotensin" },
    { path: "PHCY 1205/Week 3.md", title: "Week 3", snippet: "renal dosing" },
  ];
  const merged = mergeLibraryHits([], lexical, 30);
  assert.deepEqual(
    merged.map(({ path, snippet, title }) => ({ path, snippet, title })),
    lexical,
  );
});

test("semantic results outrank a lexical-only match", () => {
  const merged = mergeLibraryHits(
    [{ path: "a.md", title: "A", content: "about blood pressure", similarity: 0.71 }],
    [{ path: "z.md", title: "Z", snippet: "literal token" }],
    30,
  );
  assert.deepEqual(merged.map((h) => h.path), ["a.md", "z.md"]);
});
