// 🔴 EVERY LIBRARY FUNCTION DRAWS SOMETHING (UX brief §38.3). This file is the guard.
//
// The owner's instruction was *"make sure that all library functions have UI decoration"*, and the
// defect underneath it was measured rather than described. At 1280x800, on the seeded preview that
// renders this exact component:
//
//                                       before   after
//     rows in the list                      62      62
//     row-action buttons at opacity 0       62       0     ← the actual defect
//     <svg> in the list region               0     125
//     rows with a leading glyph               2      62
//     distinct row-action labels              1      62
//
// **The functions were never missing. They were invisible.** Rename, move, pin and delete lived
// behind a control carrying `opacity-0` with `group-hover:opacity-100`, so the canvas manager read
// as a bare list of text — and on a touch screen, which has no hover, they had no affordance at
// all.
//
// 🔴 THIS IS A SOURCE-LEVEL GUARD AND IT KNOWS WHAT IT CANNOT SEE. There is no DOM harness in this
// package, so it cannot compute a rendered opacity. What it CAN do is refuse the two exact
// spellings that produced the defect — a hover-gated opacity on a row control, and a shared label —
// which is the shape someone reaches for when "tidying up" a list.
//
// The at-rest browser measurement above is the real check; it is recorded here so the number has a
// home, and re-run with:
//     [...list.querySelectorAll('button')].map(b => getComputedStyle(b).opacity)   // no "0"
//     list.querySelectorAll('svg').length                                          // > 0
// with no pointer over the list — a hover screenshot hides the very thing being fixed.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = readFileSync(join(import.meta.dirname, "canvas-manager.tsx"), "utf8");
/** 🔴 THE SAME LIST OF THE SAME OBJECTS LIVES ON THE FRONT DOOR, one surface earlier, and it had
 *  the identical defect. Fixing only the Library would have left the owner looking at the unfixed
 *  one first, so the guard covers both files rather than the one that was measured. */

/** 🔴 THE CODE, NOT THE PROSE. This file's own header explains why there is no source count by
 *  naming `canvas_sources`, so a guard reading the whole file would fail on the sentence that
 *  documents the rule it is enforcing. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** The `RowMenu` component only — the control the defect lived in. */
const rowMenu = source.slice(source.indexOf("function RowMenu"));

