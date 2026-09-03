// The mind map tree: what the parser keeps, and where the layout puts it.
//
// 🔴🔴 THE OWNER'S MAP IS A LADDER (2026-09-03): *"a hierarchical mind map... a ladder of things you
// need to know from shallow to deeply detailed"*, and *"one that I can click on and then reveals
// more nodes"*. So the tests here hold two promises: nothing the model wrote is lost between the
// fence and the tree, and nothing the learner has folded is on the plane.
//
// 🔴 EVERY LAYOUT TEST CHECKS GEOMETRY, NOT A SNAPSHOT. A snapshot of coordinates passes when the
// numbers are the same and says nothing about whether two boxes sit on top of each other. The
// invariants below (no overlap, parent centred, everything inside the frame) fail when the picture
// is wrong, whatever the numbers are.

import assert from "node:assert/strict";
import test from "node:test";

import {
  fullyExpanded,
  initiallyExpanded,
  labelPaths,
  layoutMindmap,
  mindmapStats,
  MINDMAP_METRICS,
  parseMermaidMindmap,
  parseOutlineMindmap,
  toggleNode,
  topExpanded,
  type LaidNode,
  type MindmapLayout,
  type MindmapNode,
} from "./mindmap-tree";

/** A law map wearing every mermaid shape at once, fenced the way the model hands it over. */
const SHAPES = `\`\`\`mermaid
mindmap
  root((Commerce power))
    a[Channels]
      Roads, rivers, wires
    b(Instrumentalities)
      Vehicles and persons
    c))Substantial effects((
      d)Aggregation(
      e{{Economic activity}}
    Bare text
\`\`\``;

/** The same shape of map, indented with tabs. */
const TABS = "mindmap\n\tBeam bending\n\t\tStress\n\t\t\tNeutral axis\n\t\tDeflection\n";

/** Comments, icons and class tags, on their own lines and at the ends of lines. */
const DRESSED = `mindmap
%% a note the model left for itself
  Contract formation
    Offer
    ::icon(fa fa-handshake)
    Acceptance:::urgent large
    Consideration ::icon(fa fa-coins)
    :::faded
    %% another comment
    Intention
`;

/** Two column-zero nodes: the model forgot an indent, not the map. */
const TWO_ROOTS = `mindmap
Kinematics
  Velocity
Dynamics
  Force
`;

/** A history outline with two-space bullets. */
const OUTLINE = `# Roman republic
- Magistrates
  - Consuls
  - Praetors
- Assemblies
  - Centuriate
- Senate
`;

const labels = (node: MindmapNode): unknown => [node.label, node.children.map(labels)];

function must<T>(value: T | null | undefined, what: string): T {
  assert.ok(value !== null && value !== undefined, `${what} is missing`);
  return value;
}

const byId = (layout: MindmapLayout, id: string): LaidNode => must(layout.nodes.find((node) => node.id === id), `laid node ${id}`);

const overlaps = (a: LaidNode, b: LaidNode) =>
  !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

/** A deeper tree than a model usually writes: four branches, three below each, two below those. */
function deepTree(): MindmapNode {
  let n = 0;
  const make = (label: string, depth: number, id: string): MindmapNode => {
    const fan = depth === 0 ? 4 : depth === 1 ? 3 : depth === 2 ? 2 : 0;
    return {
      id,
      label,
      children: Array.from({ length: fan }, (_, i) => make(`${label} ${n++}`, depth + 1, `${id}.${i}`)),
    };
  };
  return make("Statics", 0, "n0");
}

// ---------------------------------------------------------------------------------------------
// The mermaid parser

test("every mermaid shape unwraps to its words, and the fence lines are not nodes", () => {
  const root = must(parseMermaidMindmap(SHAPES), "the shapes map");
  assert.deepEqual(labels(root), [
    "Commerce power",
    [
      ["Channels", [["Roads, rivers, wires", []]]],
      ["Instrumentalities", [["Vehicles and persons", []]]],
      ["Substantial effects", [["Aggregation", []], ["Economic activity", []]]],
      ["Bare text", []],
    ],
  ]);
});

test("ids come from position, so the same map parsed twice keys the same way", () => {
  const root = must(parseMermaidMindmap(SHAPES), "the shapes map");
  assert.equal(root.id, "n0");
  assert.deepEqual(root.children.map((child) => child.id), ["n0.0", "n0.1", "n0.2", "n0.3"]);
  assert.equal(root.children[2]?.children[1]?.id, "n0.2.1");
  assert.deepEqual(parseMermaidMindmap(SHAPES), root);
});

