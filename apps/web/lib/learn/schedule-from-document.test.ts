import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDocument, type DocumentModel } from "@nemesis/shared";

import {
  bareDateInCell,
  cellUnder,
  DATE_COLUMN,
  kindFor,
  meetingPatternOf,
  normalizeTime,
  parseCapabilities,
  scheduleCandidatesFrom,
  segmentsOf,
} from "./schedule-from-document";

const ANCHOR = new Date("2026-08-11T00:00:00Z");

function opts(model?: unknown) {
  void model;
  return {
    anchor: ANCHOR,
    canvasId: "c1",
    newId: (_s: unknown, i: number) => `cand-${i}`,
    parsedDocumentId: "parse-1",
    sourceId: "s1",
  };
}

/** A syllabus shaped like the real one: headings, a grading table, a meetings paragraph. */
function syllabus(): DocumentModel {
  return buildDocument({
    format: "pdf",
    title: "PHCY 2119",
    units: [{ index: 0, kind: "page" }, { index: 1, kind: "page" }],
    blocks: [
      { headingPath: [], kind: "heading", level: 1, text: "Course Meetings", unit: 0 },
      {
        headingPath: ["Course Meetings"],
        kind: "paragraph",
        text: "Tuesday and Thursday 10:00-11:20 AM in GEB A104",
        unit: 0,
      },
      { headingPath: [], kind: "heading", level: 1, text: "Examinations", unit: 1 },
      {
        headingPath: ["Examinations"],
        kind: "table",
        table: {
          columns: ["Assessment", "Date", "Time"],
          headerRows: 1,
          headerSource: "present",
          rows: [
            ["Assessment", "Date", "Time"],
            ["Exam 1", "September 17, 2026", "1:00 PM"],
            ["Exam 2", "October 22, 2026", "1:00 PM"],
          ],
        },
        text: "",
        unit: 1,
      },
    ],
  });
}

// ── capabilities ─────────────────────────────────────────────────────────────

test("a units-blocks model reports the capabilities its content justifies", () => {
  const caps = parseCapabilities(syllabus());
  assert.equal(caps.structuredText, true);
  assert.equal(caps.locators, true);
  assert.equal(caps.scheduleExtraction, true);
  assert.equal(caps.tableStructure, true);
  assert.equal(caps.figures, false, "no figure block, so no figure capability");
});

test("a text-only parse claims NOTHING — absent structure is not a cheerful default", () => {
  // 🔴 The defect this guards: `unit_count` is set for text-only parses too (it counts pages
  // READ), so any capability derived from it would report full structure for the six legacy rows
  // sitting in production right now.
  const caps = parseCapabilities(null);
  assert.equal(caps.structuredText, false);
  assert.equal(caps.scheduleExtraction, false);
  assert.equal(caps.locators, false);
});

test("a model that is one undifferentiated run of prose cannot claim schedule extraction", () => {
  const flat = buildDocument({
    format: "pdf",
    title: null,
    units: [{ index: 0, kind: "page" }],
    blocks: [{ headingPath: [], kind: "paragraph", text: "Exam 1 is on September 17, 2026.", unit: 0 }],
  });
  const caps = parseCapabilities(flat);
  assert.equal(caps.structuredText, true, "it does have a model");
  assert.equal(caps.scheduleExtraction, false, "but nothing to group BY");
});

// ── segmentation ─────────────────────────────────────────────────────────────

test("each table ROW is its own segment, so two exams never share one blob", () => {
  const segments = segmentsOf(syllabus()).filter((s) => s.fromTable);
  assert.equal(segments.length, 2);
  assert.ok(segments[0]!.text.startsWith("Exam 1"));
  assert.ok(segments[1]!.text.startsWith("Exam 2"));
});

test("a heading is not a segment — it is the address of the segments under it", () => {
  const segments = segmentsOf(syllabus());
  assert.ok(!segments.some((s) => s.text === "# Course Meetings"));
  assert.deepEqual(segments[0]!.headingPath, ["Course Meetings"]);
});

test("a table row carries its header, so the date's column is knowable", () => {
  const row = segmentsOf(syllabus()).find((s) => s.fromTable)!;
  assert.ok(row.headingPath.some((h) => h.includes("Assessment")), JSON.stringify(row.headingPath));
});

// ── the row travels as CELLS, which is the whole slice ───────────────────────

test("a table row reaches the extractor as cells, NOT as a re-joined string", () => {
  // 🔴 THE DEFECT: `segmentsOf` used to hand back "8-17 | - | Exam 1 (…) | - | -", putting a DATE
  // and a TIME back into one string as neighbouring tokens — reinstating the exact ambiguity the
  // recovered grid had just removed. The parser found all four exams and all six iRATs as clean
  // rows and the extractor still produced two candidates, neither an assessment.
  const row = segmentsOf(syllabus()).find((s) => s.fromTable)!;
  assert.deepEqual(row.cells.map((c) => c.column), ["Assessment", "Date", "Time"]);
  assert.equal(cellUnder(row.cells, DATE_COLUMN)?.value, "September 17, 2026");
  assert.equal(row.text.includes("|"), true, "the joined text survives as verbatim evidence");
});

