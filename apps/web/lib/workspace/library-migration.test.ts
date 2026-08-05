// Phase 2 item 2, checked against the Library that actually exists.
//
// The fixture below is the production account on 2026-08-05, read straight out
// of `readable_library_documents` and `library_sources`: the legacy Nemesis
// folders with their three folder pages, three recordings about cars and
// start-ups, a biology note, four blank root notes, the four Fall 2026 syllabi
// sitting loose at the Library root, and what is still waiting in Inbox.
//
// 🔴 Most of it SHOULD NOT MOVE, and that is the finding rather than a failure.
// A recording about the Corvette ZR1X belongs to no course, and filing it under
// one to make the number look better would put it where the student would never
// think to look. The tests below assert the refusals as firmly as the moves.

import assert from "node:assert/strict";
import test from "node:test";

import { courseScore, matchCourse } from "@nemesis/shared";

import {
  looseText,
  migrationSummary,
  planLibraryMigration,
  type MigratableNote,
  type MigratableSource,
} from "./library-migration";

const COURSES = ["PHCY 1215", "PHCY 1218", "PHCY 2105", "PHCY 2109", "PHCY 2114", "PHCY 2119"];

const note = (path: string, title: string, content = "", kind = "note"): MigratableNote => ({
  content,
  id: `note:${path}`,
  kind,
  path,
  title,
});

const NOTES: MigratableNote[] = [
  note("Nemesis/Nemesis.md", "Nemesis"),
  note("Nemesis/Notes/Notes.md", "Notes"),
  note("Nemesis/Notes/Krebs Cycle Summary.md", "Krebs Cycle Summary", "# Krebs Cycle (Citric Acid Cycle / TCA Cycle)\n\n## Where & When\n- Location: Mitochondrial matrix"),
  note("Nemesis/Recordings/Recordings.md", "Recordings"),
  note("Nemesis/Recordings/Corvette ZR1X Reveal at National Corvette Museum.md", "Corvette ZR1X Reveal at National Corvette Museum", "The session was the live reveal of the new Corvette ZR1X"),
  note("Nemesis/Recordings/Boring Businesses That Quietly Print Money.md", "Boring Businesses That Quietly Print Money", "This session challenged the glamorous founder-on-a-stage image"),
  note("Nemesis/Recordings/Tesla Model Y L Interior Features and Space Walkthrough.md", "Tesla Model Y L Interior Features and Space Walkthrough", "This session walked through the interior of the Tesla Model Y L"),
  note("Inbox/Inbox.md", "Inbox"),
  note("Inbox/Antibiotic Resistance Mechanisms (PHCY 2114 L4).md", "Antibiotic Resistance Mechanisms (PHCY 2114 L4)", "# Antibiotic Resistance Mechanisms\n\nPHCY 2114 — Principles of Medical Microbiology and Immunology\n\nsource:inbox-l4"),
  note("Inbox/Reminder Notes.md", "Reminder Notes", "Things to remember:\n\n- Ask about the deadline extension"),
  note("hello.md", "hello"),
  note("test.md", "test"),
  note("Untitled note.md", "Untitled note", "# this is test note"),
  note("Untitled note 22.md", "Untitled note 22"),
];

const SOURCES: MigratableSource[] = [
  { fileName: "Fall-2026-PHCY-2105-01-Interprofessional-Education-and-Clinical-Simulation-III.pdf", folderPath: "", id: "syllabus-2105" },
  { fileName: "Fall-2026-PHCY-2109-01-Pharmacogenomics-for-the-Pharmacist.pdf", folderPath: "", id: "syllabus-2109" },
  { fileName: "Fall-2026-PHCY-2114-01-Principles-of-Medical-Microbiology-and-Immunology.pdf", folderPath: "", id: "syllabus-2114" },
  { fileName: "Fall-2026-PHCY-2119-01-Integrated-Pharmacotherapy-4.pdf", folderPath: "", id: "syllabus-2119" },
  { fileName: "PHCY 2114 Lecture 4 Antibiotic Resistance.md", folderPath: "Inbox", id: "inbox-l4" },
  { fileName: "Untitled document.pdf", folderPath: "Inbox", id: "inbox-untitled" },
  { fileName: "lecture-photo.png", folderPath: "Inbox", id: "inbox-photo" },
  { fileName: "PHCY 2114 Lecture 5 Antimicrobial Stewardship.md", folderPath: "PHCY 2114", id: "already-filed" },
];

