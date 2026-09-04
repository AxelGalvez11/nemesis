// 🔴 THE OWNER NAMED THE BASELINE OUT LOUD, so it gets a guard rather than a good intention.
// 2026-09-03: *"for the library in the folder button, I need you to actually compare that to
// ChatGPT. Because ChatGPT is the baseline… Making a new folder in the library should work exactly
// like it does in ChatGPT."*
//
// Every number below was read off chatgpt.com/library the same day with
// `getBoundingClientRect`/`getComputedStyle` at a 1470px viewport, and is written down in
// `docs/chatgpt-reference.md`. This file refuses the two ways they go quietly wrong: a value edited
// in the component without the doc, and the inline naming row coming back.
//
// 🔴 IT CHECKS SPELLINGS, NOT PIXELS, AND SAYS SO. There is no DOM harness in this package. The
// rendered check is a real one and was run — headless Chromium against
// `/dev-preview/library/outputs`, which mounts the shipped component:
//
//     dialog 448 x 190 radius 16px · insets 16 left / 12 top · field 416 x 38 · gaps 16 / 8 / 16
//     Cancel 71 x 36 · Create 36 tall and disabled on an empty box · no close ✕ · autofocused
//
// re-run with:
//     node .scratch/folder-dialog.mjs      (see the PR that added this file)
//
// 🔴 AND THE INSETS ARE 15/11/15 ON PURPOSE. Our dialogs carry a 1px border the reference's does
// not, and the box is border-box, so 16 would put the content 17px in and the panel 192 tall.
// Anyone "correcting" these to round numbers is reintroducing the 2px the owner asked us to stop
// shipping. Test 4 holds them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const here = join(process.cwd(), "components/workspace/library");
const DIALOG = readFileSync(join(here, "folder-create-dialog.tsx"), "utf8");
const PAGE = readFileSync(join(here, "library-outputs.tsx"), "utf8");
/** Comments quote the very strings these tests look for, and a guard that matches its own prose is
 *  this repo's most repeated self-inflicted failure. Strip them first, every time. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the dialog is the reference's box: 448 wide, radius 16, no close cross", () => {
  const source = code(DIALOG);
  assert.match(source, /max-w-\[448px\]/, "448px wide, measured");
  assert.match(source, /rounded-\[16px\]/, "radius 16 — `rounded-xl` renders 18px at this root size");
  assert.match(source, /showCloseButton=\{false\}/, "the reference has no ✕; Cancel is the way out");
});

test("the field is the reference's field: pill, 38 tall, autofocused, no placeholder", () => {
  const source = code(DIALOG);
  assert.match(source, /h-\[38px\][^"]*rounded-full/, "416 x 38 and fully rounded");
  assert.match(source, /autoFocus/, "the reference opens with the caret in the box");
  assert.doesNotMatch(
    source,
    /placeholder=/,
    "the reference leaves it empty — everybody knows what a folder is, and example text is where a subject sneaks into a field-agnostic product",
  );
});

test("Create refuses an empty name, and Cancel is the other button", () => {
  const source = code(DIALOG);
  assert.match(source, /disabled=\{busy \|\| name\.trim\(\)\.length === 0\}/, "disabled until there is a name");
  assert.match(source, /Cancel/, "the reference's second button");
  assert.match(source, /gap-\[12px\]/, "12px between them, measured");
});

test("the insets pay for our 1px border, or the panel is 192 tall against a measured 190", () => {
  assert.match(code(DIALOG), /px-\[15px\] pb-\[15px\] pt-\[11px\]/, "15/11/15, not 16/12/16 — see the file's own note");
});

test("the Library names a folder in that dialog and nowhere else", () => {
  const source = code(PAGE);
  assert.match(source, /<FolderCreateDialog/, "the page mounts it");
  assert.match(source, /onClick=\{\(\) => setCreating\(true\)\}/, "the New folder button opens it");
  // 🔴🔴 THE ROW THIS REPLACED COMMITTED ON BLUR, so clicking anywhere else made a folder. It also
  // only existed in the list, which silently forced the page out of grid view while it was open.
  assert.doesNotMatch(source, /onBlur=\{[^}]*addFolder/, "no commit-on-click-away");
  assert.doesNotMatch(source, /Name the new folder/, "the inline naming input is gone");
  assert.doesNotMatch(source, /view === "grid" && naming/, "opening the dialog must not change the view");
});
