// The course map tells the truth about what the learner model actually knows.
//
// 🔴🔴 HALF OF THIS SUITE EXISTS TO KEEP A NUMBER OUT. The owner chose the mastery outline from four
// designs on 2026-08-29, and the mock they chose from showed chapters at 100 / 62 / 25 percent —
// a continuous mastery score the model does not have and cannot produce. `territoryMark` returns
// `established`, `developing`, or `null`, and its own note refuses to round either way. So the bar
// is filled by a COUNT of sections and the label is a fraction, and the guards below redden if a
// percent ever appears in the panel.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { EvidenceVerdict, LearnerEvidence } from "@/lib/learn/learner-evidence";
import type { PlanTerritory } from "@/lib/learn/curriculum-plan";

import { barWidths, buildCourseMap, courseProgress } from "./course-map";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const PANEL = read("../../components/workspace/learn/course-map.tsx");
const CONTROLS = read("../../components/workspace/learn/canvas-controls.tsx");

let counter = 0;
function row(
  objectiveIdentityKey: string,
  input: { demonstrationObtained: boolean; verdict?: EvidenceVerdict | null },
): LearnerEvidence {
  counter += 1;
  return {
    demonstrationObtained: input.demonstrationObtained,
    id: `row-${counter}`,
    objectiveIdentityKey,
    occurredAt: `2026-08-29T00:00:${String(counter).padStart(2, "0")}.000Z`,
    verdict: input.verdict ?? null,
  };
}
const done = (key: string) => row(key, { demonstrationObtained: true, verdict: "strong" });
const tried = (key: string) => row(key, { demonstrationObtained: true, verdict: "incorrect" });

const node = (label: string, keys: string[], children?: PlanTerritory[]): PlanTerritory => ({
  identityKeys: keys,
  label,
  reachable: true,
  ...(children ? { children } : {}),
});

const PLAN: readonly PlanTerritory[] = [
  node("Formation", [], [node("Offer", ["offer"]), node("Acceptance", ["acceptance"])]),
  node("Consideration", [], [node("Benefit and detriment", ["benefit"]), node("Past consideration", ["past"])]),
  node("Terms", [], [node("Express and implied", ["express"])]),
];

// ── the shape ────────────────────────────────────────────────────────────────

test("chapters keep the author's order, with their sections under them", () => {
  const map = buildCourseMap(PLAN, []);
  assert.deepEqual(map.map((c) => c.label), ["Formation", "Consideration", "Terms"]);
  assert.deepEqual(map[0]!.sections.map((s) => s.label), ["Offer", "Acceptance"]);
});

test("🔴 a deeper tree is FLATTENED into sections, never dropped", () => {
  // `PlanNode` nests arbitrarily. The map draws two levels because that is what the owner named
  // ("all the different chapters and sections") and because an outline that can indent forever
  // stops being scannable — but a grandchild must still appear, as a section of its chapter.
  const deep = [node("A", [], [node("B", ["b"], [node("C", ["c"])])])];
  const map = buildCourseMap(deep, []);
  assert.deepEqual(map[0]!.sections.map((s) => s.label), ["B", "C"], "a grandchild vanished from the map");
});

test("🔴 a chapter with no sections is still pickable, so its row is not a dead control", () => {
  const flat = [node("Standalone", ["only"])];
  const map = buildCourseMap(flat, []);
  assert.equal(map[0]!.total, 0);
  assert.deepEqual(map[0]!.identityKeys, ["only"], "a flat chapter carries no keys, so clicking it would do nothing");
});

// ── the marks, which must not round ──────────────────────────────────────────

test("🔴🔴 untouched is null — it is NOT zero, and NOT developing", () => {
  const map = buildCourseMap(PLAN, []);
  assert.equal(map[0]!.mark, null);
  assert.deepEqual(map[0]!.sections.map((s) => s.mark), [null, null]);
  assert.equal(map[0]!.established, 0);
  assert.equal(map[0]!.developing, 0, "an untouched chapter is being counted as underway");
});

test("🔴 a chapter is only counted established when every section is", () => {
  const half = buildCourseMap(PLAN, [done("offer")]);
  assert.equal(half[0]!.established, 1);
  assert.equal(half[0]!.total, 2);
  assert.equal(half[0]!.mark, "developing", "one section done read as the whole chapter established");

  const whole = buildCourseMap(PLAN, [done("offer"), done("acceptance")]);
  assert.equal(whole[0]!.established, 2);
  assert.equal(whole[0]!.mark, "established");
});

test("a section that was engaged and got it wrong reads developing, and is counted as such", () => {
  const map = buildCourseMap(PLAN, [tried("offer")]);
  assert.equal(map[0]!.established, 0);
  assert.equal(map[0]!.developing, 1);
});

// ── the bar is geometry, not a score ─────────────────────────────────────────

test("🔴🔴 an untouched chapter's bar is EMPTY, not a zero-valued score", () => {
  const map = buildCourseMap(PLAN, []);
  assert.deepEqual(barWidths(map[0]!), { established: 0, developing: 0 });
});

test("the two segments are drawn from the counts and never exceed the track", () => {
  const map = buildCourseMap(PLAN, [done("offer"), tried("acceptance")]);
  const w = barWidths(map[0]!);
  assert.equal(w.established, 50);
  assert.equal(w.developing, 50);
  assert.ok(w.established + w.developing <= 100, "the two segments overflow the bar");
});

