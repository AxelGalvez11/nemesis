import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── the sidebar's three named groups, and the one that may never hide ────────────────────────
//
// Owner 2026-08-24: *"use the ChatGPT sidebar, how it organizes the chats and projects and
// folders so that we can do the same in the sidebar for nemesis."* Read off the reference the
// same day: three quiet grey labels — `Pinned`, `Projects`, `Chats` — each over its own rows.
//
// 🔴 THE ROWS WERE ALREADY IN THIS ORDER. What was missing was that anything SAID so. Pinned
// canvases, folders and loose canvases all shared one "Canvases" header, so the ordering was a
// rule that existed only in the code: nothing on screen told a learner the top rows were the
// pinned ones, and a folder sat in the same undifferentiated column as a canvas. These guards
// pin the grouping, and — more importantly — which groups are allowed to disappear.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SIDEBAR = strip(readFileSync(new URL("./sidebar-canvases.tsx", import.meta.url), "utf8"));
const PRIMITIVES = strip(readFileSync(new URL("./sidebar-primitives.tsx", import.meta.url), "utf8"));

/** Index of `needle`, asserting it exists rather than quietly returning -1 and comparing numbers. */
const at = (haystack: string, needle: string): number => {
  const index = haystack.indexOf(needle);
  assert.notEqual(index, -1, `\`${needle}\` is gone from the sidebar — this guard is pointed at nothing`);
  return index;
};

test("🔴 the list is three named groups, not one run of rows", () => {
  for (const label of ['label="Pinned"', 'label="Folders"', 'label="Canvases"']) {
    assert.ok(SIDEBAR.includes(label), `${label} is gone — the groups collapsed back into one list`);
  }
});

test("🔴🔴🔴 the Folders header is UNCONDITIONAL, because it carries the only way to make a folder", () => {
  // The failure this prevents is a dead end, not a cosmetic one. The "New folder" button lives in
  // this header and nowhere else. Hide the header until a folder exists and a learner with no
  // folders can never create the first one — and a learner who has filed every canvas away loses
  // the button too, because `unfiled` is empty and the Canvases group is gone as well.
  //
  // Calibration: wrap the header in `{rootFolders.length > 0 ? (` and this reddens, because the
  // conditional then opens BEFORE the label instead of after it.
  const header = at(SIDEBAR, 'label="Folders"');
  const list = at(SIDEBAR, "{rootFolders.length > 0 ? (");
  assert.ok(header < list, "the Folders header moved inside its own conditional — the New folder button can now be unreachable");

  const buttons = SIDEBAR.match(/action=\{newFolderButton\}/g) ?? [];
  assert.equal(buttons.length, 1, "the New folder action is no longer on exactly one header");
  const folderHeaderStart = SIDEBAR.lastIndexOf("<SidebarSectionHeader", header);
  assert.match(
    SIDEBAR.slice(folderHeaderStart, header),
    /action=\{newFolderButton\}/,
    "the New folder button left the Folders header",
  );
});

test("🔴 Pinned and Canvases ARE conditional — no heading over nothing", () => {
  // A header with no rows under it reads as a list that failed to load, which is a worse lie than
  // an absent section. Both of these open their conditional BEFORE their label; Folders does not.
  assert.ok(at(SIDEBAR, "{pinned.length > 0 ? (") < at(SIDEBAR, 'label="Pinned"'), "an empty Pinned header can now render");
  assert.ok(at(SIDEBAR, "{unfiled.length > 0 ? (") < at(SIDEBAR, 'label="Canvases"'), "an empty Canvases header can now render");
});

test("🔴 the groups keep the reference's order: pinned, then folders, then loose canvases", () => {
  const pinned = at(SIDEBAR, 'label="Pinned"');
  const folders = at(SIDEBAR, 'label="Folders"');
  const canvases = at(SIDEBAR, 'label="Canvases"');
  assert.ok(pinned < folders && folders < canvases, "the groups are out of order against the reference");
});

test("🔴 an account with nothing at all still gets one sentence, not three empty headings", () => {
  assert.match(SIDEBAR, /const isEmpty = canvases\.length === 0 && folders\.length === 0;/, "the all-empty case lost its own branch");
  assert.ok(SIDEBAR.includes("Your canvases will gather here."), "the empty state sentence is gone");
});

test("🔴 the section label is 14px — the size measured off the reference, not a size below it", () => {
  // It was --canvas-text-meta (12px), a step smaller than every row beneath it, which read as
  // fine print rather than as a quiet heading. The reference sets the label at the SAME size as
  // its rows and holds it back with colour and weight alone, so both must survive together:
  // 14px in the tertiary grey is a heading, 14px at full strength competes with the titles.
  // Anchored on the next declaration, not on the comment that introduces it — `strip()` deletes
  // comments before any of these guards run, so a comment anchor always slices from nothing.
  const label = PRIMITIVES.slice(at(PRIMITIVES, "export function SidebarPanelLabel"), at(PRIMITIVES, "export const countLabel"));
  assert.match(label, /text-\[length:var\(--canvas-text-small\)\]/, "the section label left the measured size");
  assert.match(label, /text-\(--ui-text-tertiary\)/, "the label lost the grey that keeps 14px from competing with the row titles");
  assert.ok(!/uppercase|tracking-/.test(label), "the label went back to shouting");
});
