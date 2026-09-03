import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Opening a document beside the conversation moves four things at once: the reading panel slides
// in, the canvas narrows to make room, the nav column collapses to the rail, and the rail and the
// sidebar cross-fade. Owner, 2026-09-01: *"make sure the in chat right sidebar for viewing things
// opens smoothly and that there is no lagg in sizing adjustment for chat and sidebar."*
//
// Two separate faults were behind that, and neither was slowness.

/** Source with comments stripped, so prose ABOUT a rule is never mistaken for the rule. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const read = (path: string) => code(readFileSync(new URL(path, import.meta.url), "utf8"));

const CSS = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
const SURFACE = read("../learn/canvas-surface.tsx");
const PANEL = read("../../workspace/shell/side-panel.tsx");
// 🔴 FOUR, AND THE FOURTH IS THE ONE THAT WAS MISSING (owner 2026-09-03: "i noticed you created a
// new sidebar panel? what happened to the ones we already had? we need the sidebar like in
// chatgpt"). `source-tab-viewer` — the pane a citation opens — docked itself: a hardcoded 360px, no
// drag, its own scrim, and an inset computed by hand in `learning-canvas.tsx`. So three panels
// pushed the conversation on the shared clock and a fourth covered it at a third of their width,
// which is why opening a document from a citation did not feel like the same product. Adding it to
// this list is what stops that happening again: every rule below now applies to it too.
const PANES = [
  "../learn/output-preview.tsx",
  "../learn/source-preview.tsx",
  "../learn/study-panel.tsx",
  "../learn/source-tab-viewer.tsx",
] as const;

test("🔴🔴 every pane that moves reads ONE clock", () => {
  // They ran on 220ms cubic-bezier(0.16,1,0.3,1), 200ms ease-out and 240ms cubic-bezier(0.22,1,
  // 0.36,1). Three durations and three curves fired by one press, so the last edge settled 40ms
  // after the first and each arrived on a different curve. Nothing was slow; nothing landed
  // together, which is what reads as lag.
  assert.match(CSS, /--pane-slide: 220ms cubic-bezier\(0\.22, 1, 0\.36, 1\);/, "the shared clock is gone or has drifted");
  assert.match(CSS, /\[data-pane-shell\]\[data-pane-shell-animate="true"\][\s\S]{0,120}transition: grid-template-columns var\(--pane-slide\);/,
    "the nav column went back to its own duration");
  assert.match(CSS, /\.reader-dock-in \{\s*animation: reader-dock-in var\(--pane-slide\);/, "the panel's entrance went back to its own duration");
  assert.match(SURFACE, /"width var\(--pane-slide\)"/, "the canvas push went back to its own duration");
  // 🔴 ASSERTED AS AN ABSENCE TOO. "They all read the token" passes just as well with a fourth
  // hardcoded duration sitting beside them, and that fourth one is how this drifts back.
  assert.ok(!/width 200ms|200ms ease-out/.test(SURFACE), "a literal duration came back to the canvas push");
  assert.ok(!/reader-dock-in \d+ms|grid-template-columns \d+ms/.test(CSS), "a literal duration came back to the stylesheet");
});

test("🔴🔴🔴 the canvas FOLLOWS a drag instead of easing after it", () => {
  // The canvas carries a `width` transition so an opening panel reads as an arrival. That same
  // transition applied to every intermediate width a drag produces, so the panel's edge tracked the
  // pointer exactly while the conversation's edge eased toward it 220ms behind — two sides of one
  // seam, visibly apart for as long as the button was held.
  //
  // Measured on /dev-preview/learn, 2026-09-01, with the old rule forced back on: through a
  // three-step drag the conversation's right edge sat 400px, 250px and 100px INSIDE the panel.
  // With the fix the seam measured 0 at every sample, and the surface's own transition-duration
  // read 0s during the drag and 0.22s again on release.
  assert.match(SURFACE, /const draggingPanel = useSidePanelLive\(\);/, "the surface no longer knows a drag is happening");
  assert.match(SURFACE, /transition: draggingPanel \? "none" : "width var\(--pane-slide\)"/, "the surface eases through a drag again");
  assert.match(PANEL, /export function useSidePanelLive\(\): boolean/, "the drag is no longer published");
  assert.match(PANEL, /claim\(id: string, inset: number, live: boolean\)/, "a claim stopped carrying whether it is moving");
  for (const pane of PANES) {
    const source = read(pane);
    assert.match(source, /useDeclareSidePanel\([^)]*, dragging\)/, `${pane}: this panel never says it is being dragged`);
  }
});

test("🔴🔴🔴 a zero inset is NOT a docked panel — this is what locked the sidebar shut", () => {
  // Owner, 2026-09-01: *"the left sidebar does not open in chat sessions please fix."*
  // `canvas-controls.tsx` mounts `<SourcePreview>` unconditionally, and it calls the hook BEFORE
  // its own `if (!active) return null` — the only shape a hook can take. Closed, it passed 0.
  // `ids.size > 0` counted that as a docked panel, so `sidebarVisible` was false from the moment a
  // canvas rendered and the rail's "Expand sidebar" button did nothing at all, for ever.
  //
  // Every call site already meant this: all three are `<condition> ? width : 0`. The hook was the
  // one place reading 0 as "docked, pushing nothing".
  assert.match(PANEL, /if \(inset <= 0\) \{\s*actions\.release\(id\);/, "a closed panel registers itself as docked again");
  for (const pane of PANES) {
    assert.match(read(pane), /useDeclareSidePanel\([^)]*\?[^)]*: 0,/, `${pane}: 0 is no longer this panel's way of saying it is closed`);
  }
  // Verified on /dev-preview/learn: with a canvas running and nothing docked, the shell reported
  // panel:false, and pressing Expand opened the 260px sidebar beside the conversation.
});

test("🔴🔴 a canvas COLLAPSES the sidebar; it does not lock it shut", () => {
  const SHELL = read("./workspace-shell.tsx");
  // The second half of the same report. Even with the phantom claim gone, `sidebarVisible` read
  // `… && !canvasRunning`, so the press still could not win. The collapse is the DEFAULT on
  // arrival (owner 2026-08-31, the §38.1 reversal); an explicit press now beats it.
  assert.match(SHELL, /const \[reopenedOverCanvas, setReopenedOverCanvas\] = useState\(false\);/, "the override is gone");
  assert.match(SHELL, /canvasRunning: canvasRunning && !reopenedOverCanvas,/, "the canvas outranks the learner again");
  // 🔴 TRANSIENT, LIKE THE CLAIM IT OVERRIDES — cleared on leaving, so the next conversation opens
  // quiet again and the standing rule is unchanged.
  assert.match(SHELL, /if \(!canvasRunning\) setReopenedOverCanvas\(false\);/, "the override outlives the canvas it was for");
  // 🔴 AND IT IS THE ONLY WAY IN. Three controls reach the sidebar (the rail, the floating toggle,
  // the narrow-viewport scrim); one of them still calling `setSidebarOpen` raw is a door that
  // rewrites the stored preference and paints nothing, which is the bug this test is named for.
  assert.ok(!/onExpand=\{\(\) => setSidebarOpen\(true\)\}/.test(SHELL), "the rail bypasses the override again");
  assert.ok(!/onToggleSidebar=\{\(\) => setSidebarOpen\(true\)\}/.test(SHELL), "the floating toggle bypasses the override again");
});

console.log("panes-share-one-clock.test.ts OK");
