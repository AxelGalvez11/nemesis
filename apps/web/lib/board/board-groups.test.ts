import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CARD_LABEL_ABOVE,
  GROUP_COLORS,
  GROUP_HEADER,
  GROUP_PADDING,
  UNTITLED_GROUP,
  groupBoundsFor,
  groupFromSelection,
  nodesInsideGroup,
  parseBoardGroups,
  type BoardGroup,
  type GroupRect,
} from "./board-groups";

// ── groups on the board, Obsidian's way ────────────────────────────────────────────────────────
//
// Owner, 2026-09-06: *"can you copy the obsidian way to make groups in canvas and color them?"*,
// and in the same message *"there should be a way to collapse groups too"*.
//
// The one rule everything here protects: A GROUP STORES NO MEMBERS. Obsidian's own group node is
// `{type: "group", label?, background?}` and membership is answered live from the geometry
// (docs/obsidian-canvas-reference.md, read out of their bundle). A future change that "optimises"
// this into a stored list of ids would reintroduce every broken-membership bug that design avoids,
// and it would look correct in a screenshot.

const strip = (text: string) => text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (rel: string) => strip(readFileSync(new URL(rel, import.meta.url), "utf8"));

const MODEL = read("./board-groups.ts");
const CARD = read("../../components/workspace/board/group-card.tsx");
const SURFACE = read("../../components/workspace/board/board-surface.tsx");
const PROVIDER = read("../../components/workspace/board/board-provider.tsx");

const rect = (id: string, x: number, y: number, width = 100, height = 80): GroupRect => ({ id, position: { x, y }, width, height });
const frame = (partial: Partial<BoardGroup> = {}): BoardGroup => ({ id: "g", label: "Frame", position: { x: 0, y: 0 }, width: 400, height: 400, ...partial });

test("🔴🔴 a group holds by geometry: what is inside is asked, never stored", () => {
  // Nothing in the type carries members, and nothing in the three files that use it invents one.
  assert.ok(!/memberIds|children|nodeIds\s*:/.test(MODEL), "the group model grew a member list");
  assert.ok(!/parentId|parentNode|extent: "parent"/.test(CARD), "the frame became a React Flow parent node");
  const group = frame({ width: 300, height: 300 });
  assert.deepEqual(nodesInsideGroup(group, [rect("a", 10, 10), rect("b", 500, 10)]), ["a"], "containment is not what decides membership");
  // Half in is out: a card that visibly sticks through the frame must not travel with it.
  assert.deepEqual(nodesInsideGroup(group, [rect("half", 250, 10)]), [], "a card overhanging the edge counts as inside");
  // The frame never contains itself.
  assert.deepEqual(nodesInsideGroup(group, [rect("g", 10, 10)]), [], "a group contains itself");
});

test("🔴 the frame is the bounding box padded by 20, with the label bar above it (Obsidian's numbers)", () => {
  const bounds = groupBoundsFor([rect("a", 100, 100, 200, 100), rect("b", 400, 300, 100, 100)]);
  assert.ok(bounds);
  assert.equal(bounds.position.x, 100 - GROUP_PADDING);
  // 🔴 THE CARDS' OWN TITLES HANG ABOVE THEIR BOXES, so the frame has to clear those too, or its
  // label bar prints on the top card's name. That was the owner's "weird attachment".
  assert.equal(bounds.position.y, 100 - GROUP_PADDING - GROUP_HEADER - CARD_LABEL_ABOVE, "the label bar eats into the cards instead of sitting above them");
  assert.equal(bounds.width, 500 - 100 + GROUP_PADDING * 2);
  assert.equal(bounds.height, 400 - 100 + GROUP_PADDING * 2 + GROUP_HEADER + CARD_LABEL_ABOVE);
  assert.match(readFileSync(new URL("../../components/workspace/board/board-chrome.tsx", import.meta.url), "utf8"), /absolute bottom-full left-\[4px\] right-\[4px\] mb-\[6px\]/, "the card title moved, so CARD_LABEL_ABOVE is now a lie");
  assert.equal(groupBoundsFor([]), null, "an empty selection still makes a frame");
  // And a new frame is born asking for a name, as Obsidian's is.
  assert.equal(groupFromSelection([rect("a", 0, 0)], "id")?.label, UNTITLED_GROUP);
  assert.equal(groupFromSelection([], "id"), null);
});