test("tabs indent like spaces do", () => {
  const root = must(parseMermaidMindmap(TABS), "the tabbed map");
  assert.deepEqual(labels(root), ["Beam bending", [["Stress", [["Neutral axis", []]]], ["Deflection", []]]]);
});

test("🔴 comments, icons and class tags are dressing, never nodes and never part of a label", () => {
  const root = must(parseMermaidMindmap(DRESSED), "the dressed map");
  assert.deepEqual(labels(root), [
    "Contract formation",
    [["Offer", []], ["Acceptance", []], ["Consideration", []], ["Intention", []]],
  ]);
});

test("🔴 a second column-zero node folds under the root instead of breaking the parse", () => {
  const root = must(parseMermaidMindmap(TWO_ROOTS), "the two-root map");
  assert.deepEqual(labels(root), ["Kinematics", [["Velocity", []], ["Dynamics", [["Force", []]]]]]);
});

test("front matter, quoted labels and <br/> all come out as plain words", () => {
  const root = must(
    parseMermaidMindmap('---\ntitle: Equity\n---\nmindmap\n  root["Equity and<br/>trusts"]\n    a["Express trusts"]\n'),
    "the front-matter map",
  );
  assert.deepEqual(labels(root), ["Equity and trusts", [["Express trusts", []]]]);
});

test("a shape with nothing inside keeps its id, which is the only name it has", () => {
  const root = must(parseMermaidMindmap("mindmap\n  root(())\n    x[]\n"), "the empty-shape map");
  assert.deepEqual(labels(root), ["root", [["x", []]]]);
});

test("🔴 what is not a mind map comes back null, so the caller draws it the old way", () => {
  for (const text of ["", "   \n", "flowchart TD\n  A --> B", "just a paragraph", "mindmap\n", "mindmap\n%% only a comment\n", "```mermaid\nsequenceDiagram\n```"]) {
    assert.equal(parseMermaidMindmap(text), null, `parsed a tree out of ${JSON.stringify(text)}`);
  }
});

test("the header is case-insensitive and the fence may be absent", () => {
  assert.deepEqual(labels(must(parseMermaidMindmap("MindMap\n  Torts\n    Negligence"), "unfenced")), ["Torts", [["Negligence", []]]]);
});

// ---------------------------------------------------------------------------------------------
// The outline parser

test("a heading root with two-space bullets", () => {
  const root = must(parseOutlineMindmap(OUTLINE), "the outline");
  assert.deepEqual(labels(root), [
    "Roman republic",
    [["Magistrates", [["Consuls", []], ["Praetors", []]]], ["Assemblies", [["Centuriate", []]]], ["Senate", []]],
  ]);
});

test("🔴 four-space bullets read as one level per indent, not two", () => {
  const root = must(
    parseOutlineMindmap("# Thermodynamics\n- First law\n    - Internal energy\n    - Work\n- Second law\n    - Entropy\n"),
    "the four-space outline",
  );
  assert.deepEqual(labels(root), [
    "Thermodynamics",
    [["First law", [["Internal energy", []], ["Work", []]]], ["Second law", [["Entropy", []]]]],
  ]);
});

test("## headings sit one level down and their bullets under them", () => {
  const root = must(
    parseOutlineMindmap("# Property law\n## Estates\n- Fee simple\n- Life estate\n## Interests\n- Easements\n"),
    "the headed outline",
  );
  assert.deepEqual(labels(root), [
    "Property law",
    [["Estates", [["Fee simple", []], ["Life estate", []]]], ["Interests", [["Easements", []]]]],
  ]);
});

test("star bullets and numbered items are bullets too", () => {
  const root = must(parseOutlineMindmap("# Circuits\n* Ohm's law\n* Kirchhoff\n  1. Current law\n  2. Voltage law\n"), "the star outline");
  assert.deepEqual(labels(root), ["Circuits", [["Ohm's law", []], ["Kirchhoff", [["Current law", []], ["Voltage law", []]]]]]);
});

test("an outline with no heading takes its first bullet as the root", () => {
  const root = must(parseOutlineMindmap("- Alpha\n- Beta\n  - Gamma\n"), "the headless outline");
  assert.deepEqual(labels(root), ["Alpha", [["Beta", [["Gamma", []]]]]]);
});

