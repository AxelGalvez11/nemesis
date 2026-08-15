// What a stored parse ROW turns into on the way to the reprocess decision.
//
// 🔴 THIS IS THE FILE THAT EXISTS BECAUSE OF A SPECIFIC PAST FAILURE: a detector that found zero
// results in production while all ten of its tests were green, because every test fed it literals
// somebody typed rather than what the boundary actually produces. The predicate itself
// (`needsReprocess`) crosses nothing — it compares strings — so testing IT with literals is honest.
// What crosses is the MATERIAL STAMP, and its inputs come out of PostgREST, which is where the
// literals stop being equivalent to reality.
//
// 🔴 AND THE FAILURE HERE IS SILENT AND PERMANENT. If the stamp's inputs read back null, the stamp
// is null, a null current stamp suppresses a rebuild — so "we already looked at this material and
// found nothing" would stand for ever, for every canvas, and the only symptom would be documents
// that quietly never improve. Nothing throws, nothing logs, no test that hand-builds a stamp can
// see it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { provenanceOf } from "./canvas-sources";
import { codeOnly } from "./code-scan";
import { materialStamp } from "./canvas-territory";

/**
 * One row as production actually holds it, read out of `parsed_documents` on 2026-08-15.
 *
 * Real values, not invented ones: this is the owner's own diabetes lecture, the document with 8
 * unexamined figures that motivated the whole exercise.
 */
const REAL_ROW = {
  content_hash: "9b89123c7f3d30f50aaa40d8d8d795eca26da4ab7ef5489b8460cec00cb6c579",
  coverage: {},
  doc_kind: "pdf",
  parser_version: "extract-2026-08-13",
  structure: {},
} as const;

test("🔴 THE SELECT ASKS FOR THE COLUMNS THE STAMP IS BUILT FROM", () => {
  // 🔴 A SCANNING GUARD, AND IT IS THE ONLY KIND THAT CAN CATCH THIS ONE. Every other test in this
  // file feeds the mapping a row directly, so all of them stay green when the column is dropped
  // from the query — the stub answers whatever the fixture says regardless of what was asked for.
  // That is failure mode (a): a guard passing on a shorter path than the one it names. The query
  // string is the actual boundary, so the query string is what gets read.
  const code = codeOnly(readFileSync(new URL("canvas-sources.ts", import.meta.url), "utf8"));
  const embed = /parsed_documents\(([^)]*)\)/.exec(code);
  assert.ok(embed, "canvas-sources must embed parsed_documents");
  for (const column of ["content_hash", "parser_version"]) {
    assert.ok(
      embed[1]!.includes(column),
      `the parsed_documents embed must select ${column} — without it every material stamp is null, ` +
        "and every 'we already looked' marker stands for ever",
    );
  }
});

test("🔴 BOTH EMBED SHAPES — supabase-js TYPES a to-one embed as a list; this one arrives as an object", () => {
  // Measured against this project on 2026-08-11 and documented in `canvas-sources.ts` itself.
  // Assume one shape and the other yields `undefined` on every field, silently.
  const asObject = provenanceOf("src-1", REAL_ROW);
  const asList = provenanceOf("src-1", [REAL_ROW]);
  assert.deepEqual(asObject, asList);
  assert.equal(asObject.contentHash, REAL_ROW.content_hash);
  assert.equal(asObject.parserVersion, REAL_ROW.parser_version);
});

test("🔴 NO FIELD COMES BACK undefined — the shape that makes the cache immortal", () => {
  const provenance = provenanceOf("src-1", REAL_ROW);
  for (const [key, value] of Object.entries(provenance)) {
    assert.notEqual(value, undefined, `${key} is undefined — snake_case reached a camelCase field`);
    assert.notEqual(value, null, `${key} is null for a row that has it`);
  }
});

test("a stamp built from the real row is complete and stable", () => {
  const stamp = materialStamp([provenanceOf("src-1", REAL_ROW)]);
  assert.ok(stamp, "a fully-provenanced source must produce a stamp");
  assert.ok(stamp.contentHash.includes(REAL_ROW.content_hash));
  assert.ok(stamp.parserVersion.includes(REAL_ROW.parser_version));
});

test("🔴 attaching two files in either order is the SAME material", () => {
  // The fingerprint is sorted, so the order a learner happened to attach two lectures in must not
  // read as different material and buy a re-read.
  const a = provenanceOf("src-a", REAL_ROW);
  const b = provenanceOf("src-b", { ...REAL_ROW, content_hash: "sha-other" });
  assert.deepEqual(materialStamp([a, b]), materialStamp([b, a]));
});

test("🔴 ONE unprovenanced source makes the WHOLE stamp null — all or nothing", () => {
  // A canvas's answer was reached over ALL of its material, so a fingerprint over the sources that
  // happened to load cannot say whether the material changed. Returning a partial fingerprint would
  // compare two documents against a stored three and call the material CHANGED — spending a model
  // call because a read timed out.
  const good = provenanceOf("src-a", REAL_ROW);
  const failed = { contentHash: null, parserVersion: null, sourceId: "src-b" };
  assert.equal(materialStamp([good, failed]), null);
  assert.equal(materialStamp([good, { ...good, sourceId: "src-b", parserVersion: null }]), null);
});

test("no sources is no stamp, never an empty one", () => {
  // An empty fingerprint would compare equal to another empty fingerprint, so every canvas with no
  // readable material would agree it had already been looked at.
  assert.equal(materialStamp([]), null);
});
