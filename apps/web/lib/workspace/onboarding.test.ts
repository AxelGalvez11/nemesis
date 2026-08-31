import assert from "node:assert/strict";
import { test } from "node:test";

import type { CalendarEvent } from "@/lib/workspace/calendar-model";
import {
  addCourse,
  assignCourse,
  cleanCourseName,
  MAX_COURSE_NAME_CHARS,
  MAX_COURSES,
  mergeCourses,
  nextStep,
  parseStoredOnboarding,
  previousStep,
  removeCourse,
  shouldShowOnboarding,
  splitCourseInput,
  STEPS,
  stepIndex,
} from "@/lib/workspace/onboarding";

// ── Step order ───────────────────────────────────────────────────────────────

test("steps run courses → syllabi → coursework and then stop", () => {
  assert.deepEqual([...STEPS], ["courses", "syllabi", "coursework"]);
  assert.equal(nextStep("courses"), "syllabi");
  assert.equal(nextStep("syllabi"), "coursework");
  assert.equal(nextStep("coursework"), null);
});

test("going back stops at the first step", () => {
  assert.equal(previousStep("coursework"), "syllabi");
  assert.equal(previousStep("syllabi"), "courses");
  assert.equal(previousStep("courses"), null);
});

test("stepIndex matches the declared order", () => {
  for (const [index, step] of STEPS.entries()) assert.equal(stepIndex(step), index);
});

// ── Course names ─────────────────────────────────────────────────────────────

test("a course name keeps the student's own words and casing", () => {
  assert.equal(cleanCourseName("Contract Law"), "Contract Law");
  assert.equal(cleanCourseName("  Thermodynamics II  "), "Thermodynamics II");
});

test("SHORT WORDS SURVIVE — 'Law' is not dropped from 'Contract Law'", () => {
  // The regression this guards: a four-character word floor once deleted the
  // word carrying all the meaning. Two-letter course names are also real.
  assert.equal(cleanCourseName("Contract Law"), "Contract Law");
  assert.equal(cleanCourseName("AI"), "AI");
  assert.equal(cleanCourseName("Art of the Book"), "Art of the Book");
});

test("punctuation students actually type is preserved", () => {
  assert.equal(cleanCourseName("18th-Century Portraiture"), "18th-Century Portraiture");
  assert.equal(cleanCourseName("Physics (Honours)"), "Physics (Honours)");
  assert.equal(cleanCourseName("Law & Society"), "Law & Society");
  assert.equal(cleanCourseName("CHEM 111: General Chemistry"), "CHEM 111: General Chemistry");
});

test("a slash becomes a space so it cannot split into two Library folders", () => {
  assert.equal(cleanCourseName("Physics/Lab"), "Physics Lab");
  assert.equal(cleanCourseName("A\\B"), "A B");
});

test("control characters are stripped rather than stored in a folder name", () => {
  // Built with fromCharCode so this source file stays printable — a raw NUL
  // byte in a test fixture is invisible in review and breaks some tooling.
  const nul = String.fromCharCode(0);
  const unitSeparator = String.fromCharCode(31);
  assert.equal(cleanCourseName(`Tor${nul}ts`), "Tor ts");
  assert.equal(cleanCourseName(`Ethics${unitSeparator}Law`), "Ethics Law");
});

test("runs of whitespace collapse to one space", () => {
  assert.equal(cleanCourseName("Organic    Chemistry\n\nII"), "Organic Chemistry II");
});

test("nothing usable returns null instead of an empty folder name", () => {
  assert.equal(cleanCourseName(""), null);
  assert.equal(cleanCourseName("   "), null);
  assert.equal(cleanCourseName("///"), null);
});

test("an absurdly long name is capped and left tidy", () => {
  const cleaned = cleanCourseName("x".repeat(MAX_COURSE_NAME_CHARS + 50));
  assert.equal(cleaned?.length, MAX_COURSE_NAME_CHARS);
});

test("a name that is only spaces after the cap does not become empty string", () => {
  // 80 characters then a word: slicing lands mid-whitespace, and the trailing
  // trim must not leave "" behind.
  const cleaned = cleanCourseName(`${"a".repeat(MAX_COURSE_NAME_CHARS)}   tail`);
  assert.equal(cleaned, "a".repeat(MAX_COURSE_NAME_CHARS));
});

// ── The course list ──────────────────────────────────────────────────────────

test("adding a course returns a new array and never mutates the old one", () => {
  const before = ["Torts"];
  const after = addCourse(before, "Contracts");
  assert.deepEqual(before, ["Torts"]);
  assert.deepEqual(after, ["Torts", "Contracts"]);
});