test("🔴 the row action control is drawn at rest, not only on hover", () => {
  const button = /<button\s+aria-label=\{`Actions for[\s\S]{0,600}?<\/button>/.exec(rowMenu);
  assert.ok(button, "expected the per-row action button");
  const markup = button[0];
  assert.ok(
    !/\bopacity-0\b/.test(markup),
    "the row action control must not start invisible — this is the measured defect (62/62 rows)",
  );
  assert.ok(
    !/group-hover:opacity/.test(markup),
    "hover cannot be the only thing that draws a control: a touch screen has no hover",
  );
  assert.ok(!/\bhidden\b|\binvisible\b/.test(markup), "and it must not be hidden by any other spelling");
  // It is still QUIET, which is the other half of §19 — the faintest text colour, no fill, no
  // border at rest. A guard that only checked visibility would be satisfied by a loud button.
  assert.match(markup, /text-\(--ui-text-quaternary\)/, "visible does not mean prominent (§19)");
  assert.ok(!/\bborder\b|\bring-1\b|bg-\(--ui-bg-elevated\)/.test(markup), "no border or fill at rest");
});

test("🔴 each row's actions are labelled for THAT row", () => {
  // "Canvas actions" was one label repeated once per row: unusable with a screen reader, and the
  // reason the owner's own probe could only report that "a button" existed.
  assert.ok(
    !/aria-label="Canvas actions"/.test(source),
    "a label shared by every row names none of them",
  );
  assert.match(rowMenu, /aria-label=\{`Actions for \$\{name\}`\}/);
});

test("every action in the row menu is drawn as well as named", () => {
  // §38.3 is "all library functions", and rename/pin/move/delete live in this menu.
  assert.match(rowMenu, /<action\.icon\b/, "each menu item renders its own glyph");
  // Every action literal supplies one. `icon` is required on `RowAction`, so this is really a
  // check that nobody widened the type back to optional.
  assert.match(source, /interface RowAction \{[\s\S]*?icon: LucideIcon;[\s\S]*?\}/);
  assert.ok(!/icon\?: LucideIcon/.test(source), "an optional icon is an action that can go undecorated");
});

test("the filter tabs, the sort and the folder control all carry an affordance", () => {
  // Filter tabs: a control with a selected state, not two words in the breadcrumb's grey.
  assert.match(source, /<ScopeTab active=\{scope === undefined\} icon=\{Layers\}/);
  assert.match(source, /<ScopeTab active=\{false\} icon=\{Inbox\}/);
  assert.match(source, /aria-pressed=\{active\}/, "the selected view must be announced, not only tinted");

  // Sort: a glyph on the left, and 🔴 DELIBERATELY NO SECOND CHEVRON — it is a native <select>, so
  // the browser already draws one on the right.
  const sort = source.slice(source.indexOf('aria-label="Sort canvases"') - 700, source.indexOf('aria-label="Sort canvases"') + 400);
  assert.match(sort, /<ArrowUpDown/);
  assert.ok(!/Chevron/.test(sort), "a native select draws its own arrow; a second one says menu twice");

  assert.match(source, /<FolderPlus/, "New folder keeps a glyph");
  assert.match(source, /<Search/, "the search field keeps its glyph");
});

test("a canvas row is distinguishable from a folder row at a glance, and says nothing it cannot know", () => {
  assert.match(source, /<FolderIcon className="shrink-0/, "folders are marked");
  assert.match(source, /<PanelsTopLeft className="shrink-0/, "and so are canvases — a row used to carry no glyph at all");
  // The learner's own pin survives; it is the one honest per-canvas distinction there is.
  assert.match(source, /canvas\.pinnedAt && <Pin\b/);

  // 🔴 AND NOTHING IS DERIVED FROM canvas_sources, WHICH IS EMPTY IN PRODUCTION. A count or a
  // preview would render "0 sources" on a canvas that has material attached — a confident false
  // claim about the learner's own work, which is worse than a sparse row.
  assert.ok(!/sources\.length|sourceCount|canvas_sources/.test(code), "no count over a table that has no rows");
});

test("decoration stayed inside §19 — no cards, no badges, no colour", () => {
  // The only colours on this surface predate §38.3 and both carry MEANING rather than decoration:
  // the destructive action, and the "that write did not land" notice. Nothing added for §38.3 may
  // introduce another.
  const colours = code.match(/\b(?:bg|text|border|ring)-(?:red|green|blue|amber|yellow|purple|pink|indigo|emerald|orange)-\d{3}\b/g) ?? [];
  const allowed = new Set(["text-red-500", "text-amber-600", "bg-amber-500"]);
  for (const colour of colours) {
    assert.ok(allowed.has(colour), `§19 forbids colour as decoration: found ${colour}`);
  }
  // Rows are rows. A card would be a rounded, elevated, shadowed container per item.
  assert.ok(!/rounded-2xl[^"]*shadow[^"]*"\s*key=\{(?:canvas|folder)/.test(source), "a list row must not become a card");
  assert.ok(!/\bgradient\b/.test(code), "no gradients (§28)");
});

// 🔴 THE FRONT DOOR HALF OF THIS FIX RETIRED WITH THE SURFACE IT GUARDED (owner 2026-08-14).
// There used to be a twin of the test below asserting that `canvas-home.tsx` drew its row control
// at rest, labelled each row individually, and gave every menu action an icon — because the same
// list was rendered on two surfaces and fixing one had left the other invisible on touch.
//
// The front door no longer lists canvases at all: the owner marked a screenshot green around the
// greeting and composer and red around the list. So the assertions below now cover the ONLY
// surface that enumerates a learner's canvases, which is this one, reached from `/library`.
//
// 🔴 COVERAGE DID NOT MOVE, IT NARROWED — and that is worth saying out loud, because a deleted
// test usually means a lost guarantee. `canvas-shell.test.ts` §46.5 now asserts the complement:
// that nothing on the front door enumerates canvases. Between them the pair still says where a
// list may exist and how it must behave when it does.

test("going back up out of a folder is a control, not a word", () => {
  // 🔴 THE LEAST VISIBLE FUNCTION ON THE SURFACE, and the one the top-level screenshots could not
  // show: it only renders inside a NESTED folder. It was a bare word in the breadcrumb's own grey
  // that changed colour on hover — nothing at all on a touch screen. Measured live at
  // All canvases / Fall 2026 / PHCY 2105: `aria-label="Back to Fall 2026"`, 92x28, opacity 1.
  const crumb = source.slice(source.indexOf("where am I"), source.indexOf("A REFUSED WRITE IS STATED"));
  const parent = /<button\s+aria-label=\{`Back to[\s\S]{0,900}?<\/button>/.exec(crumb);
  assert.ok(parent, "the go-up control must name the folder it returns to");
  assert.match(parent[0], /<FolderIcon/, "and draw a glyph rather than relying on a hover colour");
  assert.match(parent[0], /hover:bg-\(--ui-bg-tertiary\)/, "it uses the same hover fill as every other control here");
});
