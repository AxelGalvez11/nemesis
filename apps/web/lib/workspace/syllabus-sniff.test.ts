import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sniffsAsSyllabus } from "./syllabus-sniff";

const pad = (text: string) => text + "\nCourse material continues here. ".repeat(80);

describe("sniffsAsSyllabus", () => {
  it("recognizes the word syllabus alone", () => {
    assert.equal(sniffsAsSyllabus(pad("PHCY 2109 Syllabus — Fall 2026. Welcome to the course.")), true);
  });

  it("recognizes three structural markers without the word", () => {
    const text = pad(
      "PHCY 2119 Integrated Pharmacotherapy 4 | Fall 2026 Course Description: builds on IP3. " +
      "Grading: exams 60%, quizzes 20%. Office hours: Tuesdays 2-4pm by appointment.",
    );
    assert.equal(sniffsAsSyllabus(text), true);
  });

  it("works for a law course document the same way", () => {
    const text = pad(
      "Contracts I — Course Description: formation, consideration, remedies. " +
      "Attendance policy: two unexcused absences permitted. Required textbook: Farnsworth on Contracts.",
    );
    assert.equal(sniffsAsSyllabus(text), true);
  });

  it("does not fire on a lecture with one or two incidental markers", () => {
    const text = pad(
      "Lecture 8: Beta blockers. Learning objectives: describe receptor selectivity. " +
      "Prerequisites for understanding: review autonomic pharmacology from last week.",
    );
    assert.equal(sniffsAsSyllabus(text), false);
  });

  it("does not fire on an essay or short snippet", () => {
    assert.equal(sniffsAsSyllabus("Grading rubrics have a long history in education."), false);
    assert.equal(sniffsAsSyllabus(pad("The history of the Roman senate, part one, continued at length.")), false);
  });

  it("ignores markers buried deep in a long non-syllabus document", () => {
    const lecture = "Slide content about thermodynamics and entropy. ".repeat(400);
    const tail = "grading office hours course description academic integrity";
    assert.equal(sniffsAsSyllabus(lecture + tail), false);
  });
});
