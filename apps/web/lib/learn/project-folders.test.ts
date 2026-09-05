// 🔴🔴 A LIBRARY FOLDER IS NOT A PROJECT. Owner, 2026-09-04: *"the library does not make folders,
// it makes new projects not library folders."*
//
// `folders` is one table serving two things. `made_in` was added earlier the same day so an empty
// Library folder would show on the Library shelf; that fixed the Library's view of it and left every
// surface that offers a place to put a CHAT still calling it a project. This is the other half.
//
// These guards are source-level on purpose: the defect is a surface FORGETTING to filter, which no
// unit test of the filter itself can catch.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isProjectFolder, projectFolders } from "@/lib/learn/project-folders";
import type { Folder } from "@/lib/learn/canvas-store";

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const STORE = read("./canvas-store.ts");
const at = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const PROJECTS = at("../../components/workspace/projects/projects-page.tsx");
const SIDEBAR = at("../../components/workspace/shell/sidebar-canvases.tsx");
const HOME = at("../../components/workspace/learn/canvas-home.tsx");
const MANAGER = at("../../components/workspace/library/canvas-manager.tsx");
const SHELF = at("../../components/workspace/library/library-outputs.tsx");
const MIGRATION = readFileSync(
  new URL("../../../../supabase/migrations/20260904T20_folders_made_in.sql", import.meta.url),
  "utf8",
);

const folder = (over: Partial<Folder>): Folder => ({ id: "f", name: "n", parentId: null, ...over }) as Folder;

test("🔴 a folder made on the Library is not a project, and everything else still is", () => {
  const rows = [
    folder({ id: "a", name: "Pharmacology" }),
    folder({ id: "b", madeIn: "library", name: "Week 5 reading" }),
    folder({ id: "c", madeIn: null, name: "Structures" }),
  ];
  assert.deepEqual(projectFolders(rows).map((row) => row.id), ["a", "c"], "a Library folder is being offered as a project");

  // 🔴 NULL IS A PROJECT, and that direction is what keeps every row made before today correct.
  assert.equal(isProjectFolder(folder({ madeIn: null })), true);
  assert.equal(isProjectFolder(folder({})), true, "a folder with no made_in stopped being a project");
  assert.equal(isProjectFolder(folder({ madeIn: "library" })), false);
});

test("🔴🔴 every surface that offers a place to put a chat filters to projects", () => {
  // Each of these lists folders so a learner can choose one for a CHAT. A surface that lists them
  // unfiltered is exactly how this defect reached production.
  for (const [name, source] of [
    ["the Projects page", PROJECTS],
    ["the sidebar's Projects section", SIDEBAR],
    ["the front door's project row", HOME],
    ["the move-this-chat menu", MANAGER],
  ] as const) {
    assert.match(source, /projectFolders\(/, `${name} lists folders without filtering out Library folders`);
    assert.match(source, /from "@\/lib\/learn\/project-folders"/, `${name} does not import the filter`);
  }
});

test("🔴 the Library draws no folders at all now, and makes none", () => {
  // Later the same day (owner: "remove projects from library") the Library stopped drawing folder
  // rows and lost its New folder button, so the shelf's OR and its `made_in` write went with them.
  // `made_in` stays in the schema and the store: NULL still means "made anywhere but the
  // Library", and the surfaces above still filter on it. Nothing writes "library" today.
  assert.ok(!/shelfFolders|withContent\.has\(folder\.id\)/.test(SHELF), "the Library draws folder rows again");
  assert.ok(!/createFolder\(/.test(SHELF), "the Library makes folders again — projects are made on /projects");
  const writes = STORE.match(/made_in: madeIn/g) ?? [];
  assert.equal(writes.length, 1, "made_in is written in more than one place");
  assert.match(MIGRATION, /check \(made_in is null or made_in = 'library'\)/, "the column accepts values nothing reads");
});