test("the study shelf's own saved outline opens as the same tree the mermaid fence would give", () => {
  const saved = "# Commerce power\n- Channels\n  - Roads, rivers, wires\n  - Regulated directly\n- Instrumentalities\n  - Vehicles and persons\n  - Protected in transit\n- Substantial effects\n  - Aggregation\n  - Economic activity";
  const root = must(parseOutlineMindmap(saved), "the saved outline");
  assert.deepEqual(mindmapStats(root), { nodes: 10, depth: 3, leaves: 6 });
});

test("🔴 prose, a flowchart and nothing at all are not outlines", () => {
  for (const text of ["", "A paragraph about beams.", "```mermaid\nflowchart TD\n  A --> B\n```"]) {
    assert.equal(parseOutlineMindmap(text), null, `parsed a tree out of ${JSON.stringify(text)}`);
  }
});

// ---------------------------------------------------------------------------------------------
// Stats

test("stats count every node, the levels down from the root, and the leaves", () => {
  const root = must(parseMermaidMindmap(SHAPES), "the shapes map");
  assert.deepEqual(mindmapStats(root), { nodes: 9, depth: 3, leaves: 5 });
  assert.deepEqual(mindmapStats({ id: "n0", label: "Alone", children: [] }), { nodes: 1, depth: 1, leaves: 1 });
});

// ---------------------------------------------------------------------------------------------
// The layout

test("🔴🔴 a folded node is drawn and nothing below it is", () => {
  const root = deepTree();
  const layout = layoutMindmap(root, topExpanded(root));
  assert.deepEqual(layout.nodes.map((node) => node.id), ["n0", "n0.0", "n0.1", "n0.2", "n0.3"]);
  assert.ok(layout.nodes.every((node) => node.depth <= 1), "a grandchild reached the plane");
  assert.ok(layout.nodes.slice(1).every((node) => node.childCount === 3 && !node.expanded), "a folded branch does not say it is folded");
  assert.equal(layout.edges.length, 4);

  // Open one branch: its children appear, its siblings' children still do not.
  const oneOpen = layoutMindmap(root, toggleNode(topExpanded(root), "n0.1"));
  assert.ok(oneOpen.nodes.some((node) => node.id === "n0.1.2"));
  assert.ok(!oneOpen.nodes.some((node) => node.id === "n0.0.0"));
  assert.equal(byId(oneOpen, "n0.1").expanded, true);
});

test("🔴🔴 no two boxes overlap, at every depth of unfolding, across every pair of subtrees", () => {
  const root = deepTree();
  for (const [name, expanded] of [
    ["top", topExpanded(root)],
    ["initial", initiallyExpanded(root)],
    ["full", fullyExpanded(root)],
    ["ragged", toggleNode(toggleNode(fullyExpanded(root), "n0.1"), "n0.3.0")],
  ] as const) {
    const { nodes } = layoutMindmap(root, expanded);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        assert.ok(!overlaps(nodes[i]!, nodes[j]!), `${name}: ${nodes[i]!.id} and ${nodes[j]!.id} overlap`);
      }
    }
  }
});

test("🔴 a parent sits level with the middle of its first and last child", () => {
  const root = deepTree();
  const layout = layoutMindmap(root, fullyExpanded(root));
  for (const parent of layout.nodes.filter((node) => node.expanded)) {
    const children = layout.edges.filter((edge) => edge.from === parent.id).map((edge) => byId(layout, edge.to));
    const first = children[0]!;
    const last = children[children.length - 1]!;
    const middle = (first.y + first.h / 2 + last.y + last.h / 2) / 2;
    assert.equal(parent.y + parent.h / 2, middle, `${parent.id} is not centred on its children`);
  }
});

test("🔴 the frame covers every box, and a folded box at the far right keeps room for its badge", () => {
  const root = deepTree();
  for (const expanded of [topExpanded(root), fullyExpanded(root)]) {
    const layout = layoutMindmap(root, expanded);
    for (const node of layout.nodes) {
      assert.ok(node.x >= 0 && node.y >= 0, `${node.id} is off the top or left`);
      assert.ok(node.x + node.w <= layout.width, `${node.id} runs off the right`);
      assert.ok(node.y + node.h <= layout.height, `${node.id} runs off the bottom`);
    }
  }
  const folded = layoutMindmap(root, topExpanded(root));
  const branch = byId(folded, "n0.2");
  assert.ok(folded.width >= branch.x + branch.w + 30, "no room to the right of a folded branch for the +N");
});