test("a duplicate is ignored and the FIRST spelling is kept", () => {
  const courses = addCourse(addCourse([], "Torts"), "torts");
  assert.deepEqual(courses, ["Torts"]);
});

test("blank input adds nothing", () => {
  assert.deepEqual(addCourse(["Torts"], "   "), ["Torts"]);
});

test("the cap holds", () => {
  let courses: string[] = [];
  for (let index = 0; index < MAX_COURSES + 10; index += 1) courses = addCourse(courses, `Course ${index}`);
  assert.equal(courses.length, MAX_COURSES);
});

test("removing a course leaves the rest in order", () => {
  assert.deepEqual(removeCourse(["Torts", "Contracts", "Crim"], "Contracts"), ["Torts", "Crim"]);
});

test("merging folds in new names and skips ones already there", () => {
  assert.deepEqual(mergeCourses(["Torts"], ["torts", "Contracts", ""]), ["Torts", "Contracts"]);
});

test("pasted input splits on newlines and commas", () => {
  assert.deepEqual(splitCourseInput("Torts\nContracts, Criminal Law\n\n"), [
    "Torts",
    "Contracts",
    "Criminal Law",
  ]);
});

test("a single typed name comes back as one course", () => {
  assert.deepEqual(splitCourseInput("Fluid Mechanics"), ["Fluid Mechanics"]);
});

// ── Who sees the flow ────────────────────────────────────────────────────────

test("a brand-new empty account sees onboarding", () => {
  assert.equal(shouldShowOnboarding({ hasEvents: false, hasLibrary: false, stored: null }), true);
});

test("a finished or skipped marker suppresses it forever", () => {
  const at = "2026-07-31T00:00:00.000Z";
  assert.equal(
    shouldShowOnboarding({ hasEvents: false, hasLibrary: false, stored: { at, outcome: "finished" } }),
    false,
  );
  assert.equal(
    shouldShowOnboarding({ hasEvents: false, hasLibrary: false, stored: { at, outcome: "skipped" } }),
    false,
  );
});

test("AN ACCOUNT WITH CONTENT NEVER SEES IT, even on a fresh browser", () => {
  // The cross-device guard. Someone who set up on their laptop opens their
  // phone: storage there is empty, but the account is not, so no welcome
  // screen. This is what lets the feature ship without a database column.
  assert.equal(shouldShowOnboarding({ hasEvents: true, hasLibrary: false, stored: null }), false);
  assert.equal(shouldShowOnboarding({ hasEvents: false, hasLibrary: true, stored: null }), false);
});

test("stored onboarding parses only values it recognises", () => {
  assert.deepEqual(parseStoredOnboarding('{"outcome":"finished","at":"2026-07-31"}'), {
    at: "2026-07-31",
    outcome: "finished",
  });
  assert.equal(parseStoredOnboarding(null), null);
  assert.equal(parseStoredOnboarding("not json"), null);
  assert.equal(parseStoredOnboarding('{"outcome":"maybe"}'), null);
  assert.equal(parseStoredOnboarding("[]"), null);
  assert.equal(parseStoredOnboarding("null"), null);
});

test("a stored marker missing its timestamp still counts as having run", () => {
  assert.deepEqual(parseStoredOnboarding('{"outcome":"skipped"}'), { at: "", outcome: "skipped" });
});

// ── Stamping imported events with a course ───────────────────────────────────

function event(id: string, course?: string): CalendarEvent {
  return { date: "2026-09-01", id, kind: "assignment", title: `Item ${id}`, ...(course ? { course } : {}) };
}

test("the syllabus's own course name wins", () => {
  const out = assignCourse([event("a")], "Torts", ["Contracts", "Crim"]);
  assert.equal(out[0]?.course, "Torts");
});

test("with exactly one known course, that course is used", () => {
  const out = assignCourse([event("a")], null, ["Fluid Mechanics"]);
  assert.equal(out[0]?.course, "Fluid Mechanics");
});

test("WITH TWO OR MORE COURSES AND NO NAME, nothing is guessed", () => {
  const out = assignCourse([event("a")], null, ["Torts", "Contracts"]);
  assert.equal(out[0]?.course, undefined);
});

test("an event that already names its course keeps it", () => {
  const out = assignCourse([event("a", "Already")], "Torts", []);
  assert.equal(out[0]?.course, "Already");
});

test("assignCourse never mutates the events it was given", () => {
  const original = event("a");
  const out = assignCourse([original], "Torts", []);
  assert.equal(original.course, undefined);
  assert.equal(out[0]?.course, "Torts");
});
