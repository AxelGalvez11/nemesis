import assert from "node:assert/strict";
import test from "node:test";

import { libraryCrumbs, MAX_VISIBLE_SEGMENTS, type LibraryCrumb } from "./library-crumbs";

const shape = (crumbs: LibraryCrumb[]) =>
  crumbs.map((crumb) => (crumb.kind === "root" ? "Library" : crumb.kind === "folded" ? "…" : crumb.kind === "current" ? `[${crumb.label}]` : crumb.label));

// The whole point of the 2026-08-06 change: the root is a crumb like any other.
// It was a plain label, and a breadcrumb root that ignores clicks is the single
// most confusing thing a breadcrumb can do.
test("the root is always present and always navigable", () => {
  const crumbs = libraryCrumbs("Constitutional law/Commerce power", "The commerce clause");
  assert.equal(crumbs[0]?.kind, "root");
  assert.deepEqual(shape(crumbs), ["Library", "Constitutional law", "Commerce power", "[The commerce clause]"]);
});

test("every level above the page is navigable, and carries where it goes", () => {
  const crumbs = libraryCrumbs("Constitutional law/Commerce power", "The commerce clause");
  const folders = crumbs.flatMap((crumb) => (crumb.kind === "folder" ? [crumb] : []));
  assert.deepEqual(folders.map((crumb) => crumb.target), ["Constitutional law", "Constitutional law/Commerce power"]);
});

// Standard breadcrumb behaviour, and the reason "every level should be
// clickable" stops one short: a button that re-opens the page you are reading
// is a no-op dressed as an affordance.
test("the page itself is a crumb but not a link", () => {
  const crumbs = libraryCrumbs("Art history", "01 Intro to the Baroque");
  const last = crumbs[crumbs.length - 1];
  assert.equal(last?.kind, "current");
  assert.equal(last?.kind === "current" && last.label, "01 Intro to the Baroque");
  assert.equal(crumbs.some((crumb) => crumb.kind === "folder" && crumb.label === "01 Intro to the Baroque"), false);
});

test("a note at the root is just Library and the page", () => {
  assert.deepEqual(shape(libraryCrumbs("", "Home")), ["Library", "[Home]"]);
});

test("a page with no title leaves the trail alone", () => {
  assert.deepEqual(shape(libraryCrumbs("Art history", "")), ["Library", "Art history"]);
  assert.deepEqual(shape(libraryCrumbs("Art history", "   ")), ["Library", "Art history"]);
});

// 🔴 The folder-page case. Folders are notes, so a folder's own page lives
// INSIDE the folder and shares its name — appending the title naively rendered
// "Library / Constitutional law / Constitutional law".
test("a folder's own page names it once, as the current page", () => {
  const crumbs = libraryCrumbs("Constitutional law", "Constitutional law");
  assert.deepEqual(shape(crumbs), ["Library", "[Constitutional law]"]);
  assert.equal(crumbs.some((crumb) => crumb.kind === "folder"), false, "the folder must not also be a link to itself");
});

test("only the LAST folder collapses into the page — an ancestor of the same name still links", () => {
  // A note called "Physics" inside Physics/Waves/Physics is a real note, not a
  // folder page: the folder directly above it is "Waves".
  const crumbs = libraryCrumbs("Physics/Waves", "Physics");
  assert.deepEqual(shape(crumbs), ["Library", "Physics", "Waves", "[Physics]"]);
});

test("deep chains fold their oldest levels and keep the recent ones", () => {
  const crumbs = libraryCrumbs("Year 2/Semester 1/Constitutional law/Commerce power", "The commerce clause");
  assert.deepEqual(shape(crumbs), ["Library", "…", "Constitutional law", "Commerce power", "[The commerce clause]"]);
  const folded = crumbs.find((crumb) => crumb.kind === "folded");
  assert.deepEqual(folded?.kind === "folded" && folded.hidden, ["Year 2", "Semester 1"]);
  assert.equal(crumbs.filter((crumb) => crumb.kind === "folder").length, MAX_VISIBLE_SEGMENTS);
});

test("a folded chain still targets the full path, not the visible tail", () => {
  const crumbs = libraryCrumbs("Year 2/Semester 1/Constitutional law/Commerce power", "The commerce clause");
  const folders = crumbs.flatMap((crumb) => (crumb.kind === "folder" ? [crumb.target] : []));
  assert.deepEqual(folders, [
    "Year 2/Semester 1/Constitutional law",
    "Year 2/Semester 1/Constitutional law/Commerce power",
  ]);
});

test("blank and doubled separators in a path do not become empty crumbs", () => {
  assert.deepEqual(shape(libraryCrumbs("//Art history//", "Baroque")), ["Library", "Art history", "[Baroque]"]);
});
