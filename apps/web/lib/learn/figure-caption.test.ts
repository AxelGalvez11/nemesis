// A caption has to describe the picture, and a concept has to be about the picture.
//
// 🔴🔴 THE BUG THIS GUARDS IS NOT "UGLY TEXT", IT IS "THE WRONG PICTURE, CONFIDENTLY". The
// harvester makes `concepts` from a file's Commons description, and for 1,235 of the shelf's
// 5,829 rows that description is a record about the SOURCE BOOK. Every row from one upload
// therefore carries the SAME concept string — 1,130 of them for OpenStax Biology alone — so any
// query wide enough to brush the blurb scores all of them identically and the sort picks one.
// A curated row shadows the live provider, so that arbitrary pick would beat the real diagram.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isCatalogueRecord, matchableConcepts, readableCaption } from "./figure-caption";
import { REFERENCE_SHELF } from "./reference-shelf";
import { searchCurated } from "./reference-images";

/** Verbatim from the shipped shelf — these are not invented examples. */
const REAL_RECORDS = [
  "Name: Biology ID: 185cbf87-c72e-48f5-b51e-f14f21b5eabd@9.17 Language: English Summary: Biology is designed for multi-semester biology courses for science majors.",
  "Image or illustration from the book: Chemistry Caption : Missing, please see book Book summary : Chemistry is designed for the two-semester general chemistry course.",
  "Illustration from Anatomy Physiology, Connexions Web site. http://cnx.org/content/col11496",
  "Name: Microbiology ID: e42bd376-624b-4c0f-972f-e0c57998e765@4.4 Language: English Summary:",
];

/** Also verbatim from the shelf and the registry — captions that genuinely describe a picture. */
const REAL_CAPTIONS = [
  "The phases of meiosis, from a diploid parent cell to four haploid daughter cells.",
  "Photosynthesis in a plant: light, water and carbon dioxide in; glucose and oxygen out.",
  "Cervical Spine. See a full animation of this medical topic.",
  "Hip Anatomy. See a related animation of this medical topic.",
];

test("🔴🔴 a book record is recognised, and a real caption is not", () => {
  for (const record of REAL_RECORDS) {
    assert.ok(isCatalogueRecord(record), `a real shelf blurb was not caught: ${record.slice(0, 60)}…`);
  }
  for (const caption of REAL_CAPTIONS) {
    assert.ok(!isCatalogueRecord(caption), `a genuine caption was thrown away: ${caption.slice(0, 60)}…`);
  }
});

test("🔴 a caption with one colon in it survives — the label floor is three", () => {
  // Calibration for MIN_RECORD_LABELS. Drop it to 1 and this reddens, which is the point: real
  // captions do use a colon, and a filter that ate them would cost more than it saved.
  assert.ok(!isCatalogueRecord("Photosynthesis: light in, glucose out"));
  assert.ok(!isCatalogueRecord("Title: the Krebs cycle, drawn as a wheel"));
  assert.ok(isCatalogueRecord("Name: X ID: y Language: English"));
});

test("🔴 an empty caption is not a book record — absence and poison are different", () => {
  assert.equal(isCatalogueRecord(""), false);
  assert.equal(isCatalogueRecord("   "), false);
  assert.equal(readableCaption(undefined), "");
  assert.equal(readableCaption(""), "");
});

test("readableCaption blanks a record and returns a real caption untouched", () => {
  assert.equal(readableCaption(REAL_RECORDS[0]), "");
  assert.equal(readableCaption(REAL_CAPTIONS[0]), REAL_CAPTIONS[0]);
  assert.equal(readableCaption("  spaced out  "), "spaced out");
});

test("matchableConcepts drops the blurb and keeps the name", () => {
  assert.deepEqual(matchableConcepts(["Process of Meiosis", REAL_RECORDS[0]!]), ["Process of Meiosis"]);
  assert.deepEqual(matchableConcepts([REAL_RECORDS[0]!]), []);
  assert.deepEqual(matchableConcepts(["", "  "]), []);
});

