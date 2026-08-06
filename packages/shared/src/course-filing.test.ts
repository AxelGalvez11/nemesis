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
  sourceCourseFolder,
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

// ── A study item goes where its source document already lives ────────────────
// Owner 2026-08-06, one turn over one lecture: the note landed in the student's
// own "Pharmacy", the deck in an invented "Pharmacology", the test in the same
// invented folder. The upload lane had resolved the real folder 108 seconds
// earlier and written it to the database; the study lanes never asked.

test("🔴 a deck built from a filed document inherits that document's folder, not an invented one", () => {
  // The real case: the lecture is about pharmacogenomics, so nothing in its
  // words matches "Pharmacy" — only where the student keeps the file does.
  assert.equal(
    deckNameForNewDeck("Pharmacogenomics (Lectures 1-2)", "CYP2D6 alleles, metabolizer phenotypes", COURSES, "Pharmacy"),
    "Pharmacy::Pharmacogenomics (Lectures 1-2)",
  );
  assert.equal(
    groupForNewArtifact("CYP2D6 alleles, metabolizer phenotypes", COURSES, "Pharmacy"),
    "Pharmacy",
  );
});

test("🔴 the source folder overrides a folder the model wrote into the name, and does not nest under it", () => {
  // This is the exact shape that shipped the bug: the invented folder arrived
  // as part of deck_name, so "respect a name that already has a folder" was
  // what let it through. The leaf is kept; the invented parent is dropped.
  assert.equal(
    deckNameForNewDeck("Pharmacology::Pharmacogenomics", "CYP2D6 alleles", COURSES, "Pharmacy"),
    "Pharmacy::Pharmacogenomics",
  );
  // Deeper invention collapses the same way — never Pharmacy::A::B::Leaf.
  assert.equal(deckNameForNewDeck("A::B::Leaf", "", COURSES, "Pharmacy"), "Pharmacy::Leaf");
});

test("only the top segment of a source path is the course — the shelf below it is not", () => {
  assert.equal(sourceCourseFolder(["Pharmacy/Lectures"]), "Pharmacy");
  assert.equal(sourceCourseFolder(["PHCY 2114/Notes/Week 3"]), "PHCY 2114");
});

test("🔴 Inbox is not a course, so a deck from an unplaced file stays honestly unfiled", () => {
  // The other real deck that day came from a file sitting in Inbox. Inheriting
  // it would put "Inbox" on the Study page as though it were a subject; the
  // deck belongs at the top level until the student says otherwise.
  assert.equal(sourceCourseFolder(["Inbox"]), "");
  assert.equal(sourceCourseFolder(["Nemesis/Recordings"]), "");
  assert.equal(sourceCourseFolder([""]), "");
  assert.equal(
    deckNameForNewDeck("Diabetes Mellitus", "insulin resistance and the ominous octet", COURSES, sourceCourseFolder(["Inbox"])),
    "Diabetes Mellitus",
  );
});

test("attachments that disagree about the course are a tie, and a tie is a refusal", () => {
  assert.equal(sourceCourseFolder(["Pharmacy/Lectures", "Contracts"]), "");
  // An unplaced file alongside a filed one is not a disagreement — it is one
  // signal and one silence, so the signal stands.
  assert.equal(sourceCourseFolder(["Pharmacy/Lectures", "Inbox"]), "Pharmacy");
  // The same course twice is one course.
  assert.equal(sourceCourseFolder(["Pharmacy/Lectures", "Pharmacy/Slides"]), "Pharmacy");
});

