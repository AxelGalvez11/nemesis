// One side panel, many tabs: a document, a made file, a deck, a check and a mind map are items of
// the same dock, drawn under the same strip at the same width.
//
// Owner, 2026-09-03, with a screenshot: *"why are we still using the old side panel... I thought
// we're supposed to have one side panel that's supposed to render anything, it's supposed to have
// multiple tab views"*, and *"it still has the sidebar icon in the wrong side for the right side
// panel."* Before this, a deck, a check and a mind map each had a `StudyPanel` of their own: a
// fourth fixed rectangle at its own width, stacked over the reader.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const DOCK = read("./document-dock.tsx");
const TABS = read("./dock-tabs.tsx");
const PANEL = read("./study-panel.tsx");
const CANVAS = read("./learning-canvas.tsx");
const CONTROLS = read("./canvas-controls.tsx");
const HEADER = read("./canvas-header.tsx");
const DECK = readFileSync(new URL("../study/deck-review.tsx", import.meta.url), "utf8");

test("🔴🔴 a deck, a check and a mind map are items of the one dock", () => {
  assert.match(DOCK, /readonly kind: "mindmap"; readonly root: MindmapNode; readonly title: string \}/);
  assert.match(DOCK, /readonly kind: "deck"; readonly deckId: string; readonly title: string \}/);
  assert.match(DOCK, /readonly kind: "check"; readonly title: string \}/);
  for (const opener of ["openMindmap", "openDeck", "openCheck"]) {
    assert.match(DOCK, new RegExp(`const ${opener} = useCallback\\(`), `${opener} is not a door of the dock`);
    assert.match(DOCK, new RegExp(`\\b${opener},\\n`), `${opener} is not returned by the dock`);
  }
  // Every kind wears a glyph in the strip, or a tab renders as a blank.
  for (const kind of ["document", "output", "deck", "check", "mindmap"]) {
    assert.match(TABS, new RegExp(`case "${kind}":`), `${kind} has no face in the tab strip`);
  }
});

test("🔴🔴 the study panel is a body of the pane: it draws the same strip and opens at the reader's width", () => {
  assert.match(PANEL, /<DockTabs activeKey=\{activeKey\} items=\{items\} onClose=\{onCloseKey\} onSelect=\{onSelectKey\} \/>/, "the study panel does not draw the dock's tabs");
  assert.match(PANEL, /useDockWidth\(widthSlot\)/, "the study panel cannot take the reader's width");
  assert.match(DECK, /widthSlot=\{widthSlot\}/, "the deck review does not pass the width slot through");
  assert.match(DECK, /items=\{items\}/, "the deck review does not pass the tabs through");
});

test("🔴🔴 the canvas mounts each study body from the item in front, never from a flag of its own", () => {
  assert.match(CANVAS, /\{dock\.active\?\.kind === "deck" && \(\s*<DeckReview/, "the deck is not drawn from the dock");
  assert.match(CANVAS, /\{dock\.active\?\.kind === "mindmap" && \(\s*<StudyPanel/, "the mind map is not drawn from the dock");
  assert.match(CANVAS, /const checkOpen = dock\.active\?\.kind === "check";/, "the check keeps an open flag of its own");
  assert.match(CANVAS, /dock\.openCheck\("Check"\)/, "the check never becomes a tab");
  for (const gone of ["setReviewingDeck(", "setOpenMindmap(", "setOpenArtifact(", "setCheckOpen("]) {
    assert.ok(!CANVAS.includes(gone), `${gone} is back: a panel of its own again`);
  }
  // Each study body wears the strip and the reader's width.
  const bodies = CANVAS.slice(CANVAS.indexOf('{dock.active?.kind === "deck" && ('), CANVAS.indexOf("<CanvasCheck"));
  assert.equal((bodies.match(/widthSlot="reader"/g) ?? []).length, 3, "a study body opens at a width of its own");
  assert.equal((bodies.match(/items=\{dock\.items\}/g) ?? []).length, 3, "a study body is missing the strip");
});

test("🔴🔴 a map the answer drew opens itself in the pane, once per answer", () => {
  assert.match(CANVAS, /const openedMapFor = useRef<string \| null>\(null\);/);
  assert.match(CANVAS, /const parsed = parseMermaidMindmap\(match\[1\] \?\? ""\);\s*if \(!parsed\) continue;[\s\S]{0,400}?const root = withoutCitationMarks\(parsed\);\s*openedMapFor\.current = replyText;\s*dock\.openMindmap\(root, root\.label\);/, "a drawn map no longer opens itself");
  // The inline door and the outputs shelf go through the same dock.
  assert.match(CANVAS, /open: \(root: MindmapNode\) => dock\.openMindmap\(root, root\.label\)/);
  assert.match(CONTROLS, /onReviewDeck=\{dock\.openDeck\}/, "the outputs shelf opens a deck outside the dock");
  assert.ok(!/<DeckReview/.test(CONTROLS), "the sources control mounts a deck panel of its own again");
});

test("🔴 the door to the pane stands on the pane's own edge, once", () => {
  // #1121 moved it there the same evening, from the same screenshot; this only holds the line.
  assert.equal((HEADER.match(/<ReaderToggle sources=\{canvas\.sources\} \/>/g) ?? []).length, 1, "the pane's door is drawn twice or not at all");
  assert.ok(HEADER.indexOf("<ReaderToggle sources") > HEADER.indexOf("<CourseMapControl"), "the pane's door is back before the right-hand cluster");
});

test("🔴🔴 a turn the door took takes the previous answer off the screen", () => {
  assert.match(CANVAS, /if \(!decision && made\) session\.dismissAside\(\);/, "the old answer stays under a door-made ask");
});
