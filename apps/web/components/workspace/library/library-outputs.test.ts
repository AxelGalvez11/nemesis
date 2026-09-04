import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { foldersWithContent, shelfFolders } from "./library-outputs";
import type { Folder } from "@/lib/learn/canvas-store";

// 🔴🔴 THE OWNER'S REPORT, VERBATIM: *"I created a new… project, but it's showed up in the
// library, and that's not where it should go."* `foldersWithContent` is the fix — a folder shows
// on the Library's own "Folders" shelf only if it, or something nested inside it, actually holds
// an output — and this file exercises it directly rather than through a rendered page, the same
// way `projects-model.test.ts`-shaped coverage exercises `buildProjects` directly.
//
// The strip/regex tests below the behavioural ones guard the OTHER half: that the component still
// calls this function at the one call site that decides what the "Folders" section draws, so a
// future edit cannot quietly go back to `folders.map` and pass every test in this file while
// failing the only thing that made the fix real.

function folder(id: string, over: Partial<Folder> = {}): Folder {
  return { createdAt: "2020-01-01T00:00:00.000Z", id, name: id, parentId: null, ...over };
}

function counts(pairs: readonly (readonly [string, number])[]): ReadonlyMap<string, number> {
  return new Map(pairs);
}


test("🔴🔴 a folder made on the Library shows there while empty; one made elsewhere still does not", () => {
  // Owner, 2026-09-04: *"making a folder in library doesnt work like in chatgpt, fix it."* Driven
  // on chatgpt.com/library the same day: an empty folder he had made minutes earlier ("test3") sits
  // at the TOP of their list with a Size of "—". Ours did not appear at all — the New folder button
  // arrived on this page on 2026-09-03 and landed straight on the emptiness filter added for a
  // completely different report.
  //
  // 🔴 AND THAT OTHER REPORT STILL HOLDS, which is the whole reason this is two clauses rather than
  // a deletion: *"I created a new project, but it's showed up in the library, and that's not where
  // it should go."*
  const made = { createdAt: "2026-09-04T00:00:00.000Z", id: "made-here", madeIn: "library" as const, name: "Week 5 reading", parentId: null };
  const project = { createdAt: "2026-09-04T00:00:00.000Z", id: "a-project", name: "Second year", parentId: null };
  const filled = { createdAt: "2026-08-01T00:00:00.000Z", id: "has-work", name: "Thermodynamics", parentId: null };
  const withContent = new Set(["has-work"]);

  const shown = shelfFolders([made, project, filled], withContent).map((folder) => folder.id);
  assert.deepEqual(shown, ["made-here", "has-work"], "an empty project leaked onto the shelf, or the folder just made is still invisible");

  // Calibration, both ways: drop the marker and the new folder vanishes again; add content to the
  // project and it earns its place the way it always could.
  assert.deepEqual(
    shelfFolders([{ ...made, madeIn: null }], withContent).map((f) => f.id),
    [],
    "the marker stopped being what makes an empty folder visible",
  );
  assert.deepEqual(
    shelfFolders([project], new Set(["a-project"])).map((f) => f.id),
    ["a-project"],
    "a project that holds work is being hidden",
  );
});

test("🔴🔴🔴 a brand-new, empty project holds nothing directly and shows nowhere — the reported bug", () => {
  const result = foldersWithContent([folder("new-project")], counts([]));
  assert.equal(result.size, 0, "an empty project was marked as holding content");
});

test("a folder with a direct output shows", () => {
  const result = foldersWithContent([folder("torts")], counts([["torts", 2]]));
  assert.deepEqual([...result], ["torts"]);
});

test("🔴🔴 a PARENT with nothing of its own still shows, because its child holds real content", () => {
  // "Fall 2026" holding nothing itself but its child "Torts" holding two decks — the exact
  // dev-preview fixture. Filtering on direct counts alone would hide Fall 2026 and bury Torts's
  // content one level below where the learner could find it, which is a worse defect than an
  // empty folder disappearing: content going missing, not a placeholder going missing.
  const result = foldersWithContent(
    [folder("fall", { name: "Fall 2026" }), folder("torts", { name: "Torts", parentId: "fall" })],
    counts([["torts", 2]]),
  );
  assert.deepEqual([...result].sort(), ["fall", "torts"]);
});

test("holding-up works at both levels of the two-level cap", () => {
  // `folders_depth_guard` caps real nesting at two levels; content at the deepest level must
  // still light up every ancestor above it, not just its immediate parent.
  const result = foldersWithContent(
    [folder("a"), folder("b", { parentId: "a" })],
    counts([["b", 1]]),
  );
  assert.deepEqual([...result].sort(), ["a", "b"]);
});

test("a folder with a sibling that holds content does not light up itself", () => {
  const result = foldersWithContent([folder("a"), folder("b")], counts([["a", 1]]));
  assert.deepEqual([...result], ["a"]);
});