const plan = () => planLibraryMigration({ courses: COURSES, notes: NOTES, sources: SOURCES });

// ── The four syllabi at the Library root ────────────────────────────────────

test("🔴 each Fall 2026 syllabus goes to its own course", () => {
  const byId = new Map(plan().moves.map((move) => [move.id, move.to]));
  assert.equal(byId.get("syllabus-2105"), "PHCY 2105");
  assert.equal(byId.get("syllabus-2109"), "PHCY 2109");
  assert.equal(byId.get("syllabus-2114"), "PHCY 2114");
  assert.equal(byId.get("syllabus-2119"), "PHCY 2119");
});

test("🔴 hyphens are word breaks — without that the syllabi match NOTHING", () => {
  // `Fall-2026-PHCY-2105-01-…` scores zero against all six courses: the
  // tokenizer reads a hyphenated run as one enormous word, so the number 2105
  // is inside a token instead of being one. This is the same class of failure
  // as the leading-letter rule the owner had fixed on 2026-08-05, reached
  // through a different door.
  const raw = SOURCES[0]!.fileName;
  assert.equal(matchCourse(raw, COURSES), null, "the shared matcher can read hyphenated filenames now");
  for (const course of COURSES) assert.equal(courseScore(raw, course), 0, course);
  // Loosened, the same name matches exactly one course, with a clear margin.
  assert.equal(matchCourse(looseText(raw), COURSES)?.course, "PHCY 2105");
  assert.equal(courseScore(looseText(raw), "PHCY 2105"), 2);
  assert.equal(courseScore(looseText(raw), "PHCY 2114"), 1);
});

// ── Inbox, and keeping a note with the file it came from ────────────────────

test("a recognisable Inbox note moves to its course's Notes folder", () => {
  const move = plan().moves.find((entry) => entry.id === "note:Inbox/Antibiotic Resistance Mechanisms (PHCY 2114 L4).md");
  assert.equal(move?.to, "PHCY 2114/Notes/Antibiotic Resistance Mechanisms (PHCY 2114 L4).md");
});

test("🔴 the original file follows the note that was made from it", () => {
  // "Preserve source-file relationships." A note filed under PHCY 2114 whose
  // source pill still points at Inbox is a half-done move the student did not
  // ask for. The note cites the source's id in its own body, which is the link.
  const move = plan().moves.find((entry) => entry.id === "inbox-l4");
  assert.equal(move?.to, "PHCY 2114");
  assert.match(move?.why ?? "", /was made from it/);
});

test("a source already sitting in its course is not proposed again", () => {
  assert.equal(plan().moves.some((move) => move.id === "already-filed"), false);
});

// ── What must stay exactly where it is ──────────────────────────────────────

test("🔴 a folder's own page never moves — it would leave the folder nameless", () => {
  const pages = ["note:Nemesis/Nemesis.md", "note:Nemesis/Notes/Notes.md", "note:Nemesis/Recordings/Recordings.md", "note:Inbox/Inbox.md"];
  for (const id of pages) {
    assert.equal(plan().moves.some((move) => move.id === id), false, id);
  }
  assert.equal(
    plan().leave_alone.filter((skip) => /IS its folder/.test(skip.reason)).length,
    4,
  );
});

test("🔴 recordings that belong to no course are left alone, not filed on a hunch", () => {
  const left = plan().leave_alone.map((skip) => skip.label);
  assert.ok(left.includes("Corvette ZR1X Reveal at National Corvette Museum"));
  assert.ok(left.includes("Boring Businesses That Quietly Print Money"));
  assert.ok(left.includes("Tesla Model Y L Interior Features and Space Walkthrough"));
});

