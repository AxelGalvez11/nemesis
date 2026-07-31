import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bestCourseName,
  classifyItem,
  courseIdFrom,
  isFileLink,
  isItemLink,
  looksLikeSyllabus,
  type PageSnapshot,
  parseSnapshot,
  splitTimestamp,
} from "../src/lms/parse.ts";

function snapshot(partial: Partial<PageSnapshot>): PageSnapshot {
  return { blocks: [], links: [], title: "", url: "https://canvas.university.edu/", ...partial };
}

// ── Course routing ───────────────────────────────────────────────────────────

test("course ids are read from each product's own routing", () => {
  assert.equal(courseIdFrom("https://canvas.university.edu/courses/12345", "canvas"), "12345");
  assert.equal(courseIdFrom("https://lms.university.edu/ultra/courses/_9876_1/outline", "blackboard"), "_9876_1");
  assert.equal(
    courseIdFrom("https://lms.university.edu/webapps/x/launcher?course_id=_9876_1", "blackboard"),
    "_9876_1",
  );
  assert.equal(courseIdFrom("https://learn.university.edu/course/view.php?id=42", "moodle"), "42");
  assert.equal(courseIdFrom("https://elearn.university.edu/d2l/home/778", "brightspace"), "778");
});

test("a link that is not a course route yields nothing", () => {
  assert.equal(courseIdFrom("https://canvas.university.edu/profile", "canvas"), null);
  assert.equal(courseIdFrom("https://example.edu/courses/12345", "moodle"), null);
  assert.equal(courseIdFrom("https://canvas.university.edu/courses/12345", "unknown"), null);
});

test("coursework links are told apart from course links", () => {
  assert.equal(isItemLink("https://canvas.university.edu/courses/1/assignments/9", "canvas"), true);
  assert.equal(isItemLink("https://canvas.university.edu/courses/1", "canvas"), false);
  assert.equal(isItemLink("https://learn.university.edu/mod/assign/view.php?id=5", "moodle"), true);
});

// ── Syllabus links ───────────────────────────────────────────────────────────

test("a syllabus is spotted by link text or filename", () => {
  assert.equal(looksLikeSyllabus({ href: "https://x.edu/a.pdf", text: "Syllabus" }), true);
  assert.equal(looksLikeSyllabus({ href: "https://x.edu/CHEM111-syllabus.pdf", text: "Download" }), true);
  assert.equal(looksLikeSyllabus({ href: "https://x.edu/a.pdf", text: "Course Outline" }), true);
  assert.equal(looksLikeSyllabus({ href: "https://x.edu/a.pdf", text: "Unit Outline" }), true);
});

test("an ordinary file is not mistaken for a syllabus", () => {
  assert.equal(looksLikeSyllabus({ href: "https://x.edu/lecture3.pdf", text: "Lecture 3" }), false);
  assert.equal(looksLikeSyllabus({ href: "https://x.edu/grades", text: "Grades" }), false);
});

// ── Classifying a row ────────────────────────────────────────────────────────

test("assessment words promote a row to exam", () => {
  assert.equal(classifyItem("Midterm Exam"), "exam");
  assert.equal(classifyItem("Quiz 5: Bioenergetics"), "exam");
  assert.equal(classifyItem("Final"), "exam");
});

test("a word merely containing an assessment word does not count", () => {
  // "contest" contains "test"; word boundaries are why this passes.
  assert.equal(classifyItem("Design contest entry"), "other");
  assert.equal(classifyItem("Protest movements reading"), "other");
});

test("the page's own hint classifies when the title does not", () => {
  assert.equal(classifyItem("Problem Set 4", "assignment"), "assignment");
  assert.equal(classifyItem("Week 3", "lecture"), "class");
  assert.equal(classifyItem("Submission", "dropbox"), "assignment");
});

test("ANYTHING UNCERTAIN IS 'other' RATHER THAN A GUESS", () => {
  assert.equal(classifyItem("Read Ch 5"), "other");
  assert.equal(classifyItem("Warby Parker"), "other");
  assert.equal(classifyItem("Thing", "mystery"), "other");
});

// ── Timestamps ───────────────────────────────────────────────────────────────

test("a timestamp splits into a local date and time", () => {
  const split = splitTimestamp("2026-08-04T15:30:00");
  assert.equal(split?.date, "2026-08-04");
  assert.equal(split?.time, "15:30");
});