test("🔴 a parent_id ring cannot hang this — it terminates instead of looping forever", () => {
  // `setFolderParent`'s own header: the database accepts two folders each naming the other as
  // parent. This folder is IN the ring and holds content directly, so it must still show — a
  // cycle is not a reason to lose a real project off the page.
  const result = foldersWithContent(
    [folder("x", { parentId: "y" }), folder("y", { parentId: "x" })],
    counts([["x", 1]]),
  );
  assert.ok(result.has("x"), "the folder that actually holds something vanished");
  assert.ok(result.size <= 2, "a two-folder ring produced more marked folders than exist");
});

test("an orphan (parent missing from the list) still resolves on its own content", () => {
  const result = foldersWithContent([folder("orphan", { parentId: "gone" })], counts([["orphan", 1]]));
  assert.deepEqual([...result], ["orphan"]);
});

test("no folders, no content, no crash", () => {
  assert.deepEqual([...foldersWithContent([], counts([]))], []);
});

// ── the component actually uses it ──────────────────────────────────────────────────────────

const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const OUTPUTS = strip(readFileSync(new URL("./library-outputs.tsx", import.meta.url), "utf8"));

test("🔴🔴 the 'Folders' section draws `visibleFolders`, not the raw `folders` state", () => {
  // The memo grew the reference's recency sort 2026-08-30 (folders order by what changed inside
  // them, newest first).
  // 🔴 RE-POINTED 2026-09-04: the rule is TWO clauses now and lives in the pure `shelfFolders`,
  // which the tests above drive directly. The invariant this line guards is unchanged — the
  // section must render the FILTERED list and never the raw `folders` state.
  assert.match(OUTPUTS, /shelfFolders\(folders, nonEmptyFolders\)/);
  assert.ok(!/const visibleFolders = useMemo\([\s\S]{0,80}=>\s*folders\s*\.sort/.test(OUTPUTS), "the shelf went back to sorting the raw folders state");
  // 🔴 THE COMPARATOR GOES THROUGH `folderWhen` NOW, so an empty folder made on this page sorts by
  // its own creation time instead of falling to the bottom with a blank date. Same ordering, one
  // more row able to take part in it.
  assert.match(OUTPUTS, /folderWhen\(b\)\.localeCompare\(folderWhen\(a\)\)/, "the Folders section lost its recency ordering");
  // Since the 2026-08-30 recency rework the folder row is one shared renderer; since 2026-09-01 it
  // leads EVERY shelf's list rather than sitting in a table of its own on a kind pill. One element,
  // four homes, so they cannot drift.
  assert.match(OUTPUTS, /const folderRow = \(folder: Folder\) => \(/, "the shared folder renderer is gone");
  assert.equal(
    (OUTPUTS.match(/openFolder === null && visibleFolders\.map\(folderRow\)/g) ?? []).length,
    4,
    "a shelf stopped leading its list with the folders, or grew a folder table of its own again",
  );
  // 🔴 AND NOT INSIDE AN OPEN FOLDER. Listing the folders again while standing in one is how a
  // learner walks in circles; every home is gated on the same expression.
  assert.ok(!/(?<!openFolder === null && )visibleFolders\.map\(folderRow\)/.test(OUTPUTS), "a folder list escaped the openFolder gate");
});

test("🔴 the move-to-folder menu and the open-folder breadcrumb keep the FULL list", () => {
  // A brand-new, empty project has to be a legal destination to file the very first thing into —
  // hiding it from the move menu would mean the only way to put something in a new project is to
  // make the project not-new first, which is not possible.
  assert.match(OUTPUTS, /folders=\{folders\}/, "the move-to-folder menu stopped seeing every folder");
  assert.match(
    OUTPUTS,
    /folders\.find\(\(folder\) => folder\.id === openFolder\)\?\.name \?\?\s*"Library"/,
    "the open-folder breadcrumb stopped reading the full folders list",
  );
});

test("🔴 the title row's New is a menu of real doors, and the view toggle persists (2026-08-30)", () => {
  // Measured in the owner's Chrome: the reference's "New" pill opens a menu (Image / Note / … /
  // Folder / Upload files), and a two-button grid/list toggle sits at the filter row's right
  // edge. Ours offers the two things a learner can genuinely start from here — a project, and a
  // canvas (where every artifact this page lists is actually made). Menu rows that AUTHOR a
  // deck, note or slides here would be §38/cards-are-output-only violations dressed as menu
  // items, so their absence is asserted too.
  // 🔴🔴 ONE VERB NOW, AND IT IS FOLDER. Owner, 2026-09-03: *"the only thing I want in the library
  // page is for user to create a new folder so that they can organize the documents into the
  // folder."* The menu offered "New project" and "New canvas"; both are started better elsewhere,
  // and filing outputs into folders is the one thing only this page can do. The ACTION is
  // unchanged — `setNaming("")` always created a folder row — so this is a word and a shape.
  assert.match(OUTPUTS, />\s*New folder/, "the Library lost its one organising door");
  assert.ok(!/>New project<|>New canvas</.test(OUTPUTS), "the Library's New is a menu of doors again");
  assert.ok(!/>New deck<|>New note<|>New document<|>New slides</.test(OUTPUTS), "the New menu grew an authoring door");
  assert.match(OUTPUTS, /const VIEW_KEY = "nemesis\.library\.v1\.view";/, "the view choice no longer persists");
  // Three 240px cards close on the 768 column: 240·3 + 24·2 = 768, the same closing-sum
  // discipline the list row documents.
  assert.match(OUTPUTS, /grid-cols-3 gap-\[24px\]/, "the grid left the measured three-across layout");
  assert.match(OUTPUTS, /h-\[104px\]/, "folder cards left the measured 104px");
  // 🔴🔴 NAMING USED TO FORCE THE LIST, AND NOW IT CANNOT NEED TO. This asserted
  // `view === "grid" && naming === null`, because the folder was named by an input written INTO
  // the table — which only exists in list view, so opening it flipped the page out of grid and
  // back. The name is taken in a dialog now (owner, 2026-09-03: *"Making a new folder in the
  // library should work exactly like it does in ChatGPT"*), which is view-independent, so the
  // condition it guarded is gone rather than broken. `folder-dialog-matches-chatgpt.test.ts` holds
  // the replacement and refuses the inline row's return.
  assert.ok(!/naming/.test(OUTPUTS.replace(/naming ChatGPT/g, "")), "the inline naming row came back");
});

test("🔴 a folder's Modified is a real rollup, and the folders order by it (2026-08-30)", () => {
  // The empty cell was honest when the only candidate was a borrowed createdAt; the rollup —
  // latest change of anything filed inside, walked up ancestors like foldersWithContent — is
  // what "Modified" means for a container, and it is what the reference prints and sorts by.
  assert.match(OUTPUTS, /const folderModified = useMemo/, "the rollup is gone");
  assert.match(OUTPUTS, /notes\.forEach\(\(row\) => bump\(row\.folderId, row\.updatedAt\)\)/, "notes stopped feeding the rollup");
  // 🔴🔴 RE-POINTED 2026-09-04, AND THE OLD SPELLING WOULD NOW PRINT A BLANK ROW AT THE BOTTOM OF
  // THE LIST. "An untouched folder prints nothing" was free advice while an untouched folder never
  // appeared here — and since the Library's own New folder button started showing the folder you
  // just made, one is on screen the moment you create it. With no date it also sorted below every
  // folder with content, so the row you made a second ago landed last.
  //
  // 🔴 THE FALLBACK IS STILL NOT "BORROW `createdAt` FOR EVERY FOLDER", which is what the original
  // note refused and was right to. `folderWhen` reads the rollup FIRST and falls back only when
  // there is nothing inside — for which being created is genuinely the last thing that happened.
  // A folder with content is unaffected, so filing an old note into a new folder still prints the
  // note's date rather than quietly promoting the folder.
  assert.match(OUTPUTS, /folderModified\.get\(folder\.id\) \?\? folder\.createdAt \?\? ""/, "the fallback stopped preferring the rollup, or went away");
  assert.match(OUTPUTS, /when\(folderWhen\(folder\)\)/, "the Modified cell stopped going through the one helper");
});

test("🔴🔴 'All' is one list by recency, not sections (owner 2026-08-30)", () => {
  // *"the library 'all' sections should be organized by recent not by section"* — and the
  // reference's own All tab, measured in his Chrome the same day: folders grouped first (by
  // their rolled-up Modified), then every file together newest-first, no per-kind headings.
  assert.match(OUTPUTS, /const showing = \(which: OutputKind\) => shelf === which;/, "the kind shelves leak back into All");
  for (const feed of [
    /\.\.\.shownDecks\.map\(\(deck\) => \(\{ deck, kind: "deck" as const, when: deck\.createdAt \}\)\)/,
    /\.\.\.shownSlides\.map\(\(slides\) => \(\{ kind: "slides" as const, slides, when: slides\.createdAt \}\)\)/,
    /\.\.\.shownNotes\.map\(\(note\) => \(\{ kind: "note" as const, note, when: note\.updatedAt \}\)\)/,
  ]) {
    assert.match(OUTPUTS, feed, "a kind stopped feeding the merged list its freshest fact");
  }
  assert.match(OUTPUTS, /\.sort\(\(a, b\) => b\.when\.localeCompare\(a\.when\)\)/, "the merged list stopped ordering by recency");
  const all = OUTPUTS.slice(OUTPUTS.indexOf('{shelf === "all" && ('));
  assert.ok(all.length > 0, "the merged All section is gone");
  const foldersAt = all.indexOf("visibleFolders.map(folderRow)");
  const filesAt = all.indexOf("{allRows.map(allRow)}");
  assert.ok(foldersAt > -1 && filesAt > foldersAt, "folders stopped leading the merged list");
});
