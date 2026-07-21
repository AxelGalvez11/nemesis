// Deno unit tests (repo convention) for the Graph screen's shared settings/
// label-visibility/node-cap helpers.
// Run: deno test --no-check apps/mobile/src/lib/graph-settings.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { capGraphNotes, isSmallGraph, MAX_GRAPH_NOTES, shouldShowLabel } from "./graph-settings.ts";

Deno.test("shouldShowLabel: 'all' always shows, 'none' never shows, regardless of degree/size", () => {
  assertEquals(shouldShowLabel("all", { degree: 0 }, false), true);
  assertEquals(shouldShowLabel("all", { degree: 0 }, true), true);
  assertEquals(shouldShowLabel("none", { degree: 99 }, true), false);
  assertEquals(shouldShowLabel("none", { degree: 99 }, false), false);
});

Deno.test("shouldShowLabel: 'hubs' shows every label on a small graph, only 2+-degree on a large one", () => {
  assertEquals(shouldShowLabel("hubs", { degree: 0 }, true), true, "small graph: even an isolated node gets a label");
  assertEquals(shouldShowLabel("hubs", { degree: 1 }, false), false, "large graph: a 1-degree node stays unlabeled");
  assertEquals(shouldShowLabel("hubs", { degree: 2 }, false), true, "large graph: 2+ degree is the hub cutoff");
});

Deno.test("isSmallGraph: <=40 nodes is small, 41+ is not", () => {
  assertEquals(isSmallGraph(0), true);
  assertEquals(isSmallGraph(40), true);
  assertEquals(isSmallGraph(41), false);
});

Deno.test("capGraphNotes: leaves an under-cap list untouched (but returns a copy, not the same array)", () => {
  const notes = [{ path: "b.md" }, { path: "a.md" }];
  const capped = capGraphNotes(notes, 200);
  assertEquals(capped, notes);
  assertEquals(capped === notes, false, "must be a fresh array, never the same reference (immutability rule)");
});

Deno.test("capGraphNotes: over-cap keeps the first N by path, sorted, deterministic regardless of input order", () => {
  const notes = Array.from({ length: 10 }, (_, i) => ({ path: `note-${9 - i}.md` })); // note-9..note-0, reverse order
  const capped = capGraphNotes(notes, 3);
  assertEquals(capped.map((n) => n.path), ["note-0.md", "note-1.md", "note-2.md"]);

  const reversedInput = [...notes].reverse();
  assertEquals(capGraphNotes(reversedInput, 3), capped, "stable regardless of input order");
});

Deno.test("capGraphNotes: default max is MAX_GRAPH_NOTES", () => {
  const notes = Array.from({ length: MAX_GRAPH_NOTES + 5 }, (_, i) => ({ path: `note-${i}.md` }));
  assertEquals(capGraphNotes(notes).length, MAX_GRAPH_NOTES);
});

console.log("graph-settings.test.ts assertions defined via Deno.test");