test("a biology note that names no course of theirs stays put", () => {
  // The student's courses are stored as bare numbers ("PHCY 2114"), so nothing
  // in a Krebs cycle summary points at one. Guessing "it is science, put it in
  // microbiology" is exactly the guess that loses a student's note.
  assert.ok(plan().leave_alone.some((skip) => skip.label === "Krebs Cycle Summary"));
});

test("blank and scratch notes at the root are left alone", () => {
  const left = plan().leave_alone.map((skip) => skip.label);
  for (const label of ["hello", "test", "Untitled note", "Untitled note 22"]) assert.ok(left.includes(label), label);
});

test("an unnamed upload and a photo stay in Inbox", () => {
  const left = plan().leave_alone.map((skip) => skip.label);
  assert.ok(left.includes("Untitled document.pdf"));
  assert.ok(left.includes("lecture-photo.png"));
});

test("a folder row is never treated as a note", () => {
  const withFolder = planLibraryMigration({
    courses: COURSES,
    notes: [{ content: null, id: "f", kind: "folder", path: "test", title: "test" }],
    sources: [],
  });
  assert.equal(withFolder.moves.length, 0);
});

// ── Never overwrite, and safe to rerun ──────────────────────────────────────

test("🔴 a match whose destination is taken is BLOCKED, never overwritten", () => {
  const withCollision = planLibraryMigration({
    courses: COURSES,
    notes: [
      note("Inbox/PHCY 2114 Week 1.md", "PHCY 2114 Week 1"),
      note("PHCY 2114/Notes/PHCY 2114 Week 1.md", "PHCY 2114 Week 1", "the one already filed"),
    ],
    sources: [],
  });
  assert.equal(withCollision.moves.length, 0);
  assert.equal(withCollision.blocked.length, 1);
  assert.match(withCollision.blocked[0]?.reason ?? "", /nothing was overwritten/);
});

test("two legacy notes with one title cannot both claim the same destination", () => {
  const twins = planLibraryMigration({
    courses: COURSES,
    notes: [note("Inbox/PHCY 2114 Week 1.md", "PHCY 2114 Week 1"), note("Nemesis/Notes/PHCY 2114 Week 1.md", "PHCY 2114 Week 1")],
    sources: [],
  });
  assert.equal(twins.moves.length, 1);
  assert.equal(twins.blocked.length, 1);
});

test("🔴 running it again after the moves land proposes nothing", () => {
  // Idempotency with no migration table: proposals come from where things are
  // NOW, so anything already filed simply stops being legacy.
  const first = plan();
  const movedNotes = NOTES.map((entry) => {
    const move = first.moves.find((candidate) => candidate.id === entry.id);
    return move ? { ...entry, path: move.to } : entry;
  });
  const movedSources = SOURCES.map((entry) => {
    const move = first.moves.find((candidate) => candidate.id === entry.id);
    return move ? { ...entry, folderPath: move.to } : entry;
  });
  const second = planLibraryMigration({ courses: COURSES, notes: movedNotes, sources: movedSources });
  assert.equal(second.moves.length, 0);
  assert.equal(second.blocked.length, 0);
  // A third run agrees with the second — it has converged, not oscillated.
  const third = planLibraryMigration({ courses: COURSES, notes: movedNotes, sources: movedSources });
  assert.deepEqual(third, second);
});

// ── What the student is told ────────────────────────────────────────────────

test("the summary counts what the plan actually holds", () => {
  const current = plan();
  assert.match(migrationSummary(current), new RegExp(`^${current.moves.length} items can be filed`));
  assert.match(migrationSummary(current), /left alone/);
});

test("an already-tidy Library says so instead of inventing work", () => {
  const tidy = planLibraryMigration({ courses: COURSES, notes: [note("PHCY 2114/Notes/Week 1.md", "Week 1")], sources: [] });
  assert.equal(tidy.moves.length, 0);
  assert.match(migrationSummary(tidy), /Nothing to move/);
});

test("the whole production Library resolves to six moves and no overwrites", () => {
  const current = plan();
  assert.equal(current.moves.length, 6, current.moves.map((move) => `${move.from} → ${move.to}`).join("; "));
  assert.equal(current.blocked.length, 0);
  assert.ok(current.leave_alone.length >= 11);
});
