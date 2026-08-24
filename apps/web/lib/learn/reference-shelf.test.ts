// The harvested shelf cannot rot — every row of it re-passes the gate, offline, on every run.
//
// 🔴 THE SAME RULES `reference-registry.test.ts` HOLDS FOR HAND ROWS, OVER THOUSANDS. The shelf is
// generated, and generated data is exactly the kind that quietly drifts: a script edit that stops
// normalising a licence, or starts admitting a host, would poison every row at once. This file is
// the reason that failure is a red build instead of a shipped one.

import assert from "node:assert/strict";
import { test } from "node:test";

import { allowedAssetUrl } from "./reference-images";
import { REFERENCE_SHELF } from "./reference-shelf";
import { attributionRequired, isReusableLicence } from "./visual-provenance";

test("the shelf holds the harvested collections — thousands of rows, not a gesture", () => {
  assert.ok(REFERENCE_SHELF.length >= 3000, `expected a harvested shelf, found ${REFERENCE_SHELF.length} rows`);
});

test("🔴 every shelf row's licence is one Nemesis may reuse under", () => {
  for (const row of REFERENCE_SHELF) {
    assert.ok(isReusableLicence(row.licence), `${row.assetPath} carries "${row.licence}", which is not reusable`);
  }
});

test("🔴 every BY-family shelf row carries a credit line, and every credit fits the spec bound", () => {
  for (const row of REFERENCE_SHELF) {
    if (attributionRequired(row.licence)) {
      assert.ok(row.attribution.trim(), `${row.assetPath} is ${row.licence} and owes a credit line`);
    }
    assert.ok(row.attribution.length <= 200, `${row.assetPath} attribution exceeds the spec bound`);
  }
});

test("🔴 every shelf asset lives on the allowed host, and every row can be found and traced", () => {
  const seen = new Set<string>();
  for (const row of REFERENCE_SHELF) {
    assert.ok(allowedAssetUrl(row.assetPath), `${row.assetPath} is not on an allowed host`);
    assert.ok(!row.assetPath.includes("?"), `${row.assetPath} carries a query string`);
    assert.ok(row.concepts.length >= 1, `${row.assetPath} has no concepts, so no query can ever match it`);
    assert.ok(row.caption.trim(), `${row.assetPath} has no caption`);
    assert.ok(row.caption.length <= 300, `${row.assetPath} caption exceeds the spec bound`);
    assert.ok(row.url?.startsWith("https://"), `${row.assetPath} has no https source page`);
    assert.ok(!seen.has(row.assetPath), `${row.assetPath} appears twice`);
    seen.add(row.assetPath);
  }
});

test("the collections the shelf claims are actually represented", () => {
  // Spot anchors, one per major collection — a regenerated shelf that silently lost a whole
  // collection fails here rather than in a learner's empty lesson.
  const everything = REFERENCE_SHELF.map((row) => `${row.assetPath} ${row.caption}`).join("\n");
  for (const marker of ["Gray", "Blausen", "Servier"]) {
    assert.ok(everything.includes(marker), `no trace of the ${marker} collection on the shelf`);
  }
});
