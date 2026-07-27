// Deno unit tests (repo convention) for phone Library find.
// Run: deno test --no-check apps/mobile/src/lib/library-find.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findNotes, findSummary, matchesName } from "./library-find.ts";

const notes = [
  { path: "Pharmacology/Lecture 6.md", title: "Lecture 6" },
  { path: "Pharmacology/Digoxin.md", title: "Digoxin" },
  { path: "Renal/Clearance.md", title: "Clearance" },
];

Deno.test("an empty query shows everything, untouched", () => {
  const found = findNotes(notes, "  ");
  assertEquals(found.notes.length, 3);
  assertEquals(found.byMeaning, 0);
});

Deno.test("a name match is found by title or by folder", () => {
  assertEquals(matchesName(notes[1], "digo"), true);
  assertEquals(matchesName(notes[1], "pharmacology"), true);
  assertEquals(matchesName(notes[1], "renal"), false);
});

// The whole point: a note titled "Lecture 6" cannot be found by what it is about
// using the name filter alone. The index can, and its answer is appended.
Deno.test("a note the words do not name is still found by meaning", () => {
  const found = findNotes(notes, "first-pass metabolism", ["Pharmacology/Lecture 6.md"]);
  assertEquals(found.notes.map((n) => n.title), ["Lecture 6"]);
  assertEquals(found.byMeaning, 1);
});

Deno.test("name matches come first and keep their order", () => {
  const found = findNotes(notes, "clearance", ["Pharmacology/Digoxin.md"]);
  assertEquals(found.notes.map((n) => n.title), ["Clearance", "Digoxin"]);
  assertEquals(found.byMeaning, 1);
});

Deno.test("a note matched both ways is listed once, as a name match", () => {
  const found = findNotes(notes, "digoxin", ["Pharmacology/Digoxin.md"]);
  assertEquals(found.notes.map((n) => n.title), ["Digoxin"]);
  assertEquals(found.byMeaning, 0, "it matched the typed word, so it is not a meaning-only result");
});

// The index can briefly outlive a note deleted or moved on another device. A row
// that opens nothing is worse than a row that is simply absent.
Deno.test("an indexed path with no note behind it is dropped, not faked", () => {
  const found = findNotes(notes, "anything", ["Ghost/Gone.md"]);
  assertEquals(found.notes.length, 0);
  assertEquals(found.byMeaning, 0);
});

Deno.test("the index's own ranking is preserved among meaning matches", () => {
  const found = findNotes(notes, "zzz", ["Renal/Clearance.md", "Pharmacology/Digoxin.md"]);
  assertEquals(found.notes.map((n) => n.title), ["Clearance", "Digoxin"]);
});

Deno.test("the summary line only mentions meaning when some rows needed it", () => {
  assertEquals(findSummary(1, 0), "1 result");
  assertEquals(findSummary(4, 0), "4 results");
  assertEquals(findSummary(4, 2), "4 results · 2 by meaning");
});