test("a paragraph has no cells, because it genuinely has no columns", () => {
  const prose = segmentsOf(syllabus()).find((s) => !s.fromTable)!;
  assert.deepEqual(prose.cells, []);
});

test("a bare M-D date is read from a DATE cell", () => {
  assert.deepEqual(bareDateInCell("8-17"), { day: 17, month: 8 });
  assert.deepEqual(bareDateInCell("8/17/26"), { day: 17, month: 8, year: 2026 });
  // A 20pt column wraps `9-28` onto two lines, which `fillGrid` joins with a space.
  assert.deepEqual(bareDateInCell("9-2 8"), { day: 28, month: 9 });
});

test("a TIME RANGE is never a date, however date-shaped its numbers look", () => {
  // 🔴 `8:-9:50 CST/ 9-10:50 EST` is the reason the flat-text path could not be fixed with a
  // better pattern: one real syllabus holds 89 such tokens and most are time fragments.
  assert.equal(bareDateInCell("8:-9:50 CST/ 9-10:50 EST"), null);
  assert.equal(bareDateInCell("10-11:50"), null);
  assert.equal(bareDateInCell("13-45"), null, "month 13 does not exist");
});

test("the date comes from the Date column even when another column holds a time range", () => {
  const model = buildDocument({
    format: "pdf",
    title: null,
    units: [{ index: 0, kind: "page" }],
    blocks: [{
      headingPath: [],
      kind: "table",
      table: {
        columns: ["Date", "Time (CT)", "Topic"],
        headerRows: 1,
        headerSource: "present",
        rows: [
          ["Date", "Time (CT)", "Topic"],
          ["8-17", "8:-9:50 CST/ 9-10:50 EST", "Exam 1 (36 questions)"],
          ["8-14", "8:-9:50 CST/ 9-10:50 EST", "Active learning: Assessment: iRAT 1"],
        ],
      },
      text: "",
      unit: 0,
    }],
  });
  const { candidates } = scheduleCandidatesFrom(model, opts());
  assert.equal(candidates.length, 2);
  const exam = candidates.find((c) => /Exam 1/.test(c.title))!;
  assert.ok(exam.startAt?.startsWith("2026-08-17"), `exam dated ${exam.startAt}`);
  assert.equal(exam.kind, "exam");
  const irat = candidates.find((c) => /iRAT/.test(c.title))!;
  assert.ok(irat.startAt?.startsWith("2026-08-14"), `iRAT dated ${irat.startAt}`);
  assert.equal(irat.kind, "quiz", "an iRAT is a quiz-shaped assessment");
});

test("the title comes from the TOPIC cell, not from whichever column is leftmost", () => {
  // Leftmost-cell titling names every entry after the DATE column: "8-17", "8-14", …
  const model = buildDocument({
    format: "pdf",
    title: null,
    units: [{ index: 0, kind: "page" }],
    blocks: [{
      headingPath: [],
      kind: "table",
      table: {
        columns: ["Date", "Topic"],
        headerRows: 1,
        headerSource: "present",
        rows: [["Date", "Topic"], ["8-17", "Exam 1"]],
      },
      text: "",
      unit: 0,
    }],
  });
  const { candidates } = scheduleCandidatesFrom(model, opts());
  assert.equal(candidates[0]!.title, "Exam 1");
});

test("inherited column names behave exactly like printed ones", () => {
  const table = (headerSource: "present" | "inherited", rows: string[][]) => buildDocument({
    format: "pdf",
    title: null,
    units: [{ index: 0, kind: "page" }],
    blocks: [{
      headingPath: [],
      kind: "table",
      table: { columns: ["Date", "Topic"], headerRows: headerSource === "present" ? 1 : 0, headerSource, rows },
      text: "",
      unit: 0,
    }],
  });
  const printed = scheduleCandidatesFrom(table("present", [["Date", "Topic"], ["8-17", "Exam 1"]]), opts());
  const inherited = scheduleCandidatesFrom(table("inherited", [["8-17", "Exam 1"]]), opts());
  assert.equal(printed.candidates.length, 1);
  assert.equal(inherited.candidates.length, 1);
  assert.equal(inherited.candidates[0]!.title, printed.candidates[0]!.title);
  assert.equal(inherited.candidates[0]!.startAt, printed.candidates[0]!.startAt);
});

test("provenance survives table → row → candidate", () => {
  const { candidates } = scheduleCandidatesFrom(syllabus(), opts());
  for (const c of candidates) {
    const ref = c.sourceRefs[0]!;
    assert.equal(ref.parsedDocumentId, "parse-1");
    assert.equal(typeof ref.unitIndex, "number");
    assert.ok((ref.blockIds ?? []).length > 0);
  }
});

