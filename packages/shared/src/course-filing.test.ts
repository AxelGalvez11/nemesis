import assert from "node:assert/strict";
import test from "node:test";

import {
  courseScore,
  deckNameForNewDeck,
  FALLBACK_FOLDERS,
  folderForNewItem,
  groupForNewArtifact,
  knownCourses,
  matchCourse,
  UNSORTED_FOLDER,
} from "./course-filing.ts";

const COURSES = ["Pharmacology", "Advanced Contract Law", "Thermodynamics II"];

test("a lecture goes under the course it is about", () => {
  assert.equal(
    folderForNewItem("recording", "Today we covered beta blockers in pharmacology.", COURSES),
    "Pharmacology/Lectures",
  );
});

test("the same rule works for three unrelated fields, with no subject list anywhere", () => {
  // The point of the design: these pass because the STUDENT named the courses,
  // not because anything here knows what they mean.
  const trades = ["Welding Fabrication", "Kiln Operation"];
  assert.equal(folderForNewItem("slides", "kiln operation safety", trades), "Kiln Operation/Slides");
  assert.equal(
    folderForNewItem("recording", "notes on contract law, advanced consideration", COURSES),
    "Advanced Contract Law/Lectures",
  );
  assert.equal(
    folderForNewItem("note", "thermodynamics second law entropy", COURSES),
    "Thermodynamics II/Notes",
  );
});

test("nothing recognisable keeps today's behaviour exactly", () => {
  // The pile still works. Only things it can actually place leave it.
  assert.equal(folderForNewItem("recording", "picking up a car", COURSES), FALLBACK_FOLDERS.recording);
  assert.equal(folderForNewItem("note", "picking up a car", COURSES), FALLBACK_FOLDERS.note);
  assert.equal(folderForNewItem("slides", "picking up a car", COURSES), FALLBACK_FOLDERS.slides);
  // And with no courses at all — a student who has never used the calendar.
  assert.equal(folderForNewItem("recording", "beta blockers", []), FALLBACK_FOLDERS.recording);
});

test("🔴 A TIE IS A REFUSAL, not a coin toss", () => {
  // A note filed under the wrong course is harder to find than one left in the
  // obvious pile, because the student will not think to look there.
  const twins = ["Organic Chemistry I", "Organic Chemistry II"];
  assert.equal(matchCourse("organic chemistry reaction mechanisms", twins), null);
  assert.equal(folderForNewItem("recording", "organic chemistry reaction mechanisms", twins), FALLBACK_FOLDERS.recording);
});

test("one shared word is not a match when the course name has several", () => {
  // "advanced" alone must not file a note under Advanced Contract Law.
  assert.equal(matchCourse("an advanced technique for soldering", ["Advanced Contract Law"]), null);
  // Both distinctive words, and it lands.
  assert.ok(matchCourse("contract law reading", ["Advanced Contract Law"]));
});

test("a one-word course only has one word to match on", () => {
  const match = matchCourse("today's pharmacology seminar", ["Pharmacology"]);
  assert.equal(match?.course, "Pharmacology");
});

test("a longer name beats a shorter one when both fit", () => {
  const courses = ["Law", "Advanced Contract Law"];
  assert.equal(matchCourse("advanced contract law tutorial", courses)?.course, "Advanced Contract Law");
});

test("a course name that would split the path is made safe", () => {
  assert.equal(
    folderForNewItem("recording", "anatomy/physiology lecture", ["Anatomy/Physiology"]),
    "Anatomy-Physiology/Lectures",
  );
});

test("courses come from the calendar and the student's own folders, deduped", () => {
  assert.deepEqual(
    knownCourses(["Pharmacology", "pharmacology", null, "  ", undefined], ["Contract Law", "PHARMACOLOGY"]),
    ["Pharmacology", "Contract Law"],
  );
});

test("our own folder is never treated as a course", () => {
  // Otherwise a lecture gets filed under a course named after the app.
  assert.deepEqual(knownCourses([], ["Nemesis", "Biology"]), ["Biology"]);
});

test("scoring counts distinctive words, not filler", () => {
  // "the" and "of" carry no signal; the shared stopword list drops them.
  assert.equal(courseScore("the study of the law", "The And For"), 0);
  assert.ok(courseScore("contract law", "Contract Law") >= 2);
});

// ── Provenance is never hierarchy (owner 2026-08-05) ─────────────────────────

test("🔴 nothing ever files under a folder named for who made it — the fallback is one honest Inbox", () => {
  assert.deepEqual(Object.values(FALLBACK_FOLDERS), [UNSORTED_FOLDER, UNSORTED_FOLDER, UNSORTED_FOLDER]);
  assert.equal(UNSORTED_FOLDER, "Inbox");
});

test("a new chat deck inherits its matched course as its '::' folder", () => {
  assert.equal(
    deckNameForNewDeck("Beta Blockers", "today's pharmacology lecture on beta blockers", COURSES),
    "Pharmacology::Beta Blockers",
  );
  // No clear course → a top-level deck, never a fake group.
  assert.equal(deckNameForNewDeck("Tesla trivia", "interior features and trunk space", COURSES), "Tesla trivia");
  // A name the model already wrote a folder into is respected, not doubled.
  assert.equal(
    deckNameForNewDeck("cardio::Beta Blockers", "pharmacology beta blockers", COURSES),
    "cardio::Beta Blockers",
  );
});

test("a new test files under its matched course, else the top level — never 'Generated tests'", () => {
  assert.equal(groupForNewArtifact("pharmacology exam practice questions", COURSES), "Pharmacology");
  assert.equal(groupForNewArtifact("mixed trivia round", COURSES), "");
});

// ── The course NUMBER is part of the name ───────────────────────────────────
// Owner 2026-08-05, production re-acceptance: an upload whose filename and body
// both said "PHCY 2114" sat in Inbox forever. Cause: contentWords tokenises on
// /[a-z][a-z0-9'-]*/, which needs a token to START with a letter, so every
// "PHCY nnnn" course collapsed to the single word {"phcy"}. All six of this
// student's courses scored identically on any text mentioning one of them,
// every comparison tied, and a tie is a refusal.

const PHCY_COURSES = ["PHCY 1215", "PHCY 1218", "PHCY 2105", "PHCY 2109", "PHCY 2114", "PHCY 2119"];

test("a course number picks one course out of a department that shares its prefix", () => {
  const matched = matchCourse(
    "PHCY 2114 Lecture 4 Antibiotic Resistance.md\nCourse: PHCY 2114. Beta-lactamases hydrolyse the beta-lactam ring.",
    PHCY_COURSES,
  );
  assert.equal(matched?.course, "PHCY 2114");
});

test("each sibling course is reachable by its own number", () => {
  for (const course of PHCY_COURSES) {
    assert.equal(matchCourse(`Notes for ${course}, week 3`, PHCY_COURSES)?.course, course);
  }
});

test("the shared prefix alone is still a refusal", () => {
  // "PHCY" with no number cannot choose between six courses, and guessing is
  // worse than Inbox — the student would never think to look in the wrong one.
  assert.equal(matchCourse("some PHCY reading I did tonight", PHCY_COURSES), null);
});

test("a number that belongs to no course does not invent a match", () => {
  assert.equal(matchCourse("PHCY 9999 mystery handout", PHCY_COURSES), null);
});

test("named courses without numbers still match on their words", () => {
  const named = ["Advanced Contract Law", "Thermodynamics", "Art History"];
  assert.equal(matchCourse("my contract law reading for advanced seminar", named)?.course, "Advanced Contract Law");
  assert.equal(matchCourse("thermodynamics problem set", named)?.course, "Thermodynamics");
});
