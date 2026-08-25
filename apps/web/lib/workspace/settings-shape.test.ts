import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// ── the shape of the settings panel, and the honesty of its search box ───────────────────────
//
// Owner 2026-08-24: *"look at the ChatGPT settings, uh, so that you can implement that to
// Nemesis as well. The spacing, the color, and etcetera."* Measured off the live reference the
// same day: modal 680×600 at radius 16; a setting is one 52px row (8px pad, 36px control, 8px
// pad) under a 1px `rgba(0,0,0,0.05)` hairline; label 14px/400, description 12px/16 in grey; a
// chooser is a bare 36px button with a transparent border and no fill.
//
// 🔴 THE PALETTE WAS NEVER THE PROBLEM AND MUST NOT BE "FIXED" WITH LITERALS. `--ui-stroke-tertiary`
// already resolves to 5% of the base colour — the reference's exact divider — and the active-row
// wash already matches too. What diverged was structure and type scale. A literal `rgba(0,0,0,.05)`
// copied from the reference would look right in light mode and vanish in dark, so these guards
// pin the tokens rather than the colours they happen to produce today.

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SURFACE = strip(readFileSync(new URL("../../components/SettingsSurface.tsx", import.meta.url), "utf8"));
const MODAL = strip(readFileSync(new URL("../../components/workspace/shell/settings-modal.tsx", import.meta.url), "utf8"));

