import assert from "node:assert/strict";
import test from "node:test";

import type { CourseScaffold, ScaffoldPart } from "@/app/api/v1/courses/route";
import { skeletonInvalid } from "./curriculum-registry";
import {
  readScaffoldPick,
  scaffoldCurriculum,
  scaffoldPickMessages,
  scaffoldSource,
  skeletonFromScaffold,
} from "./scaffold-course";

// 🔴🔴 WHAT THIS FILE GUARDS: the shelf rung may copy a book's arrangement BECAUSE the book
// granted it (CC BY family, checked three ways at harvest) and the price is the credit on the
// plan — so the source must survive conversion, the model must only ever pick off a closed
// ballot, and everything doubtful must resolve to "none picked", which merely costs a research
// pass. A plausible-but-wrong book retitles a canvas and stands in the map for days.

const scaffold = (parts: ScaffoldPart[], over: Partial<CourseScaffold> = {}): CourseScaffold => ({
  attribution: "Microbiology by Nina Parker et al., OpenStax, CC BY 4.0",
  bookTitle: "Microbiology",
  bookUrl: "https://example.pressbooks.pub/microbiology",
  chapterCount: parts.reduce((sum, part) => sum + part.chapters.length, 0),
  id: "row-1",
  parts,
  ...over,
});

const part = (name: string, chapters: string[], index = 0): ScaffoldPart => ({
  chapters: chapters.map((title, at) => ({ index: at, title })),
  index,
  part: name,
});

// ── the ballot ──────────────────────────────────────────────────────────────────────────────────

test("🔴 the ballot is closed: numbers or none, and none is the instructed default, stated twice", () => {
  const [system, user] = scaffoldPickMessages("microbiology", [
    { bookTitle: "Microbiology", bookUrl: "https://x.test/a", chapterCount: 26 },
    { bookTitle: "Allied Health Microbiology", bookUrl: "https://x.test/b", chapterCount: 17 },
  ]);
  assert.match(system!.content, /ONLY the number of the chosen book, or the word none/);
  assert.match(system!.content, /If no listed book fits, or you are unsure, answer none/);
  assert.match(user!.content, /1\. Microbiology \(26 chapters\)/);
  assert.match(user!.content, /2\. Allied Health Microbiology \(17 chapters\)/);
  assert.match(user!.content, /course on: microbiology/);
});

test("🔴 everything doubtful reads as none", () => {
  assert.equal(readScaffoldPick("2", 5), 2);
  assert.equal(readScaffoldPick(" 2.\n", 5), 2);
  assert.equal(readScaffoldPick("none", 5), null);
  assert.equal(readScaffoldPick("None of these fit the subject.", 5), null);
  assert.equal(readScaffoldPick("I would pick 2", 5), null, "prose before the number ignored the one formatting rule");
  assert.equal(readScaffoldPick("7", 5), null, "out of range is not a pick");
  assert.equal(readScaffoldPick("0", 5), null);
  assert.equal(readScaffoldPick("", 5), null);
  assert.equal(readScaffoldPick("2 or maybe 3", 5), 2, "a leading in-range number is a pick even with trailing noise");
});

// ── conversion ──────────────────────────────────────────────────────────────────────────────────

test("🔴 parts become parents, chapters children, and the registry's own validation passes", () => {
  const skeleton = skeletonFromScaffold("microbiology", scaffold([
    part("The Cell", ["Foundations", "Cell Structure"], 0),
    part("Microbial Genetics", ["DNA Replication", "Gene Expression"], 1),
  ]));
  assert.ok(skeleton);
  assert.equal(skeletonInvalid(skeleton!), null);
  assert.equal(skeleton!.title, "Microbiology");
  assert.equal(skeleton!.maturity, "provisional", "our review has not happened; the ladder's words are about OURS");
  assert.equal(skeleton!.provenance, "textbook-scaffold");
  const roots = skeleton!.nodes.filter((node) => node.parentKey === null);
  assert.deepEqual(roots.map((node) => node.label), ["The Cell", "Microbial Genetics"]);
  const children = skeleton!.nodes.filter((node) => node.parentKey === roots[0]!.conceptKey);
  assert.deepEqual(children.map((node) => node.label), ["Foundations", "Cell Structure"]);
});

test("a book whose only part is the generic one is flat, chapters at the top", () => {
  const skeleton = skeletonFromScaffold("microbiology", scaffold([
    part("Main Body", ["One", "Two", "Three"]),
  ]));
  assert.ok(skeleton);
  assert.ok(skeleton!.nodes.every((node) => node.parentKey === null));
  assert.deepEqual(skeleton!.nodes.map((node) => node.position), [1, 2, 3]);
});

test('🔴 "Introduction" opening two parts survives twice, with distinct identities and its own label', () => {
  const skeleton = skeletonFromScaffold("microbiology", scaffold([
    part("The Cell", ["Introduction", "Cell Structure"], 0),
    part("Genetics", ["Introduction", "Gene Expression"], 1),
  ]));
  assert.ok(skeleton);
  assert.equal(skeletonInvalid(skeleton!), null, "duplicate labels must not become duplicate keys");
  const intros = skeleton!.nodes.filter((node) => node.label === "Introduction");
  assert.equal(intros.length, 2, "the second Introduction was dropped instead of re-keyed");
  assert.notEqual(intros[0]!.conceptKey, intros[1]!.conceptKey);
});

test("a scaffold too thin to be a course converts to nothing", () => {
  assert.equal(skeletonFromScaffold("x", scaffold([])), null);
  assert.equal(skeletonFromScaffold("x", scaffold([part("Main Body", ["Only", "Two"])])), null);
});

test("the plan's source is the harvest's attribution line, pointing at the book", () => {
  const source = scaffoldSource(scaffold([part("Main Body", ["a", "b", "c"])]));
  assert.equal(source.title, "Microbiology by Nina Parker et al., OpenStax, CC BY 4.0");
  assert.equal(source.url, "https://example.pressbooks.pub/microbiology");
  assert.equal(scaffoldSource(scaffold([], { attribution: "  " })).title, "Microbiology", "a blank attribution falls back to the title");
});

// ── the rung falls through, never dead-ends ─────────────────────────────────────────────────────

test("🔴 an empty shelf answer is a named refusal the caller can fall through on", async () => {
  const outcome = await scaffoldCurriculum("uid", "peruvian constitutional law", {}, { listScaffolds: async () => [] });
  assert.equal(outcome.ok, false);
  assert.equal(!outcome.ok && outcome.refusal, "no-scaffold-for-subject");
});

test("a listing failure is the same refusal, never a throw", async () => {
  const outcome = await scaffoldCurriculum("uid", "anything", {}, {
    listScaffolds: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(outcome.ok, false);
});
