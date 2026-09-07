import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { gatherIntoBlock, growGroupFor, type BoardGroup, type GroupRect } from "./board-groups";
import { GLOBAL_SCOPE_LABEL, groupContaining, groupHoldingExactly, scopeForCard, scopeLabel } from "./board-scope";

// ── what a chat reads is where it stands ──────────────────────────────────────────────────────
//
// Owner, 2026-09-07, choosing between three shapes in writing: *"A frame, and whatever sits in it
// is what chats read"*, and *"chats will all sources selected should be 'global' chats"*.
//
// 🔴 HE WAS TOLD THE COST AND TOOK IT. The alternative offered was a stored tick list with the
// frame as a picture of it, because with this rule a drag changes an answer. The whole defence is
// that the change is VISIBLE, which is why the last test here is about a line of text and is not
// optional decoration.

const strip = (text: string) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel: string) => strip(readFileSync(new URL(rel, import.meta.url), "utf8"));

const rect = (id: string, x: number, y: number, width = 100, height = 80): GroupRect => ({ id, position: { x, y }, width, height });
const frame = (id: string, x: number, y: number, width: number, height: number, label = id): BoardGroup => ({ id, label, position: { x, y }, width, height });

test("🔴 a chat on open board is global: it reads every source, and keeps reading whatever arrives", () => {
  const scope = scopeForCard("chat", { groups: [], rects: [rect("chat", 0, 0)], sourceIds: ["s1", "s2"] });
  assert.equal(scope.global, true);
  assert.equal(scope.group, null);
  assert.deepEqual(scope.sourceIds, ["s1", "s2"]);
  // A source dropped later is inside the answer without anything being ticked, because the rule is
  // "everything", not "everything that existed when you asked".
  const later = scopeForCard("chat", { groups: [], rects: [rect("chat", 0, 0)], sourceIds: ["s1", "s2", "s3"] });
  assert.deepEqual(later.sourceIds, ["s1", "s2", "s3"]);
});

test("🔴🔴 a chat inside a frame reads the sources inside that frame and nothing else", () => {
  const group = frame("g", 0, 0, 400, 400);
  const rects = [rect("chat", 20, 20), rect("s1", 20, 120), rect("s2", 900, 20)];
  const scope = scopeForCard("chat", { groups: [group], rects, sourceIds: ["s1", "s2"] });
  assert.equal(scope.global, false);
  assert.equal(scope.group?.id, "g");
  assert.deepEqual(scope.sourceIds, ["s1"], "a source outside the frame is still being read");
});

test("🔴🔴 the drag the owner was warned about: moving a source out changes the answer, and must", () => {
  const group = frame("g", 0, 0, 400, 400);
  const inside = [rect("chat", 20, 20), rect("s1", 20, 120)];
  assert.deepEqual(scopeForCard("chat", { groups: [group], rects: inside, sourceIds: ["s1"] }).sourceIds, ["s1"]);
  const dragged = [rect("chat", 20, 20), rect("s1", 900, 120)];
  assert.deepEqual(scopeForCard("chat", { groups: [group], rects: dragged, sourceIds: ["s1"] }).sourceIds, [], "the frame is no longer what decides");
});

test("🔴 innermost wins, so a frame inside a frame means something", () => {
  const outer = frame("outer", 0, 0, 900, 900);
  const inner = frame("inner", 0, 0, 400, 400);
  const rects = [rect("chat", 20, 20), rect("s-in", 20, 120), rect("s-out", 500, 500)];
  const scope = scopeForCard("chat", { groups: [outer, inner], rects, sourceIds: ["s-in", "s-out"] });
  assert.equal(scope.group?.id, "inner");
  assert.deepEqual(scope.sourceIds, ["s-in"]);
  assert.equal(groupContaining("s-out", { groups: [outer, inner], rects })?.id, "outer");
});

test("🔴 a folded frame scopes exactly as an open one does", () => {
  // Collapsing draws the NODE short and leaves the stored rectangle alone (board-groups.ts), so
  // the same cards are inside it. A chevron that changed answers would be unexplainable.
  const group: BoardGroup = { ...frame("g", 0, 0, 400, 400), collapsed: true };
  const scope = scopeForCard("chat", { groups: [group], rects: [rect("chat", 20, 20), rect("s1", 20, 120)], sourceIds: ["s1"] });
  assert.deepEqual(scope.sourceIds, ["s1"]);
});

