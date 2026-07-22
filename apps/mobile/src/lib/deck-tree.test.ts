// Deno unit tests (repo convention) for the nested deck-folder tree.
// Run: deno test --no-check apps/mobile/src/lib/deck-tree.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { allGroupPaths, buildDeckTree, type DeckTreeItem, flattenDeckTree } from "./deck-tree.ts";

/** Minimal stand-in for the screen's DeckRow — the tree only ever reads the
 *  three fields below, so tests carry a bare id as the payload. */
function item(name: string, actionable = 0, total = 0): DeckTreeItem<string> {
  return { actionable, deck: name, name, total };
}

Deno.test("the owner's case: every parent level becomes a real folder", () => {
  const tree = buildDeckTree([
    item("Pharm::Cardio::Beta blockers"),
    item("Pharm::Cardio::CCBs"),
    item("Pharm::Renal"),
  ]);

  // One root — "Pharm" — NOT a flat "Pharm::Cardio" label.
  assertEquals(tree.length, 1);
  assertEquals(tree[0].label, "Pharm");
  assertEquals(tree[0].path, "Pharm");

  // Its children: the "Cardio" folder, then the "Renal" deck (groups first).
  assertEquals(tree[0].children.map((n) => n.label), ["Cardio", "Renal"]);
  assertEquals(tree[0].children[0].path, "Pharm::Cardio");
  assertEquals(tree[0].children[0].deck, null);
  assertEquals(tree[0].children[1].deck, "Pharm::Renal");

  // Three levels deep: the two leaf decks hang off Cardio.
  assertEquals(tree[0].children[0].children.map((n) => n.label), ["Beta blockers", "CCBs"]);
});

Deno.test("a folder label is its own segment, never the full path", () => {
  const tree = buildDeckTree([item("School::Year 1::Pharm::Cardio::Beta blockers")]);
  const labels: string[] = [];
  let node = tree[0];
  while (node) {
    labels.push(node.label);
    node = node.children[0];
  }
  assertEquals(labels, ["School", "Year 1", "Pharm", "Cardio", "Beta blockers"]);
});

Deno.test("decks with no '::' stay at the root, after the folders", () => {
  const tree = buildDeckTree([item("Loose deck"), item("Pharm::Cardio")]);
  assertEquals(tree.map((n) => n.label), ["Pharm", "Loose deck"]);
  assertEquals(tree[1].deck, "Loose deck");
});

Deno.test("counts roll up from grandchildren, not just direct children", () => {
  const tree = buildDeckTree([
    item("Pharm::Cardio::Beta blockers", 3, 40),
    item("Pharm::Cardio::CCBs", 2, 10),
    item("Pharm::Renal", 5, 7),
  ]);
  // Root sums every descendant: 3 + 2 + 5 actionable, 40 + 10 + 7 cards.
  assertEquals(tree[0].actionable, 10);
  assertEquals(tree[0].total, 57);
  // The middle folder sums only its own subtree.
  assertEquals(tree[0].children[0].actionable, 5);
  assertEquals(tree[0].children[0].total, 50);
});

Deno.test("sibling folders with the same name stay separate subtrees", () => {
  const tree = buildDeckTree([item("A::Cardio::One"), item("B::Cardio::Two")]);
  assertEquals(tree.map((n) => n.path), ["A", "B"]);
  assertEquals(tree[0].children[0].path, "A::Cardio");
  assertEquals(tree[1].children[0].path, "B::Cardio");
  // Same label, different identity — this is why collapse keys off the path.
  assertEquals(tree[0].children[0].label, tree[1].children[0].label);
});

Deno.test("folders sort alphabetically; decks in a level sort due-first", () => {
  const tree = buildDeckTree([
    item("Zed folder::x"),
    item("Alpha folder::y"),
    item("Quiet deck", 0),
    item("Urgent deck", 9),
  ]);
  assertEquals(tree.map((n) => n.label), ["Alpha folder", "Zed folder", "Urgent deck", "Quiet deck"]);
});

Deno.test("flatten walks depth-first and stamps indent depth", () => {
  const tree = buildDeckTree([item("Pharm::Cardio::Beta blockers"), item("Pharm::Renal")]);
  const rows = flattenDeckTree(tree, new Set());
  assertEquals(rows.map((r) => [r.type, r.label, r.depth]), [
    ["folder", "Pharm", 0],
    ["folder", "Cardio", 1],
    ["deck", "Beta blockers", 2],
    ["deck", "Renal", 1],
  ]);
});

Deno.test("collapsing a folder cascades — the whole subtree disappears", () => {
  const tree = buildDeckTree([item("Pharm::Cardio::Beta blockers"), item("Pharm::Renal")]);

  // Collapsing the ROOT hides the nested folder AND its grandchild deck.
  const rootShut = flattenDeckTree(tree, new Set(["Pharm"]));
  assertEquals(rootShut.map((r) => r.label), ["Pharm"]);

  // Collapsing only the middle folder keeps its sibling deck visible.
  const midShut = flattenDeckTree(tree, new Set(["Pharm::Cardio"]));
  assertEquals(midShut.map((r) => r.label), ["Pharm", "Cardio", "Renal"]);
});

Deno.test("collapse keys off the full path, so same-named folders act independently", () => {
  const tree = buildDeckTree([item("A::Cardio::One"), item("B::Cardio::Two")]);
  const rows = flattenDeckTree(tree, new Set(["A::Cardio"]));
  // A's Cardio is shut (no "One"), B's is untouched (still shows "Two").
  assertEquals(rows.map((r) => r.label), ["A", "Cardio", "B", "Cardio", "Two"]);
});

Deno.test("a collapsed folder reports it, so the row can point its chevron", () => {
  const tree = buildDeckTree([item("Pharm::Renal")]);
  const rows = flattenDeckTree(tree, new Set(["Pharm"]));
  assertEquals(rows[0].type === "folder" && rows[0].collapsed, true);
  const open = flattenDeckTree(tree, new Set());
  assertEquals(open[0].type === "folder" && open[0].collapsed, false);
});

Deno.test("allGroupPaths emits every ancestor, not just the deepest group", () => {
  // The default-collapse seed depends on this: seeding only "Pharm::Cardio"
  // would leave Cardio open the moment a student expands Pharm.
  assertEquals(allGroupPaths(["Pharm::Cardio::Beta blockers", "Pharm::Renal"]), [
    "Pharm",
    "Pharm::Cardio",
  ]);
});

Deno.test("allGroupPaths ignores deck-only names and de-duplicates", () => {
  assertEquals(allGroupPaths(["Loose", "A::x", "A::y", "A::B::z"]), ["A", "A::B"]);
});

Deno.test("blank and untidy segments are normalized away", () => {
  const tree = buildDeckTree([item("  Pharm :: :: Cardio ::Beta blockers ")]);
  assertEquals(tree[0].label, "Pharm");
  assertEquals(tree[0].children[0].label, "Cardio");
  assertEquals(tree[0].children[0].children[0].label, "Beta blockers");
});

Deno.test("a name that is only separators still renders as one loose deck", () => {
  const tree = buildDeckTree([item("::")]);
  assertEquals(tree.length, 1);
  assertEquals(tree[0].deck, "::");
  assertEquals(tree[0].label, "::");
});

Deno.test("an empty deck list produces an empty tree, not a phantom folder", () => {
  assertEquals(buildDeckTree([]), []);
  assertEquals(flattenDeckTree([], new Set()), []);
  assertEquals(allGroupPaths([]), []);
});