// ── locators ─────────────────────────────────────────────────────────────────

test("every candidate carries a locator that survives the boundary", () => {
  const { candidates } = scheduleCandidatesFrom(syllabus(), opts());
  assert.ok(candidates.length > 0);
  for (const c of candidates) {
    const ref = c.sourceRefs[0]!;
    assert.equal(ref.sourceId, "s1");
    assert.equal(ref.parsedDocumentId, "parse-1");
    assert.equal(typeof ref.unitIndex, "number");
    assert.ok((ref.blockIds ?? []).length > 0, "block ids are the re-openable part");
    assert.ok(Array.isArray(ref.headingPath));
  }
});

test("the exam candidates resolve to the page the exam table was actually on", () => {
  const { candidates } = scheduleCandidatesFrom(syllabus(), opts());
  const exams = candidates.filter((c) => c.kind === "exam");
  assert.equal(exams.length, 2);
  assert.equal(exams[0]!.sourceRefs[0]!.unitIndex, 1, "the table is on page 2 (index 1)");
});

// ── dates, kinds, recurrence ─────────────────────────────────────────────────

test("a dated table row becomes a candidate with a real date", () => {
  const { candidates } = scheduleCandidatesFrom(syllabus(), opts());
  const exam1 = candidates.find((c) => c.title.startsWith("Exam 1"))!;
  assert.ok(exam1.startAt?.startsWith("2026-09-17"), exam1.startAt);
  assert.equal(exam1.kind, "exam");
  assert.equal(exam1.origin, "source_extraction");
  assert.equal(exam1.status, "candidate", "nothing is confirmed by extraction alone");
});

test("the section heading decides the kind before the row does", () => {
  assert.equal(kindFor({ blockIds: [], cells: [], fromTable: true, headingPath: ["Examinations"], text: "Item 3", unit: 0 }), "exam");
});

test("two weekdays plus a time range is one recurring meeting, not many dates", () => {
  const pattern = meetingPatternOf("Tuesday and Thursday 10:00-11:20 AM in GEB A104");
  assert.deepEqual(pattern?.days, [2, 4]);
  assert.equal(pattern?.startTime, "10:00");
  assert.equal(pattern?.endTime, "11:20");
});

test("a single weekday is NOT a recurrence — 'due Friday' is one deadline", () => {
  assert.equal(meetingPatternOf("The assignment is due Friday at 5:00 PM"), null);
});

test("the recurring class produces exactly one candidate", () => {
  const { candidates } = scheduleCandidatesFrom(syllabus(), opts());
  const classes = candidates.filter((c) => c.kind === "class");
  assert.equal(classes.length, 1, "one series, not one per occurrence");
});

test("times normalize to 24-hour, and non-times are refused", () => {
  assert.equal(normalizeTime("1:00 PM"), "13:00");
  assert.equal(normalizeTime("8:00-9:50 am"), "08:00");
  assert.equal(normalizeTime("12:30 AM"), "00:30");
  assert.equal(normalizeTime("Chapter 12"), null);
  assert.equal(normalizeTime("25:99"), null);
});

// ── the refusals that matter ─────────────────────────────────────────────────

test("no capability means NO candidates — it does not silently fall back to the text path", () => {
  // 🔴 If this returned candidates anyway, the capability layer would be decorative: a caller
  // would get results either way and never learn the structure it was promised is absent.
  const { candidates, capabilities } = scheduleCandidatesFrom(null, opts());
  assert.equal(candidates.length, 0);
  assert.equal(capabilities.scheduleExtraction, false);
});

test("hedged language lowers confidence below the auto-confirm bar", () => {
  const hedged = buildDocument({
    format: "pdf",
    title: null,
    units: [{ index: 0, kind: "page" }],
    blocks: [
      { headingPath: [], kind: "heading", level: 1, text: "Examinations", unit: 0 },
      {
        headingPath: ["Examinations"],
        kind: "paragraph",
        text: "We will probably have the final sometime around December 10, 2026.",
        unit: 0,
      },
    ],
  });
  const { candidates } = scheduleCandidatesFrom(hedged, opts());
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((c) => c.confidence < 0.8), "a hedge must not auto-confirm");
});

test("a date whose year cannot be resolved is reported, never dropped in silence", () => {
  const { unresolved, candidates } = scheduleCandidatesFrom(syllabus(), opts());
  // Nothing unresolvable in this fixture; the contract is that the field EXISTS and is honest.
  assert.ok(Array.isArray(unresolved));
  assert.equal(unresolved.length + candidates.length > 0, true);
});

test("course association is absent here — extraction never depends on it", () => {
  // 🔴 The production syllabus imported with course_id NULL. If extraction required a course,
  // that file would produce nothing at all.
  const { candidates } = scheduleCandidatesFrom(syllabus(), opts());
  assert.ok(candidates.length > 0, "no course anywhere in the options, and candidates still exist");
});
