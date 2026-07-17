// Deno unit tests (repo convention) for the note-graph pure helpers.
// Run: deno test --no-check apps/mobile/src/lib/note-graph.test.ts
//
// Imports ONLY note-graph.ts, which is dependency-free by design (like
// library-sync.ts) so this file loads clean under Deno.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildNoteGraph,
  extractWikilinks,
  hashString,
  layoutNoteGraph,
  type NoteRef,
} from "./note-graph.ts";

function doc(path: string, title: string, content: string): NoteRef {
  return { content, path, pathHash: hashString(path).toString(16).padStart(8, "0"), title };
}

Deno.test("extractWikilinks finds plain, aliased, and heading links in order", () => {
  const md = "See [[Beta Blockers]] and [[ACE Inhibitors|ACEis]] plus [[Diuretics#Loop]].";
  assertEquals(extractWikilinks(md), ["Beta Blockers", "ACE Inhibitors", "Diuretics"]);
});

Deno.test("extractWikilinks ignores empties and returns nothing without links", () => {
  assertEquals(extractWikilinks("no links here"), []);
  assertEquals(extractWikilinks("[[ ]] [[|alias only]] [[#just-heading]]"), []);
});

Deno.test("buildNoteGraph links by title and basename, skipping unresolved and self-links", () => {
  const graph = buildNoteGraph([
    doc("Pharm/Beta Blockers.md", "Beta Blockers", "Pairs with [[Diuretics]] and [[Nope Missing]] and [[Beta Blockers]]."),
    doc("Pharm/Diuretics.md", "Diuretics — Loop & Thiazide", "See [[Beta Blockers]]."),
    doc("Cardio/Heart Failure.md", "Heart Failure", "Treat with [[Diuretics.md]]."),
  ]);
  assertEquals(graph.nodes.length, 3);
  // Sorted by path: 0 = Cardio/Heart Failure, 1 = Pharm/Beta Blockers, 2 = Pharm/Diuretics.
  assertEquals(graph.nodes.map((n) => n.title), ["Heart Failure", "Beta Blockers", "Diuretics — Loop & Thiazide"]);
  // Reciprocal Beta↔Diuretics dedupes to one edge; Heart Failure→Diuretics resolves via basename with .md.
  assertEquals(graph.edges, [
    { a: 0, b: 2 },
    { a: 1, b: 2 },
  ]);
  assertEquals(graph.nodes.map((n) => n.degree), [1, 1, 2]);
});

Deno.test("buildNoteGraph is order-independent (path-sorted internally)", () => {
  const docs = [
    doc("b.md", "B", "[[A]]"),
    doc("a.md", "A", ""),
  ];
  const forward = buildNoteGraph(docs);
  const reversed = buildNoteGraph([...docs].reverse());
  assertEquals(forward, reversed);
  assertEquals(forward.edges, [{ a: 0, b: 1 }]);
});

Deno.test("buildNoteGraph records the top-level folder per node", () => {
  const graph = buildNoteGraph([doc("Pharm/Cardio/Note.md", "Note", ""), doc("Root.md", "Root", "")]);
  assertEquals(graph.nodes.map((n) => n.folder), ["Pharm", ""]);
});

Deno.test("layoutNoteGraph is deterministic and keeps every node inside the canvas", () => {
  const docs: NoteRef[] = [];
  for (let i = 0; i < 24; i++) {
    const links = i > 0 ? `[[Note ${i - 1}]] [[Note 0]]` : "";
    docs.push(doc(`Course/Note ${i}.md`, `Note ${i}`, links));
  }
  const graph = buildNoteGraph(docs);
  const opts = { height: 500, padding: 24, width: 360 };
  const first = layoutNoteGraph(graph, opts);
  const second = layoutNoteGraph(graph, opts);
  assertEquals(first, second);
  for (const node of first.nodes) {
    assert(node.x >= 24 && node.x <= 336, `x in bounds: ${node.x}`);
    assert(node.y >= 24 && node.y <= 476, `y in bounds: ${node.y}`);
  }
  // The hub (Note 0) should out-degree everyone else.
  const hub = first.nodes.find((n) => n.title === "Note 0");
  assert(hub && hub.degree >= 20, `hub degree ${hub?.degree}`);
});

Deno.test("layoutNoteGraph separates nodes and never mutates its input", () => {
  const graph = buildNoteGraph([doc("a.md", "A", "[[B]]"), doc("b.md", "B", "")]);
  const before = JSON.stringify(graph);
  const laid = layoutNoteGraph(graph, { height: 300, width: 300 });
  assertEquals(JSON.stringify(graph), before);
  const [p, q] = laid.nodes;
  const dist = Math.hypot(p.x - q.x, p.y - q.y);
  assert(dist > 10, `nodes separated: ${dist}`);
});

Deno.test("layoutNoteGraph handles empty and single-note libraries", () => {
  assertEquals(layoutNoteGraph({ edges: [], nodes: [] }, { height: 100, width: 100 }).nodes, []);
  const one = layoutNoteGraph(buildNoteGraph([doc("solo.md", "Solo", "")]), { height: 100, width: 100 });
  assertEquals(one.nodes.length, 1);
  assert(one.nodes[0].x >= 0 && one.nodes[0].x <= 100);
});