test("with no source document, filing behaves exactly as it did before", () => {
  assert.equal(deckNameForNewDeck("Beta Blockers", "pharmacology beta blockers", COURSES, ""), "Pharmacology::Beta Blockers");
  assert.equal(deckNameForNewDeck("cardio::Beta Blockers", "pharmacology beta blockers", COURSES, ""), "cardio::Beta Blockers");
  assert.equal(groupForNewArtifact("mixed trivia round", COURSES, ""), "");
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

// ── The tokenizer regression, named the way the owner named it ───────────────
// Owner 2026-08-05: "PHCY 2114 must uniquely match PHCY 2114 · PHCY 1215 must
// not tie with PHCY 2114 · Bare PHCY or 'some PHCY reading' must remain
// ambiguous and stay in Inbox." The tests above cover the same ground by
// property; these three state each requirement on its own so a future change
// that breaks one is reported in the owner's own words.

test("🔴 PHCY 2114 uniquely matches PHCY 2114", () => {
  assert.equal(matchCourse("PHCY 2114", PHCY_COURSES)?.course, "PHCY 2114");
});

test("🔴 PHCY 1215 does not tie with PHCY 2114", () => {
  assert.equal(matchCourse("PHCY 1215", PHCY_COURSES)?.course, "PHCY 1215");
  // The scores are what actually tied. Before the fix `contentWords` required
  // every token to begin with a letter, so both course names reduced to the
  // single token {"phcy"} and scored 1 against ANY text mentioning either —
  // and a tie is a refusal, so nothing numbered could ever leave Inbox.
  assert.ok(
    courseScore("PHCY 1215", "PHCY 1215") > courseScore("PHCY 1215", "PHCY 2114"),
    "the course number is invisible to the matcher again",
  );
});

test("🔴 bare PHCY stays ambiguous and stays in Inbox", () => {
  assert.equal(matchCourse("PHCY", PHCY_COURSES), null);
  assert.equal(matchCourse("some PHCY reading", PHCY_COURSES), null);
  assert.equal(folderForNewItem("note", "some PHCY reading", PHCY_COURSES), FALLBACK_FOLDERS.note);
});

test("the real production filename files under its course", () => {
  // Verbatim from the accepted re-acceptance run: this upload landed in
  // `PHCY 2114` at 18:05:59 where its predecessor had landed in Inbox.
  assert.equal(
    folderForNewItem("note", "Antimicrobial Stewardship (PHCY 2114 L5).md", PHCY_COURSES),
    "PHCY 2114/Notes",
  );
});

// ── Separators are word breaks ──────────────────────────────────────────────
// The second half of the invisible-course-number bug. #413 fixed the rule that
// hid `2114`; this is the same defect through another door, and it is the shape
// every LMS export and browser download actually has.

const SYLLABI = [
  ["Fall-2026-PHCY-2105-01-Interprofessional-Education-and-Clinical-Simulation-III.pdf", "PHCY 2105"],
  ["Fall-2026-PHCY-2109-01-Pharmacogenomics-for-the-Pharmacist.pdf", "PHCY 2109"],
  ["Fall-2026-PHCY-2114-01-Principles-of-Medical-Microbiology-and-Immunology.pdf", "PHCY 2114"],
  ["Fall-2026-PHCY-2119-01-Integrated-Pharmacotherapy-4.pdf", "PHCY 2119"],
] as const;

test("🔴 a hyphenated filename files under its course", () => {
  // These four are the student's real syllabi, and every one of them scored
  // ZERO against all six courses beforehand — a hyphenated run read as one
  // enormous word, so neither `phcy` nor `2105` was ever a token.
  for (const [fileName, course] of SYLLABI) {
    assert.equal(matchCourse(fileName, PHCY_COURSES)?.course, course, fileName);
  }
});

test("underscores and dots break words too", () => {
  assert.equal(matchCourse("PHCY_2109_lecture_1.pptx", PHCY_COURSES)?.course, "PHCY 2109");
  assert.equal(matchCourse("phcy.2119.week3.notes.pdf", PHCY_COURSES)?.course, "PHCY 2119");
});

test("🔴 splitting separators does not weaken a single refusal", () => {
  // The whole risk of widening a matcher is a new false match. Every refusal
  // the owner named on 2026-08-05 is re-checked here after the change.
  assert.equal(matchCourse("PHCY", PHCY_COURSES), null);
  assert.equal(matchCourse("some PHCY reading", PHCY_COURSES), null);
  assert.equal(matchCourse("PHCY 9999 mystery handout", PHCY_COURSES), null);
  assert.equal(matchCourse("phcy-notes-from-today.pdf", PHCY_COURSES), null, "a hyphenated bare prefix is still ambiguous");
  assert.equal(matchCourse("lecture-photo.png", PHCY_COURSES), null);
  assert.equal(matchCourse("Untitled-document.pdf", PHCY_COURSES), null);
});

test("a hyphenated course name matches its own hyphenated file", () => {
  const named = ["Advanced Contract Law", "Thermodynamics II"];
  assert.equal(matchCourse("advanced-contract-law-week-2.docx", named)?.course, "Advanced Contract Law");
});
