import assert from "node:assert/strict";
import { test } from "node:test";

import {
  coursesFromScan,
  describePlan,
  eventsFromScan,
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