test("🔴 a stored group is read without being trusted", () => {
  const parsed = parseBoardGroups([
    { id: "ok", label: "Week 1", position: { x: 1, y: 2 }, width: 900, height: 700, color: "4", collapsed: true },
    { id: "bad-size", position: { x: 0, y: 0 }, width: "wide", height: 10 },
    { label: "no id", position: { x: 0, y: 0 }, width: 300, height: 300 },
    { id: "bad-colour", position: { x: 0, y: 0 }, width: 300, height: 300, color: "17" },
    "not an object",
  ]);
  assert.deepEqual(parsed.map((group) => group.id), ["ok", "bad-colour"]);
  assert.equal(parsed[0]?.color, "4");
  assert.equal(parsed[0]?.collapsed, true);
  assert.equal(parsed[1]?.color, undefined, "an unknown colour is kept");
  assert.equal(parsed[1]?.label, UNTITLED_GROUP);
  assert.equal(parseBoardGroups(undefined).length, 0, "a board saved before groups existed does not load");
  // Six colours and "none", the palette Obsidian uses.
  assert.deepEqual([...GROUP_COLORS], ["none", "1", "2", "3", "4", "5", "6"]);
});

test("🔴🔴 the node type is `groupBox`: `group` is one of React Flow's four reserved names", () => {
  assert.match(SURFACE, /groupBox: GroupCard/, "the frame is not registered");
  assert.ok(!/\bgroup: GroupCard\b/.test(SURFACE), "the frame is registered under React Flow's own `group` type — it will be drawn inside their box");
  assert.match(SURFACE, /type: "groupBox"/);
});

test("🔴🔴 a frame is behind every card, and stays behind when it is selected", () => {
  // React Flow adds 1000 to a selected node's z, so -1 would jump in front on the first click.
  assert.match(SURFACE, /const GROUP_Z = -1001;/, "the frame's depth no longer survives being selected");
  assert.match(SURFACE, /zIndex: GROUP_Z/);
});

test("🔴 only the label bar drags a frame; its body belongs to the board", () => {
  assert.match(SURFACE, /dragHandle: `\.\$\{GROUP_DRAG_HANDLE\}`/, "the whole frame is draggable, so panning inside one moves the group");
  assert.match(CARD, /pointer-events-none min-h-0 flex-1/, "the frame's body takes presses");
  // The name is text until it is double-clicked, or the input's `nodrag` eats the bar.
  assert.match(CARD, /onDoubleClick=\{\(\) => setNaming\(true\)\}/, "the name has no way into edit mode");
  // 🔴 AND ONE CLICK ON A FRAME YOU HAVE ALREADY CHOSEN (owner 2026-09-06: "users should be able to
  // name the group"). Double-click alone worked and nothing on screen said so.
  assert.match(CARD, /if \(selected\) setNaming\(true\);/, "renaming is back to double-click only");
  assert.match(CARD, /naming \?/, "the name is always an input again — the bar will stop dragging");
});

test("🔴🔴 dragging a frame carries what was inside it when it was picked up, not what it passes over", () => {
  assert.match(SURFACE, /const carrying = useRef</, "nothing records what the frame is carrying");
  assert.match(SURFACE, /carrying\.current = group\s*\n?\s*\?/, "membership is not captured at drag start");
  assert.match(SURFACE, /held\.members\.map\(\(member\) => \(\{ id: member\.id, type: "position" as const/, "the cards inside do not move with the frame");
});

test("🔴 folding a frame hides what is in it and keeps its rectangle", () => {
  assert.match(SURFACE, /const hidden = useMemo\(/, "nothing works out what a folded frame hides");
  assert.match(SURFACE, /for \(const id of nodesInsideGroup\(group, rects\)\) set\.add\(id\)/);
  assert.match(SURFACE, /\{ \.\.\.node, hidden: shouldHide \}/, "hidden cards are filtered out instead, which leaves their lines drawn to nothing");
  assert.match(SURFACE, /group\.collapsed \? GROUP_HEADER : group\.height/, "the NODE is not what shrinks");
  assert.ok(!/setGroupCollapsed\([^)]*height/.test(PROVIDER), "collapsing writes a new height, so the frame comes back empty");
});

test("🔴 deleting a frame keeps the cards that were standing in it", () => {
  assert.match(PROVIDER, /const deleteGroup = useCallback\(\(groupId: string\) => setGroups\(\(all\) => all\.filter\(\(group\) => group\.id !== groupId\)\), \[\]\);/);
  assert.match(SURFACE, /if \(node\.type === "groupBox"\) deleteGroup\(node\.id\)/, "Backspace on a frame goes to the card deleter");
});

test("🔴 the colours are inline on the bar, not behind a menu (owner: no popups in canvas)", () => {
  assert.match(CARD, /data-group-colors=""/);
  assert.ok(!/DropdownMenu|Popover|Dialog/.test(CARD), "the colour picker opens something over the board");
  assert.match(CARD, /pointer-events-none opacity-0 group-hover\/frame:pointer-events-auto/, "a control is invisible but still takes clicks");
});