/** A named function's body, asserting the function exists rather than slicing from -1. */
const bodyOf = (name: string): string => {
  const start = SURFACE.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone — this guard is pointed at nothing`);
  const next = SURFACE.indexOf("\nfunction ", start + 1);
  return SURFACE.slice(start, next === -1 ? undefined : next);
};

test("🔴🔴 a settings group draws NO box — the hairline is the only separator", () => {
  // Every group used to be a `rounded-2xl` panel with a border AND a shadow, stacked with gaps,
  // so a page of six preferences drew six boxes around twelve words. Calibration: put
  // `rounded-2xl border` back on SettingsCard and this reddens.
  const card = bodyOf("SettingsCard");
  assert.ok(!/rounded-2xl|shadow-sm|border border-/.test(card), "the settings cards grew their chrome back");
  const row = bodyOf("SettingsRow");
  assert.match(row, /border-b border-\(--ui-stroke-tertiary\)/, "the row lost the hairline that replaced the boxes");
});

test("🔴🔴 the last row on the PAGE drops its hairline, and the rule lives where it can be seen", () => {
  // Scoping this to `last:` inside a group put a gap in the middle of the list wherever two
  // groups met — the rule is "no line under the final row of the page", and only the page knows
  // which row that is. Calibration: move `last:border-b-0` back onto SettingsRow and the seam
  // returns between every pair of groups.
  assert.match(bodyOf("SettingsPage"), /\[&>section:last-of-type>\*:last-child\]:border-b-0/, "the trailing hairline rule left the page");
  assert.ok(!/last:border-b-0/.test(bodyOf("SettingsRow")), "the per-group rule came back and will cut the list at every group boundary");
});

test("🔴 the row is the reference's box: label 14px, description 12px, control 36px", () => {
  const row = bodyOf("SettingsRow");
  assert.match(row, /text-\[length:var\(--canvas-text-small\)\] text-foreground/, "the label left 14px regular");
  assert.match(row, /text-\[length:var\(--canvas-text-meta\)\] leading-4/, "the description left 12px/16");
  assert.match(SURFACE, /const SELECT_CLASS = "h-\[var\(--nav-row-height\)\]/, "the chooser left the shared 36px row height");
  assert.match(SURFACE, /const INPUT_CLASS = "h-\[var\(--nav-row-height\)\]/, "the text field left the shared 36px row height");
});

test("🔴🔴 the chooser goes bare, the text field keeps its edge — and that is why they are two classes", () => {
  // One class dressed both. Taking the border off to match the reference would have left
  // Pet/Nickname/Occupation as invisible boxes: a picker announces itself with a chevron and a
  // value, an empty text field has nothing to announce itself with.
  const select = SURFACE.slice(SURFACE.indexOf("const SELECT_CLASS"), SURFACE.indexOf("const INPUT_CLASS"));
  const input = SURFACE.slice(SURFACE.indexOf("const INPUT_CLASS"), SURFACE.indexOf("const SCROLL_RAIL"));
  assert.match(select, /border-transparent bg-transparent/, "the chooser grew a box again");
  assert.match(input, /border-\(--ui-stroke-secondary\)/, "the text fields lost the edge that shows where to type");

  // …and the three text fields actually use the bordered class, which is the half that would
  // fail silently: they would still render, just with no visible box.
  for (const field of ["pet: event.target.value", "nickname: event.target.value", "occupation: event.target.value"]) {
    const index = SURFACE.indexOf(field);
    assert.notEqual(index, -1, `the ${field.split(":")[0]} field is gone`);
    const tag = SURFACE.slice(SURFACE.lastIndexOf("<input", index), index);
    assert.match(tag, /className=\{INPUT_CLASS\}/, `the ${field.split(":")[0]} field went borderless and is now an invisible box`);
  }
});

test("🔴🔴🔴 every section carries keywords, so the search cannot silently miss what it stands on", () => {
  // 🔴 THE FORCING FUNCTION. A box matching only the eleven LABELS answers "accent colour" with
  // nothing, because that control lives inside Appearance and the word appears in no section
  // name — and a learner reads an empty result as "Nemesis does not have that setting". Adding a
  // section without keywords must fail here rather than ship a search with a hole in it.
  const list = SURFACE.slice(SURFACE.indexOf("const SECTIONS"), SURFACE.indexOf("const THEME_OPTIONS"));
  const ids = list.match(/\{ id: "/g) ?? [];
  const keyworded = list.match(/keywords: "/g) ?? [];
  assert.ok(ids.length >= 11, `only ${ids.length} sections found — the list moved or changed shape`);
  assert.equal(
    keyworded.length,
    ids.length,
    "a settings section was added with no `keywords`. The rail's search matches label + keywords, so " +
      "that section is reachable only by someone who already knows its name — list the words for the " +
      "controls INSIDE it, in components/SettingsSurface.tsx.",
  );
});

test("🔴 the search matches label AND keywords, case-insensitively, and says so when it finds nothing", () => {
  assert.match(SURFACE, /`\$\{item\.label\} \$\{item\.keywords\}`\.toLowerCase\(\)\.includes\(needle\)/, "the search stopped reading the keywords");
  assert.match(SURFACE, /const needle = query\.trim\(\)\.toLowerCase\(\);/, "the needle is no longer trimmed and lowered, so ' Accent' misses");
  assert.match(SURFACE, /matchedSections\.length === 0 &&/, "an empty result now renders as a blank rail instead of saying nothing matched");
});

test("🔴 the modal is the reference's shape, not a laptop screen holding eleven rows", () => {
  // It was 64rem × 48rem — 1024×768 — so every page opened mostly empty with the controls a
  // hand's width from their labels.
  assert.match(MODAL, /w-\[min\(48rem,calc\(100vw-2rem\)\)\]/, "the settings modal went wide again");
  assert.match(MODAL, /h-\[min\(86dvh,40rem\)\]/, "the settings modal went tall again");
});

test("🔴 no colour is hardcoded to match the reference — dark mode depends on it", () => {
  // Copying `rgba(0,0,0,0.05)` out of the reference looks right in light mode and disappears
  // against a black page. Every surface colour here goes through a token that already resolves
  // to the reference's value in light and to something legible in dark.
  const literals = SURFACE.match(/rgba?\([\d\s.,]+\)|#[0-9a-fA-F]{6}\b/g) ?? [];
  const allowed = new Set(["#000000", "#212121"]); // the two dark-tone swatches, which ARE the colour they name
  const stray = literals.filter((value) => !allowed.has(value));
  assert.deepEqual(stray, [], "a raw colour reached the settings surface — use a --ui-* token so dark mode follows");
});

test("🔴🔴🔴 settings open as a POPUP — nothing inside the workspace navigates to /settings", () => {
  // 🔴 OWNER, 2026-08-24, on production: settings are *"supposed to be a pop up, not supposed to
  // be a replaced chat or the Canvas page."*
  //
  // The offender was the memory notice added five days earlier, which used `<a href="/settings">`.
  // That is a full page load, and it fired at the WORST possible moment: the notice appears while
  // a lesson is running, so a learner who wanted a glance at what had just been remembered lost
  // the canvas they were mid-way through and had to navigate back to it. Every other door into
  // settings in the shell already called `openSettings`; this was the single exception, and one
  // exception is all it takes for the feature to read as "settings replace the page".
  //
  // 🔴 THE ROUTE ITSELF STAYS. This codebase's standing practice for retiring a surface is "the
  // rows are removed, the pages are not" — a bookmark or a payment-provider return URL may still
  // land on /settings, and deleting a route is a much larger blast radius than removing its doors.
  // What must not exist is anything INSIDE the workspace that sends a learner there.
  //
  // Calibration: put the anchor back and this reddens.
  const surfaces = ["../../components/workspace/learn/learning-canvas.tsx", "../../components/workspace/shell/chat-sidebar.tsx", "../../components/workspace/shell/nav-rail.tsx"];
  for (const file of surfaces) {
    const source = strip(readFileSync(new URL(file, import.meta.url), "utf8"));
    assert.ok(!/href=["']\/settings/.test(source), `${file} navigates to /settings instead of opening the popup`);
    assert.ok(!/push\(["']\/settings|replace\(["']\/settings/.test(source), `${file} routes to /settings instead of opening the popup`);
  }
  const canvas = strip(readFileSync(new URL("../../components/workspace/learn/learning-canvas.tsx", import.meta.url), "utf8"));
  assert.match(canvas, /openSettings\("memory"\)/, "the memory notice stopped opening the popup at the Memory section");
  assert.match(canvas, /useSettingsModal\(\)/, "the canvas lost the hook that opens the popup");
});