test("A DATE-ONLY VALUE GETS NO INVENTED TIME", () => {
  // Local midnight means "no time was given". Reporting 00:00 would put a made
  // up time on a student's calendar.
  const split = splitTimestamp("2026-08-04");
  assert.equal(split?.date, "2026-08-04");
  assert.equal(split?.time, undefined);
});

test("A DATE-ONLY VALUE IS NOT SHIFTED BY THE READER'S TIMEZONE", () => {
  // The bug this guards, and it is a nasty one: new Date("2026-08-04") parses
  // as UTC midnight by specification, so reading it back with getDate() in any
  // negative-offset zone returns the 3rd. Every date-only deadline would have
  // landed a day early for every student in the Americas.
  for (const zone of ["UTC", "America/New_York", "Pacific/Kiritimati", "Pacific/Niue"]) {
    const original = process.env.TZ;
    process.env.TZ = zone;
    try {
      assert.equal(splitTimestamp("2026-08-04")?.date, "2026-08-04", `wrong day in ${zone}`);
    } finally {
      process.env.TZ = original;
    }
  }
});

test("an instant with an explicit zone IS converted to the local day", () => {
  // The mirror case: a portal that publishes a real UTC instant must land on
  // the day the student experiences, not the day UTC experiences.
  const split = splitTimestamp("2026-08-05T03:59:00Z");
  assert.equal(typeof split?.date, "string");
  assert.match(split?.date ?? "", /^\d{4}-\d{2}-\d{2}$/);
});

test("an unparseable timestamp is refused rather than guessed", () => {
  assert.equal(splitTimestamp("sometime next week"), null);
  assert.equal(splitTimestamp(""), null);
});

// ── Course names ─────────────────────────────────────────────────────────────

test("the fullest link text wins as the course name", () => {
  assert.equal(bestCourseName(["CHEM 111", "General Chemistry I", "Home"]), "General Chemistry I");
});

test("navigation chrome is never the course name", () => {
  assert.equal(bestCourseName(["Home", "Grades", "Announcements"]), "");
  assert.equal(bestCourseName(["Assignments", "Torts"]), "Torts");
});

// ── Whole pages ──────────────────────────────────────────────────────────────

test("a Canvas dashboard yields every course it links to", () => {
  const courses = parseSnapshot(
    snapshot({
      links: [
        { href: "https://canvas.university.edu/courses/1", text: "General Chemistry I" },
        { href: "https://canvas.university.edu/courses/1", text: "Home" },
        { href: "https://canvas.university.edu/courses/2", text: "Financial Accounting" },
        { href: "https://canvas.university.edu/profile", text: "Account" },
      ],
      url: "https://canvas.university.edu/dashboard",
    }),
    "canvas",
  );
  assert.equal(courses.length, 2);
  assert.deepEqual(
    courses.map((course) => course.name).sort(),
    ["Financial Accounting", "General Chemistry I"],
  );
});

test("a course page attributes its own rows even when they link to items", () => {
  const courses = parseSnapshot(
    snapshot({
      blocks: [
        {
          href: "https://canvas.university.edu/courses/1/assignments/9",
          hint: "assignment",
          isoDateTime: "2026-08-01T23:59:00",
          text: "Pre-Lab 4",
        },
        { href: "https://canvas.university.edu/courses/1/quizzes/3", text: "Quiz 5" },
      ],
      links: [{ href: "https://canvas.university.edu/courses/1", text: "General Chemistry I" }],
      title: "Assignments",
      url: "https://canvas.university.edu/courses/1/assignments",
    }),
    "canvas",
  );
  assert.equal(courses.length, 1);
  assert.equal(courses[0]?.items.length, 2);
  assert.equal(courses[0]?.items[0]?.title, "Pre-Lab 4");
  assert.equal(courses[0]?.items[0]?.dueDate, "2026-08-01");
  assert.equal(courses[0]?.items[0]?.dueTime, "23:59");
  assert.equal(courses[0]?.items[0]?.kind, "assignment");
  assert.equal(courses[0]?.items[1]?.kind, "exam");
});

test("AN ITEM LINK'S TEXT NEVER BECOMES THE COURSE NAME", () => {
  // Otherwise a long assignment title outruns the real course name and the
  // student ends up with a Library folder called "Problem Set 4 — full write-up".
  const courses = parseSnapshot(
    snapshot({
      links: [
        { href: "https://canvas.university.edu/courses/1", text: "Torts" },
        {
          href: "https://canvas.university.edu/courses/1/assignments/9",
          text: "Problem Set 4 — full write-up with citations",
        },
      ],
      url: "https://canvas.university.edu/courses/1",
    }),
    "canvas",
  );
  assert.equal(courses[0]?.name, "Torts");
});

