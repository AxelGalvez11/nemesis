import assert from "node:assert/strict";
import test from "node:test";

import {
  courseScore,
  FALLBACK_FOLDERS,
  folderForNewItem,
  knownCourses,
  matchCourse,
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
