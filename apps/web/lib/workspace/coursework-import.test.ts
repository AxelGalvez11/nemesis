import assert from "node:assert/strict";
import { test } from "node:test";

import {
  coursesByTerm,
  coursesFromScan,
  describePlan,
  documentFolderPath,
  documentKey,
  documentsFromScan,
  eventsFromScan,
  newestTermCourseNames,
  planImport,
  syllabusLinksFromScan,
} from "@/lib/workspace/coursework-import";
import type { LmsScan } from "@nemesis/shared";

/** Shaped like a real Blackboard Ultra reading. */
const SCAN: LmsScan = {
  courses: [
    {
      code: "PHCY2119_44999_202640",
      items: [
        { dueDate: "2026-08-01", dueTime: "23:59", kind: "assignment", title: "Pre-Lab 4" },
        { dueDate: "2026-08-05", kind: "exam", title: "Quiz 5" },
        { kind: "other", title: "Reading with no date" },
      ],
      name: "Fall 2026: Integrated Pharmacotherapy 4",
      syllabusLinks: [{ label: "Syllabus", url: "https://x.edu/s.pdf" }],
    },
    {
      items: [{ dueDate: "2026-09-01", kind: "assignment", title: "Essay" }],
      name: "Fall 2026: Prnc of Med Microb",
      syllabusLinks: [],
    },
  ],
  lms: "blackboard",
  scannedAt: "2026-07-31T12:00:00.000Z",
};

let counter = 0;
const newId = () => `id-${(counter += 1)}`;

test("only picked courses become folders", () => {
  assert.deepEqual(coursesFromScan(SCAN, new Set(["Fall 2026: Prnc of Med Microb"])), [
    "Fall 2026: Prnc of Med Microb",
  ]);
  assert.deepEqual(coursesFromScan(SCAN, new Set()), []);
  assert.deepEqual(coursesFromScan(null, new Set(["anything"])), []);
});

test("dated rows become events stamped with their course", () => {
  counter = 0;
  const events = eventsFromScan(SCAN, new Set(["Fall 2026: Integrated Pharmacotherapy 4"]), newId);
  assert.equal(events.length, 2);
  assert.equal(events[0]?.title, "Pre-Lab 4");
  assert.equal(events[0]?.course, "Fall 2026: Integrated Pharmacotherapy 4");
  assert.equal(events[0]?.time, "23:59");
  assert.equal(events[1]?.kind, "exam");
  assert.equal(events[1]?.time, undefined);
});

test("AN UNDATED ROW NEVER GETS AN INVENTED DAY", () => {
  // The whole reason a calendar import can be trusted: a guessed deadline is
  // worse than a missing one, because the student cannot see that it is wrong.
  counter = 0;
  const events = eventsFromScan(SCAN, new Set(["Fall 2026: Integrated Pharmacotherapy 4"]), newId);
  assert.equal(events.some((event) => event.title === "Reading with no date"), false);
});

test("every event carries where it came from", () => {
  counter = 0;
  const events = eventsFromScan(SCAN, new Set(["Fall 2026: Prnc of Med Microb"]), newId);
  assert.match(events[0]?.note ?? "", /school portal/);
});

test("syllabus files are collected per picked course", () => {
  const links = syllabusLinksFromScan(SCAN, new Set(["Fall 2026: Integrated Pharmacotherapy 4"]));
  assert.equal(links.length, 1);
  assert.equal(links[0]?.course, "Fall 2026: Integrated Pharmacotherapy 4");
  assert.equal(syllabusLinksFromScan(SCAN, new Set(["Fall 2026: Prnc of Med Microb"])).length, 0);
});

test("the plan counts undated rows separately", () => {
  counter = 0;
  const plan = planImport(SCAN, new Set(SCAN.courses.map((course) => course.name)), newId);
  assert.equal(plan.courses.length, 2);
  assert.equal(plan.events.length, 3);
  assert.equal(plan.undated, 1);
});

test("the description says what actually happens, in plain words", () => {
  counter = 0;
  const plan = planImport(SCAN, new Set(SCAN.courses.map((course) => course.name)), newId);
  const text = describePlan(plan);
  assert.match(text, /2 folders in your Library/);
  assert.match(text, /3 dates on your calendar/);
  assert.match(text, /1 item has no due date/);
});

test("an empty selection says so rather than describing nothing", () => {
  counter = 0;
  assert.equal(describePlan(planImport(SCAN, new Set(), newId)), "Nothing selected.");
});

test("singular wording when there is one of each", () => {
  counter = 0;
  const plan = planImport(SCAN, new Set(["Fall 2026: Prnc of Med Microb"]), newId);
  const text = describePlan(plan);
  assert.match(text, /1 folder in your Library/);
  assert.match(text, /1 date on your calendar/);
  assert.equal(/items have/.test(text), false);
});

test("ids are never reused across events", () => {
  counter = 0;
  const events = eventsFromScan(SCAN, new Set(SCAN.courses.map((course) => course.name)), newId);
  assert.equal(new Set(events.map((event) => event.id)).size, events.length);
});

// ── Documents found by crawling into a course ────────────────────────────────

const WITH_DOCS: LmsScan = {
  courses: [
    {
      documents: [
        { folder: ["Week 3", "Lectures"], kind: "file", title: "Enzyme kinetics", fileType: "pdf" },
        { folder: ["Week 3", "Lectures"], kind: "file", title: "Slides 3b", fileType: "pptx" },
        { folder: ["Week 3"], kind: "page", title: "Overview" },
        { folder: [], kind: "file", title: "Course handbook", fileType: "pdf" },
      ],
      items: [],
      name: "Integrated Pharmacotherapy 4",
      syllabusLinks: [],
    },
    { documents: [{ folder: ["Unit 1"], kind: "file", title: "Reading" }], items: [], name: "Med Microb", syllabusLinks: [] },
  ],
  lms: "blackboard",
  scannedAt: "2026-07-31T12:00:00.000Z",
};

