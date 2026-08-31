import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { foldersWithContent } from "./library-outputs";
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
  // them, newest first); the invariant here is unchanged — it still filters on nonEmptyFolders.
  assert.match(OUTPUTS, /folders\s*\.filter\(\(folder\) => nonEmptyFolders\.has\(folder\.id\)\)/);
  assert.match(OUTPUTS, /folderModified\.get\(b\.id\)/, "the Folders section lost its recency ordering");
  assert.match(OUTPUTS, /\{visibleFolders\.map\(\(folder\) => \(/, "the row list reverted to mapping the raw folders array");
  assert.match(
    OUTPUTS,
    /openFolder === null && \(visibleFolders\.length > 0 \|\| naming !== null\)/,
    "the section's own visibility guard reverted to the raw folders array",
  );
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
  assert.match(OUTPUTS, />New project</, "the New menu lost its project door");
  assert.match(OUTPUTS, />New canvas</, "the New menu lost its canvas door");
  assert.ok(!/>New deck<|>New note<|>New document<|>New slides</.test(OUTPUTS), "the New menu grew an authoring door");
  assert.match(OUTPUTS, /const VIEW_KEY = "nemesis\.library\.v1\.view";/, "the view choice no longer persists");
  // Three 240px cards close on the 768 column: 240·3 + 24·2 = 768, the same closing-sum
  // discipline the list row documents.
  assert.match(OUTPUTS, /grid-cols-3 gap-\[24px\]/, "the grid left the measured three-across layout");
  assert.match(OUTPUTS, /h-\[104px\]/, "folder cards left the measured 104px");
  // Naming forces the list: a grid with an invisible inline input would eat the New-project click.
  assert.match(OUTPUTS, /view === "grid" && naming === null/, "the naming flow can now land in a grid with no input");
});

test("🔴 a folder's Modified is a real rollup, and the folders order by it (2026-08-30)", () => {
  // The empty cell was honest when the only candidate was a borrowed createdAt; the rollup —
  // latest change of anything filed inside, walked up ancestors like foldersWithContent — is
  // what "Modified" means for a container, and it is what the reference prints and sorts by.
  assert.match(OUTPUTS, /const folderModified = useMemo/, "the rollup is gone");
  assert.match(OUTPUTS, /notes\.forEach\(\(row\) => bump\(row\.folderId, row\.updatedAt\)\)/, "notes stopped feeding the rollup");
  assert.match(OUTPUTS, /folderModified\.has\(folder\.id\) \? when\(folderModified\.get\(folder\.id\) \?\? ""\) : ""/, "an untouched folder would print a false date");
});