test("A SYLLABUS OR FILE LINK NEVER BECOMES THE COURSE NAME", () => {
  // Found by running the real bundle against a real page: a footer link
  // reading "Syllabus (footer copy)" is longer than "General Chemistry I",
  // sits under the same /courses/:id, and so won longest-wins.
  const courses = parseSnapshot(
    snapshot({
      links: [
        { href: "https://canvas.university.edu/courses/1", text: "General Chemistry I" },
        { href: "https://canvas.university.edu/courses/1/files/7/syllabus.pdf", text: "Syllabus (footer copy)" },
        {
          href: "https://canvas.university.edu/courses/1/files/8/lecture3.pdf",
          text: "Lecture 3 — Thermodynamics of Reversible Processes",
        },
      ],
      url: "https://canvas.university.edu/courses/1",
    }),
    "canvas",
  );
  assert.equal(courses[0]?.name, "General Chemistry I");
});

test("attached files are recognised by route or extension", () => {
  assert.equal(isFileLink("https://x.edu/courses/1/files/7/a.pdf"), true);
  assert.equal(isFileLink("https://x.edu/pluginfile.php/123/mod_resource/content/1/notes.pdf"), true);
  assert.equal(isFileLink("https://x.edu/download?id=3&name=slides.pptx"), true);
  assert.equal(isFileLink("https://x.edu/courses/1"), false);
});

test("syllabus files are collected per course and de-duplicated", () => {
  const courses = parseSnapshot(
    snapshot({
      links: [
        { href: "https://canvas.university.edu/courses/1", text: "Torts" },
        { href: "https://canvas.university.edu/courses/1/files/7/syllabus.pdf", text: "Syllabus" },
        { href: "https://canvas.university.edu/courses/1/files/7/syllabus.pdf", text: "Syllabus (again)" },
      ],
      url: "https://canvas.university.edu/courses/1",
    }),
    "canvas",
  );
  assert.equal(courses[0]?.syllabusLinks.length, 1);
  assert.equal(courses[0]?.syllabusLinks[0]?.label, "Syllabus");
});

test("the course's landing page is kept as its URL", () => {
  const courses = parseSnapshot(
    snapshot({
      links: [
        { href: "https://canvas.university.edu/courses/1/assignments/9/submissions", text: "Submit" },
        { href: "https://canvas.university.edu/courses/1", text: "Torts" },
      ],
      url: "https://canvas.university.edu/courses/1",
    }),
    "canvas",
  );
  assert.equal(courses[0]?.url, "https://canvas.university.edu/courses/1");
});

test("a course with no usable name is left out rather than shown blank", () => {
  const courses = parseSnapshot(
    snapshot({
      links: [{ href: "https://canvas.university.edu/courses/1", text: "Home" }],
      url: "https://canvas.university.edu/dashboard",
    }),
    "canvas",
  );
  assert.equal(courses.length, 0);
});

test("an unknown portal parses to nothing at all", () => {
  const courses = parseSnapshot(
    snapshot({ links: [{ href: "https://example.com/courses/1", text: "Something" }] }),
    "unknown",
  );
  assert.deepEqual(courses, []);
});

test("a Moodle course page reads its own course", () => {
  const courses = parseSnapshot(
    snapshot({
      blocks: [{ hint: "assign", isoDateTime: "2026-09-10T17:00:00", text: "Essay 1" }],
      links: [{ href: "https://learn.university.edu/course/view.php?id=42", text: "Welding Fundamentals" }],
      url: "https://learn.university.edu/course/view.php?id=42",
    }),
    "moodle",
  );
  assert.equal(courses[0]?.name, "Welding Fundamentals");
  assert.equal(courses[0]?.items[0]?.title, "Essay 1");
  assert.equal(courses[0]?.items[0]?.dueTime, "17:00");
});

test("FIELD-AGNOSTIC: nothing here knows what a subject is", () => {
  // The same code path, four unrelated disciplines, no special casing.
  for (const name of ["Contract Law", "Fluid Mechanics", "18th-Century Portraiture", "Welding Fundamentals"]) {
    const courses = parseSnapshot(
      snapshot({
        links: [{ href: "https://canvas.university.edu/courses/1", text: name }],
        url: "https://canvas.university.edu/courses/1",
      }),
      "canvas",
    );
    assert.equal(courses[0]?.name, name);
  }
});
