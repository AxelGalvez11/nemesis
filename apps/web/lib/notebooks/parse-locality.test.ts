/**
 * PARSER-003 — WHERE the parse lost something, proved on a real file.
 *
 * 🔴 THE STANDING RULE, MADE EXECUTABLE FOR LOCALITY (owner, 2026-08-11):
 *
 *     real file → parser → coverage → JSON/storage → readCoverage()
 *              → consumer → the RIGHT unit
 *
 * Locality is worth nothing if it is one out. Coverage counts units 0-based and
 * the extraction boundary carries `page: block.unit + 1` 1-based, so a field
 * that is off by one satisfies every count-based assertion and then points at
 * the wrong page of every document, silently and for ever. That is the
 * locator-class defect this codebase has already paid for once, with
 * `excerptId`.
 *
 * So the fixture loses its MIDDLE page. `unit: 1` is the only correct answer:
 * an off-by-one gives 0 or 2, and a "default to the first page" bug gives 0.
 * A single-page fixture could not tell any of those apart.
 *
 * `mixed-pages.pdf` is generated, not copied — `scripts/make-mixed-pages-pdf.mjs`,
 * same licensing reason as the image-only fixtures — and is a genuine PDF read
 * here by the real pdf.js.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readCoverage, unlocatedRegions, unlocatedUnreadUnits, type ExtractionCoverage } from "@nemesis/shared";

import { parseDocument } from "./parse-document.ts";

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
}

async function parseMixed(): Promise<ExtractionCoverage> {
  const outcome = await parseDocument(fixture("mixed-pages.pdf"), "mixed-pages.pdf", "application/pdf");
  assert.equal(outcome.ok, true, "the fixture must parse — two of its three pages are full of text");
  assert.ok(outcome.ok);
  return outcome.document.coverage;
}

test("🔴 the unread page is named, and it is the MIDDLE one", async () => {
  const coverage = await parseMixed();
  assert.equal(coverage.units, 3);
  assert.equal(coverage.unitsUnread, 1, "one page had no text and vision is not configured here");
  assert.deepEqual(
    coverage.lostUnits,
    [{ unit: 1, unread: true }],
    "0-based, and the middle page — an off-by-one would say 0 or 2 and pass every count above",
  );
});

test("🔴 locality survives storage — the arrow six structural fields have died at", async () => {
  const coverage = await parseMixed();
  // Exactly what `parsed_documents.coverage` does to it: serialised to jsonb and
  // read back through the real validator, not the in-memory object.
  const stored = readCoverage(JSON.parse(JSON.stringify(coverage)));
  assert.ok(stored, "the record must still parse after a round trip");
  assert.deepEqual(stored.lostUnits, [{ unit: 1, unread: true }]);
  assert.equal(unlocatedUnreadUnits(stored), 0, "the one unread page is fully accounted for");
  assert.equal(unlocatedRegions(stored), 0);
});

test("🔴 a consumer can tell the lost page from the pages that are fine", async () => {
  const coverage = await parseMixed();
  const stored = readCoverage(JSON.parse(JSON.stringify(coverage)))!;
  const lost = new Set((stored.lostUnits ?? []).map((entry) => entry.unit));
  // The capability this whole task exists to create: refuse the page, not the
  // document. Before it, `unitsUnread: 1` was all a consumer had, and the only
  // available response was to distrust all three pages or none of them.
  assert.deepEqual([0, 1, 2].filter((unit) => !lost.has(unit)), [0, 2]);
  assert.equal(lost.size, 1);
});

test("a document that lost nothing records no locality at all", async () => {
  // The calibration. Without it, a bug that stamped every document with a lost
  // unit would satisfy every assertion above.
  const outcome = await parseDocument(fixture("two-column.pdf"), "two-column.pdf", "application/pdf");
  assert.ok(outcome.ok, "the two-column fixture is a readable text PDF");
  const coverage = outcome.document.coverage;
  assert.equal(coverage.unitsUnread, 0, "every page of this fixture has text");
  assert.equal(
    "lostUnits" in coverage,
    false,
    "absent means nothing was lost here — an empty array would claim we looked and found nothing",
  );
});