test("a sectionless chapter's bar comes from its own mark", () => {
  const flat = [node("Standalone", ["only"])];
  assert.deepEqual(barWidths(buildCourseMap(flat, [])[0]!), { established: 0, developing: 0 });
  assert.deepEqual(barWidths(buildCourseMap(flat, [done("only")])[0]!), { established: 100, developing: 0 });
});

test("🔴 the course total counts a sectionless chapter as one thing to know", () => {
  const mixed = [node("A", [], [node("A1", ["a1"])]), node("B", ["b"])];
  const p = courseProgress(buildCourseMap(mixed, [done("a1"), done("b")]));
  assert.deepEqual(p, { developing: 0, established: 2, total: 2 });
});

// ── the guards that keep the invented number out ─────────────────────────────

test("🔴🔴🔴 the panel never prints a percent, because there is no percent to print", () => {
  // Calibration: put `{Math.round(pct)}%` back beside a chapter title and this reddens. The `%`
  // characters the panel legitimately contains are CSS widths — geometry, inside a style object —
  // so the check is on what reaches the reader as text.
  const text = [...PANEL.matchAll(/>\{[^}]*\}%|\}%</g)].map((m) => m[0]);
  assert.deepEqual(text, [], `the course map is printing a score: ${text.join(", ")}`);
  assert.ok(/`\$\{chapter\.established\}\/\$\{chapter\.total\}`/.test(PANEL), "the chapter label is no longer a fraction");
  assert.ok(/established\}\s*of\s*\{progress\.total\} established/.test(PANEL.replace(/\s+/g, " ")) || /of \{progress\.total\} established/.test(PANEL), "the header no longer states a checkable count");
});

test("🔴🔴 progress is carried by fill, never by a second colour", () => {
  // The product's standing rule is that the character is the accent and nothing else may disagree
  // with it. A green/amber/red legend would be a second colour system, and a red row against
  // everything the learner has not started would be the wrong message besides.
  // 🔴 MATCHED AS CLASS NAMES, NOT AS WORDS. The first version of this checked for the substring
  // anywhere and reddened on the file's own comment about `globals.css`'s acid-green button
  // fallback — a guard that forbids DISCUSSING the thing it guards is a guard nobody can work
  // beside. Tailwind colour utilities are what would actually paint a second system.
  const classes = [...PANEL.matchAll(/(?:bg|text|from|to|via|border|ring)-(\w+)-\d{2,3}/g)].map((m) => m[1] ?? "");
  const hues = classes.filter((c) => c && !["gray", "grey", "zinc", "neutral", "slate", "stone"].includes(c));
  assert.deepEqual(hues, [], `the course map introduced state colours: ${hues.join(", ")}`);

  // \u{1f534}\u{1f534} AND NOT `--ui-action` AS TEXT EITHER, WHICH IS THE TRAP THIS PANEL ACTUALLY FELL INTO.
  // It IS the product's accent, so reaching for it to mark "you are here" is the obvious move — and
  // `desktop-ui.css` says what it is for: a filled send button, a focus outline, a ring. It carries
  // a dark GLYPH, so its dark value is `#f2f2f4`. Measured on the rendered panel, the current row
  // came back `rgb(242, 242, 244)` against body white: invisible, and legible in light mode only by
  // accident. Fill and weight say "here" in both themes.
  assert.ok(!/text-\(--ui-action\)/.test(PANEL), "the current row is coloured with --ui-action, which is near-invisible in dark mode");
});

test("🔴 there is ONE drawing of the course, not two", () => {
  // The whole plan tree used to render inside the Minimap popover. Two drawings of one subject
  // disagree the first time either is adjusted.
  // 🔴 THE DEFINITION OR A CALL, NOT THE NAME. The file keeps a note saying the function was
  // removed and why; banning the string outright would ask the code to forget its own history.
  assert.ok(!/const renderPlanRow|renderPlanRow\(/.test(CONTROLS), "the popover draws its own copy of the course again");
  assert.ok(/onOpenCourseMap/.test(CONTROLS), "the popover has no door to the map");
});

test("🔴 the map docks, so the history rail can get out of its way", () => {
  // Both want the right edge. `CanvasHistoryRail` already returns null while a panel is docked, so
  // claiming the side panel is what keeps them from stacking — and it is also what pushes the
  // canvas instead of covering it.
  // \u{1f534} REPOINTED: the map has its OWN fixed width now rather than the reader's dragged one.
  // `useDockWidth` opened it at 980 of 1470 — two thirds of the window for an outline — and tied it
  // to whatever width the learner had dragged a document to.
  assert.ok(/useDeclareSidePanel\(COURSE_MAP_WIDTH\)/.test(PANEL), "the map floats over the canvas instead of docking");
  assert.ok(/const COURSE_MAP_WIDTH = 296;/.test(PANEL), "the map is not the width the owner approved");
  // \u{1f534} THE IMPORT OR A CALL, NOT THE NAME \u2014 the same correction this file already made for
  // `renderPlanRow`. The panel keeps a note explaining why it does NOT use that hook, and a guard
  // that forbids naming the thing it guards is one nobody can work beside.
  assert.ok(
    !/from "\.\/use-dock-width"|useDockWidth\(\)/.test(PANEL),
    "the map borrows the document reader's width again",
  );
});
