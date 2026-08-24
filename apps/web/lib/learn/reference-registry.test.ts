// The registry cannot rot — every claim a row makes is re-asserted here, offline, on every run.
//
// 🔴 THESE ARE THE RULES `chooseAsset` WOULD APPLY AT SHOW TIME, APPLIED AT COMMIT TIME. A row that
// fails here would not crash production — it would quietly resolve to "no picture may be shown",
// which is precisely the kind of silent degradation this repo keeps being bitten by. Failing the
// build is the cheaper place to find out.

import assert from "node:assert/strict";
import { test } from "node:test";

import { allowedAssetUrl } from "./reference-images";
import { REFERENCE_REGISTRY } from "./reference-registry";
import { attributionRequired, isReusableLicence } from "./visual-provenance";

test("the registry is seeded — §42's rung three has curated rows behind it", () => {
  assert.ok(REFERENCE_REGISTRY.length >= 20, `expected a seeded registry, found ${REFERENCE_REGISTRY.length} rows`);
});

test("🔴 every row's licence is one Nemesis may reuse under, exactly as chooseAsset will ask", () => {
  for (const row of REFERENCE_REGISTRY) {
    assert.ok(isReusableLicence(row.licence), `${row.assetPath} carries "${row.licence}", which is not reusable`);
  }
});

test("🔴 every BY-family row carries the credit line its licence legally requires", () => {
  for (const row of REFERENCE_REGISTRY) {
    if (!attributionRequired(row.licence)) continue;
    assert.ok(row.attribution.trim(), `${row.assetPath} is ${row.licence} and owes a credit line it does not carry`);
  }
});

test("🔴 every asset lives on a host the reference lane allows, over https", () => {
  // The same rule `canvas-visual.ts` applies to a stored figure's asset. A registry row pointing
  // anywhere else would emit candidates the validator then refuses — a picture lost twice.
  for (const row of REFERENCE_REGISTRY) {
    assert.ok(allowedAssetUrl(row.assetPath), `${row.assetPath} is not on an allowed host`);
  }
});

test("every row can be found, credited and traced", () => {
  const seen = new Set<string>();
  for (const row of REFERENCE_REGISTRY) {
    assert.ok(row.concepts.length >= 1, `${row.assetPath} has no concepts, so no query can ever match it`);
    assert.ok(row.caption.trim(), `${row.assetPath} has no caption`);
    assert.ok(row.url?.startsWith("https://"), `${row.assetPath} has no https source page to check the licence on`);
    // Bounds the validator applies to a stored figure's licence object — a row that exceeds them
    // would resolve and then refuse at parse time.
    assert.ok(row.attribution.length <= 200, `${row.assetPath} attribution exceeds the spec bound`);
    assert.ok(!seen.has(row.assetPath), `${row.assetPath} appears twice`);
    seen.add(row.assetPath);
  }
});

test("the rendition URLs carry no analytics baggage", () => {
  for (const row of REFERENCE_REGISTRY) {
    assert.ok(!row.assetPath.includes("?"), `${row.assetPath} carries a query string`);
  }
});