test("🔴 ids and depths stay put when the unfolding changes, so keys and the opened set survive", () => {
  const root = deepTree();
  const a = layoutMindmap(root, initiallyExpanded(root));
  const b = layoutMindmap(root, fullyExpanded(root));
  for (const node of a.nodes) {
    const twin = byId(b, node.id);
    assert.equal(twin.label, node.label);
    assert.equal(twin.depth, node.depth);
  }
});

test("the root is furthest left and every child is to the right of its parent, by a whole gap", () => {
  const root = deepTree();
  const layout = layoutMindmap(root, fullyExpanded(root));
  const rootBox = byId(layout, "n0");
  assert.ok(layout.nodes.every((node) => node.x >= rootBox.x));
  for (const edge of layout.edges) {
    const parent = byId(layout, edge.from);
    const child = byId(layout, edge.to);
    assert.ok(child.x >= parent.x + parent.w + MINDMAP_METRICS.gapX, `${edge.to} crowds ${edge.from}`);
  }
});

test("each edge leaves the parent's right edge and arrives at the child's left edge, both at mid height", () => {
  const root = must(parseMermaidMindmap(SHAPES), "the shapes map");
  const layout = layoutMindmap(root, fullyExpanded(root));
  for (const edge of layout.edges) {
    const parent = byId(layout, edge.from);
    const child = byId(layout, edge.to);
    const match = /^M(\S+) (\S+) C\S+ \S+, \S+ \S+, (\S+) (\S+)$/.exec(edge.d);
    assert.ok(match, `${edge.d} is not one cubic`);
    assert.equal(Number(match[1]), parent.x + parent.w);
    assert.equal(Number(match[2]), parent.y + parent.h / 2);
    assert.equal(Number(match[3]), child.x);
    assert.equal(Number(match[4]), child.y + child.h / 2);
  }
});

test("the same map lays out the same way twice, and never at random", () => {
  const root = deepTree();
  assert.deepEqual(layoutMindmap(root, initiallyExpanded(root)), layoutMindmap(root, initiallyExpanded(root)));
});

test("a wider character makes a wider box, and the root is set a size up", () => {
  const root: MindmapNode = { id: "n0", label: "Stress", children: [{ id: "n0.0", label: "Stress", children: [] }] };
  const narrow = layoutMindmap(root, fullyExpanded(root));
  const wide = layoutMindmap(root, fullyExpanded(root), { charWidth: 20 });
  assert.ok(byId(wide, "n0.0").w > byId(narrow, "n0.0").w);
  assert.ok(byId(narrow, "n0").w > byId(narrow, "n0.0").w, "the root box is not roomier than a child with the same word");
  assert.equal(byId(narrow, "n0.0").w, Math.ceil(6 * MINDMAP_METRICS.charWidth) + 2 * MINDMAP_METRICS.padX);
});

// ---------------------------------------------------------------------------------------------
// The opened set

test("a map opens on the root and its direct children, and no deeper", () => {
  const root = deepTree();
  const opened = initiallyExpanded(root);
  assert.deepEqual([...opened], ["n0", "n0.0", "n0.1", "n0.2", "n0.3"]);
  assert.ok(!opened.has("n0.0.0"));
});

test("toggleNode opens, then folds, and never touches the set it was given", () => {
  const start = new Set(["n0"]);
  const opened = toggleNode(start, "n0.1");
  assert.deepEqual([...opened], ["n0", "n0.1"]);
  assert.deepEqual([...toggleNode(opened, "n0.1")], ["n0"]);
  assert.deepEqual([...start], ["n0"]);
});

test("fullyExpanded names every node with children and no leaf; topExpanded names only the root", () => {
  const root = deepTree();
  const all = fullyExpanded(root);
  assert.equal(all.size, 1 + 4 + 12);
  assert.ok(!all.has("n0.0.0.0"));
  assert.deepEqual([...topExpanded(root)], ["n0"]);
});

test("a leaf knows the labels above it", () => {
  const root = must(parseMermaidMindmap(SHAPES), "the shapes map");
  const paths = labelPaths(root);
  assert.deepEqual(paths.get("n0.2.1"), ["Commerce power", "Substantial effects", "Economic activity"]);
  assert.deepEqual(paths.get("n0"), ["Commerce power"]);
});
