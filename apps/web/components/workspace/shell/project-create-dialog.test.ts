import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Making a project is one dialog, and nothing is written until it is confirmed.
//
// 🔴🔴 THE OWNER CAUGHT THIS BY COMPARING, NOT BY HITTING A BUG. 2026-09-03: *"I thought after you
// click choose a project or create a new project, the pop-up was different, could you check with
// ChatGPT?"* He was right. Measured in his own Chrome the same day, on chatgpt.com's Work
// composer: pressing "New project" CLOSES the project menu and opens a centred modal — 512 x 264,
// radius 16, on a half-opacity scrim — with a "Project name" label, an example name in the field,
// an icon button inside the field's 36px left inset, a sentence explaining what a project is, and a
// primary button disabled until the field has something in it.
//
// Nemesis had TWO doors and neither was that:
//
//   1. The composer's picker turned its "New project" row INTO a bare text input inside the open
//      menu — no label, no example, no icon, no explanation.
//   2. The sidebar INSERTED a folder literally named "New project" and then opened an inline
//      rename. Press Escape and a project called "New project" is in the sidebar for good.
//
// The second is the one that leaves damage, and it is guarded hardest below.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DIALOG = strip(read("./project-create-dialog.tsx"));
const SIDEBAR = strip(read("./sidebar-canvases.tsx"));
const PICKER = strip(read("../learn/project-picker.tsx"));

test("🔴🔴 no project row exists until the learner confirms one", () => {
  // Calibration: put `createFolder(userId, "New project", null)` back into `newFolder` and this
  // reddens. The name is the tell — a literal placeholder name passed to an INSERT means the row
  // is created before anyone has said what it is called.
  assert.ok(
    !/createFolder\([^)]*["']New project["']/.test(SIDEBAR),
    "the sidebar is inserting a placeholder project again, which survives a cancelled rename",
  );
  // And the create call it does make is fed a name from the dialog, not a constant.
  assert.match(SIDEBAR, /const newFolder = async \(name: string, icon: string \| null\)/, "the sidebar's create no longer takes a name");
});

test("both doors open the SAME dialog", () => {
  // Two doors to one action that look nothing alike is exactly what the owner flagged. One
  // component is what stops them drifting apart again.
  assert.match(SIDEBAR, /<ProjectCreateDialog[\s\S]{0,160}open=\{creatingProject\}/, "the sidebar stopped mounting the create dialog");
  assert.match(PICKER, /<ProjectCreateDialog[\s\S]{0,160}open=\{naming\}/, "the composer's picker stopped mounting the create dialog");
  // 🔴 EVERY door in the sidebar, not just the menu row: the section's `+` button reaches the same
  // state. It called `newFolder()` directly and was the second copy of the old behaviour.
  assert.ok(!/void newFolder\(\)/.test(SIDEBAR), "a sidebar control still creates a project without asking for a name");
});

test("🪦 the picker's row is a door, not a text field in a dropdown", () => {
  assert.ok(!/placeholder="Project name"/.test(PICKER), "the naming input is back inside the dropdown menu");
  assert.match(PICKER, /onClick=\{\(\) => \{ setOpen\(false\); setNaming\(true\); \}\}/, "pressing New project no longer closes the menu and opens the dialog");
});

test("the dialog matches what was measured on the reference", () => {
  // 🔴 EXPLICIT PIXELS. One rem is 18px in this app, so every rem-named utility renders 12.5%
  // larger than its name — the trap docs/chatgpt-reference.md records four pages falling into.
  assert.match(DIALOG, /max-w-\[512px\]/, "the panel is no longer the reference's measured width");
  // The icon sits INSIDE the field's left inset, which is what the 36px of padding is for.
  assert.match(DIALOG, /pl-\[36px\]/, "the name field lost the inset its icon button sits in");
  assert.match(DIALOG, /placeholder="[^"]+"/, "the field lost its example name");
  assert.ok(!/placeholder="Project name"/.test(DIALOG), "the placeholder repeats the label instead of showing an example");
  // Disabled until named — the reference's own rule, and the one that stops empty projects.
  assert.match(DIALOG, /disabled=\{busy \|\| name\.trim\(\)\.length === 0\}/, "the create button no longer waits for a name");
});

test("🔴 the menu's dismiss handlers do not reach into the dialog", () => {
  // The dialog is a portal, so it is NOT inside the picker's `wrap` ref. A pointerdown handler that
  // treats "outside wrap" as "close everything" would close the dialog the instant anyone touched
  // the name field — and it would look like the field rejecting focus.
  const away = PICKER.slice(PICKER.indexOf("const away ="), PICKER.indexOf("document.addEventListener"));
  assert.ok(!/setNaming\(false\)/.test(away), "the menu's outside-click handler closes the dialog too");
});

test("a project is created with its glyph in ONE write", () => {
  const store = strip(read("../../../lib/learn/canvas-store.ts"));
  const body = store.slice(store.indexOf("export async function createFolder"), store.indexOf("export async function loadCanvas"));
  // Creating and then customizing is two round trips and two chances to half-succeed: a project
  // that exists wearing the wrong glyph, with no way to tell whether that is what was picked.
  assert.match(body, /\.\.\.\(icon \? \{ icon \} : \{\}\)/, "the chosen glyph is no longer part of the insert");
  assert.ok(!/customizeFolder/.test(body), "creating a project makes a second write to set its icon");
});