const bothCourses = new Set(WITH_DOCS.courses.map((c) => c.name));

test("a document lands under its course, then the portal's own folders", () => {
  const docs = documentsFromScan(WITH_DOCS, new Set(["Integrated Pharmacotherapy 4"]));
  assert.equal(docs[0]?.folderPath, "Integrated Pharmacotherapy 4/Week 3/Lectures");
  assert.equal(docs[3]?.folderPath, "Integrated Pharmacotherapy 4", "a root document sits in the course folder");
});

test("EVERY ANCESTOR FOLDER IS CREATED, not just the deepest", () => {
  // "A/B/C" needs A and A/B to exist or the write fails halfway down.
  const plan = planImport(WITH_DOCS, new Set(["Integrated Pharmacotherapy 4"]), newId);
  assert.deepEqual(plan.folders, [
    "Integrated Pharmacotherapy 4",
    "Integrated Pharmacotherapy 4/Week 3",
    "Integrated Pharmacotherapy 4/Week 3/Lectures",
  ]);
});

test("shared folders are asked for once, and parents come first", () => {
  const plan = planImport(WITH_DOCS, bothCourses, newId);
  assert.equal(new Set(plan.folders).size, plan.folders.length, "no duplicates");
  const depth = plan.folders.map((f) => f.split("/").length);
  assert.deepEqual([...depth].sort((a, b) => a - b), depth, "shallowest first");
});

test("a course with no documents field contributes only its own folder", () => {
  const plan = planImport(SCAN, new Set(["Fall 2026: Prnc of Med Microb"]), newId);
  assert.deepEqual(plan.folders, ["Fall 2026: Prnc of Med Microb"]);
  assert.deepEqual(plan.documents, []);
});

test("picking no documents explicitly is different from not picking at all", () => {
  const all = documentsFromScan(WITH_DOCS, bothCourses);
  assert.equal(all.length, 5, "absent means every document");
  const none = documentsFromScan(WITH_DOCS, bothCourses, new Set());
  assert.equal(none.length, 0, "an empty picked set means none");
});

test("one document can be picked out of a course by key", () => {
  const key = documentKey("Med Microb", "Reading");
  const docs = documentsFromScan(WITH_DOCS, bothCourses, new Set([key]));
  assert.equal(docs.length, 1);
  assert.equal(docs[0]?.title, "Reading");
});

test("🔴 A FOLDER NAME CANNOT ESCAPE ITS OWN PATH", () => {
  assert.equal(documentFolderPath("A/B", ["../x"]), "A B/.. x");
  assert.equal(documentFolderPath("Course", ["a\\b"]), "Course/a b");
});

test("the description counts folders and documents, not just courses", () => {
  const plan = planImport(WITH_DOCS, new Set(["Integrated Pharmacotherapy 4"]), newId);
  const text = describePlan(plan);
  assert.match(text, /3 folders in your Library/);
  assert.match(text, /4 documents/);
});

// ── Terms ────────────────────────────────────────────────────────────────────

/** A student partway through a degree: two live courses, one finished, one the
 *  portal never named a term for. */
const MANY_TERMS: LmsScan = {
  courses: [
    { items: [], name: "Anatomy", syllabusLinks: [], term: "Spring 2025" },
    { items: [], name: "Independent Study", syllabusLinks: [] },
    { items: [], name: "Pharmacotherapy", syllabusLinks: [], term: "Spring 2026" },
    { items: [], name: "Ethics", syllabusLinks: [], term: "Spring 2026" },
  ],
  lms: "blackboard",
  scannedAt: "2026-08-04T00:00:00.000Z",
};

test("courses group by term, newest first, unknowns last", () => {
  assert.deepEqual(
    coursesByTerm(MANY_TERMS).map((group) => [group.term, group.courses.map((course) => course.name)]),
    [
      ["Spring 2026", ["Pharmacotherapy", "Ethics"]],
      ["Spring 2025", ["Anatomy"]],
      [null, ["Independent Study"]],
    ],
  );
});

test("🔴 SORTED BY YEAR, NOT ALPHABETICALLY", () => {
  // "Fall 2026" sorts BEFORE "Spring 2025" as text, which would put last year
  // at the top of the picker and hand the student the wrong default.
  const scan: LmsScan = {
    ...MANY_TERMS,
    courses: [
      { items: [], name: "Old", syllabusLinks: [], term: "Spring 2025" },
      { items: [], name: "New", syllabusLinks: [], term: "Fall 2026" },
    ],
  };
  assert.deepEqual(coursesByTerm(scan).map((group) => group.term), ["Fall 2026", "Spring 2025"]);
});

test("the picker arrives with the newest term ticked, not everything", () => {
  // The whole point: 31 courses of a degree must not all be ticked to get at
  // this semester's handful.
  assert.deepEqual(newestTermCourseNames(MANY_TERMS), ["Pharmacotherapy", "Ethics"]);
});

test("when nothing names a term, everything is ticked", () => {
  // No grouping to lean on, so "all" is the only honest default — better than
  // silently picking none and looking broken.
  const scan: LmsScan = {
    ...MANY_TERMS,
    courses: [
      { items: [], name: "Welding", syllabusLinks: [] },
      { items: [], name: "Contract Law", syllabusLinks: [] },
    ],
  };
  assert.deepEqual(newestTermCourseNames(scan), ["Welding", "Contract Law"]);
  assert.deepEqual(coursesByTerm(null), []);
});