test("🔴 the label names the frame, because the frame is the thing to go and look at", () => {
  assert.equal(scopeLabel({ group: null, attachedSourceId: null, sourceIds: ["a", "b"], global: true }), `${GLOBAL_SCOPE_LABEL}, 2 sources`);
  assert.equal(scopeLabel({ group: null, attachedSourceId: null, sourceIds: [], global: true }), GLOBAL_SCOPE_LABEL);
  assert.equal(scopeLabel({ group: frame("g", 0, 0, 10, 10, "COPD"), attachedSourceId: null, sourceIds: ["a"], global: false }), "COPD, 1 source");
  assert.equal(scopeLabel({ group: null, attachedSourceId: "s1", sourceIds: ["s1"], global: false }, () => "Lecture 9.pdf"), "Lecture 9.pdf");
});

test("🔴🔴 a question dragged off one document still reads that document, not the whole board", () => {
  // Without this the frame rule would quietly turn every ask-about-this-PDF chat into a global one:
  // a card visibly joined to one lecture by a line, answering from eleven.
  const scope = scopeForCard("chat", { groups: [], rects: [rect("chat", 900, 0)], sourceIds: ["s1", "s2"], attachedSourceId: "s1" });
  assert.equal(scope.global, false);
  assert.deepEqual(scope.sourceIds, ["s1"]);
  // A frame outranks the line: dragging that chat into a group makes the group what it reads.
  const framed = scopeForCard("chat", { groups: [frame("g", 0, 0, 400, 400)], rects: [rect("chat", 20, 20), rect("s2", 20, 120)], sourceIds: ["s1", "s2"], attachedSourceId: "s1" });
  assert.equal(framed.group?.id, "g");
  assert.deepEqual(framed.sourceIds, ["s2"]);
  // A line to a document that has since been deleted is not a scope.
  assert.equal(scopeForCard("chat", { groups: [], rects: [rect("chat", 0, 0)], sourceIds: ["s2"], attachedSourceId: "gone" }).global, true);
});

test("🔴🔴 ticking the same sources twice reuses the frame instead of stacking a second one behind it", () => {
  const group = frame("g", 0, 0, 400, 400);
  const rects = [rect("s1", 20, 20), rect("s2", 20, 120), rect("s3", 900, 20)];
  const input = { groups: [group], rects, sourceIds: ["s1", "s2", "s3"] };
  assert.equal(groupHoldingExactly(["s1", "s2"], input)?.id, "g");
  assert.equal(groupHoldingExactly(["s1"], input), null, "a frame holding more than was ticked was reused");
  assert.equal(groupHoldingExactly([], input), null);
});

test("🔴🔴 ticked sources are GATHERED before they are framed, or the frame swallows the rest of the board", () => {
  // Three scattered sources with an unticked card standing between them: the bounding box around
  // where they sit would enclose it, and under this rule enclosing it means READING it.
  const scattered = [rect("s1", 0, 0, 640, 560), rect("s2", 2000, 0, 640, 560), rect("s3", 0, 2000, 640, 560)];
  const moved = gatherIntoBlock(scattered, { x: 0, y: 0 });
  assert.equal(moved.size, 3);
  assert.deepEqual(moved.get("s1"), { x: 0, y: 0 });
  assert.deepEqual(moved.get("s2"), { x: 688, y: 0 }, "640 wide plus a 48 gap");
  assert.deepEqual(moved.get("s3"), { x: 1376, y: 0 });
  // A fourth wraps to the next row, below the tallest of the first.
  const four = gatherIntoBlock([...scattered, rect("s4", 5000, 5000, 640, 560)], { x: 0, y: 0 });
  assert.deepEqual(four.get("s4"), { x: 0, y: 608 });
  assert.equal(gatherIntoBlock([]).size, 0);
  // With no origin it keeps the top-left it already had, which is what a caller with clear ground wants.
  assert.deepEqual(gatherIntoBlock([rect("a", 40, 90, 100, 100)]).get("a"), { x: 40, y: 90 });
});

test("🔴 a new chat placed in a frame grows it rather than hanging off its edge", () => {
  const grown = growGroupFor(frame("g", 100, 100, 400, 400), { width: 720, height: 320 });
  assert.equal(grown.group.height, 400 + 320 + 40);
  assert.deepEqual(grown.position, { x: 120, y: 520 });
  // Inside the grown rectangle, with air under it.
  assert.ok(grown.position.y + 320 <= grown.group.position.y + grown.group.height);
});

test("🔴🔴 the card SAYS what it reads, which is the whole defence of this design", () => {
  // The owner was told in writing that a drag would change an answer, and the answer to that was
  // that the change would be on screen. Delete this line from the card and the warning comes true.
  const CARD = read("../../components/workspace/board/conversation-card.tsx");
  assert.match(CARD, /data-card-scope=""/, "the conversation card no longer prints what it reads");
  assert.match(CARD, /scopeLabel\(/, "the card prints something other than the live scope");
});
