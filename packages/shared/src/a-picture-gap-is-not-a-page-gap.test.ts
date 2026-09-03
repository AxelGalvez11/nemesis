/**
 * A DOCUMENT WHOSE PICTURES WERE CAPPED MUST NEVER BE DESCRIBED AS PARTLY UNREADABLE.
 *
 * Owner report, 2026-09-03, canvas `c9749731-2c62-4598-862f-48b0adca48f5`. He attached seven
 * pharmacy lectures and was told one of them "was partly unreadable to me, 11 of 83 pages and 333
 * pictures didn't come through". The parse row says otherwise: `unitsUnread: 0`, 43 pages off the
 * text layer plus 40 through vision, 354 excerpts, every one carrying its heading, 36 of them
 * tables. Every page was read. The two numbers in that sentence do not appear anywhere in the
 * record, and the picture count it WAS given was 255.
 *
 * The notice supplied the shape of the claim: it named a hole, never named the ground, and closed
 * with "rather than answering as though you read the whole document" addressed to a model that had
 * read the whole document. 24 of the 27 partial documents on production have every page read, so
 * this is not an edge case, it is nearly the entire partial population.
 *
 * These tests fail if the notice ever goes back to listing absences alone.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { coverageNoticeForModel, readCoverage, textIsWhole, type ExtractionCoverage } from "./extraction-coverage.ts";

/** His row, copied verbatim out of `parsed_documents.coverage`. */
const HIS_LECTURE = readCoverage({
  state: "partial",
  units: 83,
  version: 1,
  unitKind: "page",
  figures: {
    found: 846,
    described: 22,
    skipped: 824,
    reasons: { "over-cap": 192, decorative: 534, "examined-empty": 35, "unreadable-format": 63 },
  },
  unitsBoth: 0,
  truncation: [],
  unitsNative: 43,
  unitsUnread: 0,
  unitsVision: 40,
  parserVersion: "extract-2026-08-16",
}) as ExtractionCoverage;

test("his own lecture reads back as a real record", () => {
  assert.ok(HIS_LECTURE, "the production row must survive readCoverage or this whole file proves nothing");
  assert.equal(HIS_LECTURE.unitsUnread, 0);
  assert.equal(textIsWhole(HIS_LECTURE), true);
});

test("the notice states what was read BEFORE what was not", () => {
  const notice = coverageNoticeForModel(HIS_LECTURE) ?? "";
  assert.ok(notice.length > 0, "a capped-picture document still discloses");
  // 🔴 ANCHORED ON ORDER, NOT ON PRESENCE. The old notice also contained the page count — inside
  // "of 83 pages" in a sentence about absence. What was missing was the positive claim, and what
  // makes it useful is that the model meets it first.
  const readsInFull = notice.indexOf("read in full");
  const firstGap = notice.indexOf("Not carried over");
  assert.ok(readsInFull >= 0, `notice must say the source was read in full: ${notice}`);
  assert.ok(readsInFull < firstGap, `what was read must come before what was not: ${notice}`);
  assert.match(notice, /text and tables of all 83 pages are below/);
});

test("the notice forbids the exact sentence he was shown", () => {
  const notice = coverageNoticeForModel(HIS_LECTURE) ?? "";
  assert.match(notice, /COMPLETE/, `the intact half must be asserted, not implied: ${notice}`);
  assert.match(
    notice,
    /[Dd]o not say that any page, or its text or tables, was missing, unreadable or only partly read/,
    `the false claim must be named and forbidden: ${notice}`,
  );
  // The sign-off that produced "11 of 83 pages" must not survive on a whole-text document.
  assert.doesNotMatch(
    notice,
    /as though you read the whole document/,
    `this instruction is addressed to a model that DID read the whole document: ${notice}`,
  );
});

test("pictures are ranked last, behind text and tables", () => {
  const lostBoth = readCoverage({
    ...HIS_LECTURE,
    unitsNative: 30,
    unitsUnread: 13,
    truncation: [{ stage: "extract", limit: 200_000, kept: 200_000, dropped: 9_120 }],
  }) as ExtractionCoverage;
  const notice = coverageNoticeForModel(lostBoth) ?? "";
  // Owner ruling 2026-09-03: text first, tables second, pictures nice to have. A notice that opens
  // on pictures teaches the model to open its answer on pictures.
  assert.ok(
    notice.indexOf("could NOT be read") < notice.indexOf("pictures were not described"),
    `lost pages must be stated before lost pictures: ${notice}`,
  );
  assert.ok(
    notice.indexOf("characters were dropped") < notice.indexOf("pictures were not described"),
    `dropped text must be stated before lost pictures: ${notice}`,
  );
});

test("a document that really lost pages still says so, and is not told the text is complete", () => {
  const lostPages = readCoverage({ ...HIS_LECTURE, unitsNative: 30, unitsUnread: 13 }) as ExtractionCoverage;
  assert.equal(textIsWhole(lostPages), false);
  const notice = coverageNoticeForModel(lostPages) ?? "";
  assert.match(notice, /13 of 83 pages could NOT be read/, `real page loss must survive: ${notice}`);
  assert.doesNotMatch(notice, /COMPLETE/, `a half-read document must never be called complete: ${notice}`);
  assert.doesNotMatch(notice, /read in full/, `a half-read document must never claim a full read: ${notice}`);
});

test("an unreadable region counts against the text, not against the pictures", () => {
  // A formula the parser located and could not transcribe is text loss. It must break `textIsWhole`
  // or a document with 27 unreadable derivations would be told its words are COMPLETE.
  const formulas = readCoverage({ ...HIS_LECTURE, unreadableRegions: 27 }) as ExtractionCoverage;
  assert.equal(textIsWhole(formulas), false);
  const notice = coverageNoticeForModel(formulas) ?? "";
  assert.doesNotMatch(notice, /COMPLETE/, `unreadable regions are text loss: ${notice}`);
  assert.ok(
    notice.indexOf("could not be turned into text") < notice.indexOf("pictures were not described"),
    `region loss outranks picture loss: ${notice}`,
  );
});

test("a fully read document still says nothing at all", () => {
  const clean = readCoverage({ ...HIS_LECTURE, state: "complete" }) as ExtractionCoverage;
  assert.equal(coverageNoticeForModel(clean), null, "a complete read must not acquire a new sentence");
});