test("🔴🔴 the shipped shelf really is polluted, and this really does protect it", () => {
  // 🔴 THIS TEST MEASURES THE SHELF RATHER THAN A FIXTURE, so it stays true if the shelf is
  // re-harvested. If a future harvest cleans the descriptions at source, `polluted` goes to zero
  // and the assertion below relaxes on its own — it only demands that whatever pollution EXISTS
  // is filtered, never that pollution must exist.
  const polluted = REFERENCE_SHELF.filter((entry) => entry.concepts.some((concept) => isCatalogueRecord(concept)));
  const stillCompeting = polluted.filter((entry) => matchableConcepts(entry.concepts).length > 0);

  // Every row whose ONLY concept was a blurb is now unmatchable, which is the whole point.
  const deadWeight = polluted.filter((entry) => matchableConcepts(entry.concepts).length === 0);
  assert.equal(
    deadWeight.length + stillCompeting.length,
    polluted.length,
    "the partition does not cover the polluted rows",
  );
  for (const entry of stillCompeting) {
    assert.ok(
      !matchableConcepts(entry.concepts).some((concept) => isCatalogueRecord(concept)),
      "a row still competes on a blurb",
    );
  }
});

test("🔴🔴 the word that used to tie a thousand rows no longer matches any of them", () => {
  // 🔴 THE FAILURE IN ONE ASSERTION. "biology" appears in the OpenStax Biology blurb and in
  // nothing else about those 1,130 files, so before this filter the phrase below scored every one
  // of them identically — and a curated hit SHADOWS the live provider, so the learner got an
  // arbitrary textbook figure instead of a real diagram. Now the shelf declines and the request
  // falls through to the live Commons search, which is where a concept the shelf does not hold
  // belongs.
  const blurbOnly = REFERENCE_SHELF.filter(
    (entry) => entry.concepts.length > 0 && entry.concepts.every((concept) => isCatalogueRecord(concept)),
  );
  assert.ok(blurbOnly.length > 100, `the shelf's blurb-only rows are gone (${blurbOnly.length}) — is this guard still pointed at anything?`);

  const hits = searchCurated({ concept: "multi-semester biology courses" }, blurbOnly);
  assert.equal(hits.length, 0, "a blurb still wins a match, so an arbitrary figure can still shadow the live search");
});

test("🔴 no candidate ever leaves the search carrying a book record", () => {
  // The end-to-end claim, over the whole shipped shelf rather than a fixture. Any phrase that
  // matches must come back with a caption a learner can read, or with none at all.
  for (const phrase of ["cervical spine anatomy", "hip anatomy", "chemistry reduction products", "microbiology glycolysis"]) {
    for (const hit of searchCurated({ concept: phrase, limit: 10 }, REFERENCE_SHELF)) {
      assert.ok(!isCatalogueRecord(hit.caption ?? ""), `"${phrase}" returned a book record as its caption`);
      assert.ok(!hit.tags?.some((tag) => isCatalogueRecord(tag)), `"${phrase}" returned a candidate tagged with a book record`);
    }
  }
});

test("🔴 the harvester and this filter agree about what a record looks like", () => {
  // The harvest writes `concepts` from the description; this file decides what a description is
  // worth. If the harvester ever starts cleaning descriptions itself, that is fine — but it must
  // do it through THIS module, or the two will disagree about a string and the shelf will drift
  // back into the state this whole file exists to describe.
  const harvest = readFileSync(new URL("../../scripts/reference-shelf-harvest.mts", import.meta.url), "utf8");
  const cleans = /isCatalogueRecord|matchableConcepts|readableCaption/.test(harvest);
  const raw = /const concepts = \[stem, description/.test(harvest);
  assert.ok(cleans || raw, "the harvester now builds concepts some third way — check it against this filter");
});

console.log("figure-caption.test.ts OK");
