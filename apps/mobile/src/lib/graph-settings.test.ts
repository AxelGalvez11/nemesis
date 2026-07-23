// Deno unit tests (repo convention) for the Graph screen's shared settings/
// label-visibility/node-cap helpers.
// Run: deno test --no-check apps/mobile/src/lib/graph-settings.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { capGraphNotes, fitScaleFor, isSmallGraph, MAX_GRAPH_NOTES, nodeRadiusFor, shouldShowLabel } from "./graph-settings.ts";

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

// --- Obsidian pass (owner 2026-07-23: "the graph page sucks") ---------------

Deno.test("nodeRadiusFor: a hub draws bigger than a leaf — Obsidian's defining rule", () => {
  const leaf = nodeRadiusFor(1, 10, 1);
  const hub = nodeRadiusFor(10, 10, 1);
  assertEquals(hub > leaf, true);
  // sqrt scaling: the gap stays bounded so one hub can't swallow the screen.
  assertEquals(hub < leaf * 3, true);
});

Deno.test("nodeRadiusFor: an orphan still gets a visible dot, and an empty graph can't divide by zero", () => {
  assertEquals(nodeRadiusFor(0, 10, 1) > 0, true);
  assertEquals(nodeRadiusFor(5, 0, 1) > 0, true);
});

Deno.test("nodeRadiusFor: the Node size slider scales every node together", () => {
  const single = nodeRadiusFor(4, 10, 1);
  const double = nodeRadiusFor(4, 10, 2);
  assertEquals(Math.abs(double - single * 2) < 1e-9, true);
});

Deno.test("fitScaleFor: shrinks a layout wider than the screen, grows one smaller than it", () => {
  const wide = fitScaleFor({ height: 400, width: 2000 }, { height: 800, width: 400 }, 0.4, 3);
  assertEquals(wide < 1, true);
  const tiny = fitScaleFor({ height: 100, width: 100 }, { height: 800, width: 400 }, 0.4, 3);
  assertEquals(tiny > 1, true);
});

Deno.test("fitScaleFor: clamps to the screen's pinch range", () => {
  assertEquals(fitScaleFor({ height: 99999, width: 99999 }, { height: 800, width: 400 }, 0.4, 3), 0.4);
  assertEquals(fitScaleFor({ height: 1, width: 1 }, { height: 800, width: 400 }, 0.4, 3), 3);
});

Deno.test("fitScaleFor: an unmeasured viewport or empty layout falls back to 1, never a nonsense scale", () => {
  assertEquals(fitScaleFor({ height: 400, width: 400 }, { height: 0, width: 0 }, 0.4, 3), 1);
  assertEquals(fitScaleFor({ height: 0, width: 0 }, { height: 800, width: 400 }, 0.4, 3), 1);
});
