// The course map tells the truth about what the learner model actually knows.
//
// 🔴🔴 HALF OF THIS SUITE EXISTS TO KEEP NUMBERS OUT, AND THAT TIGHTENED IN TWO STEPS ON ONE DAY.
// The mock the owner picked from showed chapters at 100 / 62 / 25 percent — a score the model does
// not have. The first build replaced it with an honest COUNT ("1/4"); shown that, the owner asked
// the right question: *"So if it can't track mastery then can we just remove the numbers? And
// instead do the outline way?"* So there are no digits at all now, and the guards below hold that
// rather than merely holding out percentages.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { EvidenceVerdict, LearnerEvidence } from "@/lib/learn/learner-evidence";
import type { PlanTerritory } from "@/lib/learn/curriculum-plan";

import { buildCourseMap } from "./course-map";

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
  assert.equal(map[0]!.sections.length, 0);
  assert.deepEqual(map[0]!.identityKeys, ["only"], "a flat chapter carries no keys, so clicking it would do nothing");
});

// ── the marks, which must not round ──────────────────────────────────────────

test("🔴🔴 untouched is null — it is NOT zero, and NOT developing", () => {
  const map = buildCourseMap(PLAN, []);
  assert.equal(map[0]!.mark, null);
  assert.deepEqual(map[0]!.sections.map((s) => s.mark), [null, null]);
});

test("🔴 a chapter is only established when every section beneath it is", () => {
  const half = buildCourseMap(PLAN, [done("offer")]);
  assert.equal(half[0]!.mark, "developing", "one section done read as the whole chapter established");
  const whole = buildCourseMap(PLAN, [done("offer"), done("acceptance")]);
  assert.equal(whole[0]!.mark, "established");
});

test("a section that was engaged and got it wrong reads developing", () => {
  const map = buildCourseMap(PLAN, [tried("offer")]);
  assert.deepEqual(map[0]!.sections.map((x) => x.mark), ["developing", null]);
});

// ── the guards that keep every number out ────────────────────────────────────

test("🔴🔴🔴 the panel prints no number of any kind", () => {
  // Owner: *"can we just remove the numbers?"* — so not a percent, and not the fraction that
  // replaced it either. Calibration: put `{chapter.sections.length}` beside a chapter title and
  // this reddens.
  //
  // 🔴 THE MODEL CANNOT SUPPLY ONE EITHER, which is the deeper reason and the one that outlives the
  // instruction: `courseProgress` and `barWidths` are DELETED rather than left unused, so there is
  // no arithmetic sitting in the tree for somebody to conclude a score exists.
  // 🔴 ONLY WHAT RENDERS. The first version of this matched any expression containing `.length`
  // and reddened on `chapter.sections.length > 0 ? …`, which is a CONDITION deciding whether a row
  // folds — nothing the reader ever sees. A guard that cannot tell a branch from a printed value
  // makes the honest version of this file unwritable.
  const printed = [...PANEL.matchAll(/>\s*\{([^{}]+)\}\s*</g)].map((m) => m[1]!.trim());
  const counts = printed.filter((e) => /\.(length|total|established|developing)\b|\bcount\b/.test(e));
  assert.deepEqual(counts, [], `the course map is printing a count: ${counts.join(", ")}`);
  assert.ok(!/%`|\}%/.test(PANEL), "the course map is printing a percentage");
  const model = read("./course-map.ts");
  assert.ok(!/export function (courseProgress|barWidths)/.test(model), "the progress arithmetic is back");
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
  // 🔴 REPOINTED: the map is its own control on the header now, so the popover has no door and
  // needs none — what still matters is that it does not draw the course a second time.
  assert.ok(!/CourseMapControl/.test(CONTROLS), "the popover renders the map inside itself");
  const HEADER = read("../../components/workspace/learn/canvas-header.tsx");
  assert.ok(/<CourseMapControl/.test(HEADER), "nothing renders the course map");
  assert.ok(/minimap\.planTitle !== null && minimap\.plan/.test(HEADER), "the map shows on a canvas with no course");
});

test("🔴🔴 it is a BOX on the header, not a sidebar, and it shares the sources panel's own chrome", () => {
  // Owner 2026-08-29: *"I don't want it to be exactly a full on sidebar, I would like it to be
  // similar to source panel that is a squarish circlish type of box component."* The first build
  // docked a 296px column down the right edge of the window.
  //
  // 🔴 IMPORTED, NOT RESTATED. A second copy of `rounded-2xl … shadow … ring-1` is two panels that
  // look alike today and drift the first time either is adjusted.
  // \u{1f534} REPOINTED: the map has its OWN fixed width now rather than the reader's dragged one.
  // `useDockWidth` opened it at 980 of 1470 — two thirds of the window for an outline — and tied it
  // to whatever width the learner had dragged a document to.
  assert.ok(/import \{ CONTROL, PANEL, useDismiss \} from "\.\/canvas-controls"/.test(PANEL), "the map draws its own box instead of the shared one");
  assert.ok(/cn\(PANEL, "w-\[21rem\]"\)/.test(PANEL), "the map is not the sources panel's box");
  // 🔴 THE IMPORT OR A CALL, NOT THE NAME — the same correction this file already made for
  // `renderPlanRow`. The panel keeps notes explaining what it does NOT use, and a guard that forbids
  // naming the thing it guards is one nobody can work beside.
  for (const gone of ["useDeclareSidePanel", "createPortal", "useDockWidth"]) {
    assert.ok(!new RegExp(`${gone}\\(`).test(PANEL), `the map is a docked panel again (${gone})`);
  }
});
