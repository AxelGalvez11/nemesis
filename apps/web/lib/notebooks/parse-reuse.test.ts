/**
 * Parsing the same bytes twice, and the two cases where reuse would be worse than spending.
 *
 * 🔴 THE DANGEROUS DIRECTION IS NOT "REUSED TOO LITTLE". A reuse that fires when it should not is
 * a document permanently frozen at a worse answer, and it is silent: the student sees a parse, the
 * log says success, and nothing in the row says the file was never actually read this time. So
 * both refusals below are pinned, and the SQL that links the two rows checks the hash as well as
 * the id for the same reason — see `20260818T10_parse_reuse.sql`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PARSER_VERSION } from "@nemesis/shared";

import { decideReuse, readByAnOlderParser, type ExistingParse } from "./parse-reuse";

function parse(overrides: Partial<ExistingParse> = {}): ExistingParse {
  return {
    complete: true,
    docKind: "pdf",
    id: "00000000-0000-0000-0000-000000000001",
    parserVersion: "extract-2026-08-13",
    // 🔴 THE COLUMN AND THE READER ARE DIFFERENT FACTS, and only the second can be compared. The
    // column above is whatever LANE finished the read (`pages`, `figures`, a vendor id); this is
    // the parser that produced it. Defaulted to the current one so these cases keep asking what
    // they were written to ask — is a same-generation parse reused — rather than silently becoming
    // staleness tests.
    readerVersion: PARSER_VERSION,
    state: "parsed",
    unitCount: 12,
    ...overrides,
  };
}

test("the same bytes, already read for this person, are not read again", () => {
  const decision = decideReuse(parse());
  assert.equal(decision.reuse, true);
  assert.equal(decision.reason, "same-bytes-already-parsed");
});

test("🔴 a partial parse is reused — it is a resting state, not a failure", () => {
  // A 300-page scan with 40 pages transcribed is `partially_parsed` by design: the SQL says so,
  // `pipelineStateFor` says so, and the reader shows the caveat. Re-reading it spends the same
  // money to reach the same place.
  const decision = decideReuse(parse({ complete: false, state: "partially_parsed" }));
  assert.equal(decision.reuse, true);
});

test("🔴 a failed parse is never reused — that would make one bad day permanent", () => {
  // Reusing a failure means every retry finds the failure and declines to try, so a document that
  // failed once could never be read again. `record_parsed_document` keeps failed rows on purpose
  // (they carry the error), which is exactly why existence is not the test.
  const decision = decideReuse(parse({ complete: false, state: "failed" }));
  assert.equal(decision.reuse, false);
  assert.equal(decision.reason, "existing-parse-failed");
});

test("🔴 a requested reprocess is not answered with the parse it is asking to replace", () => {
  const decision = decideReuse(parse(), { reprocessRequested: true });
  assert.equal(decision.reuse, false);
  assert.equal(decision.reason, "reprocess-requested");
});

test("nothing stored means parse it", () => {
  assert.equal(decideReuse(null).reuse, false);
  assert.equal(decideReuse(null).reason, "no-existing-parse");
});

test("🔴 reuse is scoped to one person, in the query AND in the SQL", () => {
  // The privacy argument is the `user_id` predicate, and a predicate that lives only in prose is a
  // predicate somebody deletes. Both places that can serve a stored parse are asserted here.
  const client = readFileSync(new URL("./parse-reuse.ts", import.meta.url), "utf8");
  assert.match(client, /\.eq\("user_id", userId\)/, "the lookup must filter on the owner");
  assert.equal(
    (client.match(/\.eq\("user_id", userId\)/g) ?? []).length >= 2,
    true,
    "and so must the row read that follows it",
  );

  const migration = readFileSync(
    new URL("../../../../supabase/migrations/20260818T10_parse_reuse.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /and user_id = p_user_id/, "the linking function must prove ownership in SQL");
  assert.match(
    migration,
    /and content_hash = p_content_hash/,
    "🔴 and prove the parse is about THESE bytes — an id alone would let a stale hash link a placement to a parse of a different file",
  );
  assert.match(migration, /parse_lease_token = p_token/, "and prove the lease, exactly as finish_document_parse does");
});

test("🔴 the migration does not deduplicate across users", () => {
  const migration = readFileSync(
    new URL("../../../../supabase/migrations/20260818T10_parse_reuse.sql", import.meta.url),
    "utf8",
  );
  // Cross-user reuse would be a change to what user data is, not an optimisation, and the owner's
  // brief lists new user-data sharing as something to escalate. If a future edit drops the owner
  // predicate, this is the test that should go red.
  assert.doesNotMatch(migration, /select .* from public\.parsed_documents[^;]*where content_hash = p_content_hash\s*;/is);
});

// ── the refusal that existed and could never fire ────────────────────────────
//
// 🔴🔴 MEASURED ON PRODUCTION 2026-08-21 BY ASKING FOR A REPROCESS AND WATCHING IT NOT HAPPEN.
// `decideReuse` has taken `reprocessRequested` since it was written, and the worker called it as
// `decideReuse(existing)` — no options. So `parse_reprocess_target` was write-only: the app's
// button set it, the SQL claim predicate read it to claim the row, and the worker then reused the
// very parse the learner had asked to replace. The logs show `parse_reused` once a minute, 0ms
// each, the target never cleared, until the row burned all five attempts.
//
// This file's own header already named the hazard — "a reuse that fires when it should not is a
// document permanently frozen at a worse answer, and it is silent". It was pinned for the two
// refusals that could fire, and not for the one that could not.

test("🔴 an explicit reprocess refuses reuse — the whole point of asking", () => {
  const decision = decideReuse(
    { complete: false, docKind: "pdf", id: "p1", parserVersion: "extract-2026-08-16", readerVersion: PARSER_VERSION, state: "partially_parsed", unitCount: 47 },
    { reprocessRequested: true },
  );
  assert.equal(decision.reuse, false);
  assert.equal(decision.reuse === false ? decision.reason : null, "reprocess-requested");
});

test("🔴 and the WORKER passes it, which is the half that was missing", () => {
  const worker = readFileSync(
    new URL("../../app/api/documents/parse/worker/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    worker,
    /decideReuse\(existing, [^)]*reprocessRequested/,
    "the worker calls decideReuse without the request — `parse_reprocess_target` is write-only again",
  );
  assert.match(
    worker,
    /job\.parse_reprocess_target/,
    "the request is not read off the claimed row, so it can drift from the predicate that claimed it",
  );
});

/**
 * 🔴🔴 AN IMPROVEMENT TO EXTRACTION MUST BE ABLE TO REACH A FILE WE HAVE ALREADY SEEN.
 *
 * Until 2026-09-03 it could not. Reuse matched on bytes alone, and the documented upgrade path —
 * "a deliberate act with a caller" — ran on `parse_reprocess_target`, which only
 * `POST /api/library/sources/:id/parse {"reprocess":true}` sets: a body no surface in the app
 * sends, behind a worker nudge needing a secret no person holds. So re-uploading a lecture returned
 * the same stored parse for ever.
 *
 * It stopped being theoretical the day reading a shattered diagram whole (#1111) recovered 30
 * slides across 5 of the owner's own lectures that had been read as nothing.
 */
test("🔴 a parse from an older version of OUR parser is not reused", () => {
  const decision = decideReuse(parse({ readerVersion: "extract-2026-08-16" }), { currentParserVersion: "extract-2026-09-03" });
  assert.equal(decision.reuse, false);
  assert.equal(decision.reuse === false ? decision.reason : null, "read-by-an-older-parser");
});

test("🔴 a vendor read IS reused — our bump did not improve it and repeating it costs money", () => {
  const decision = decideReuse(parse({ readerVersion: "mistral/mistral-ocr-latest" }), {
    currentParserVersion: "extract-2026-09-03",
  });
  assert.equal(decision.reuse, true, "an external OCR read is somebody else's answer, not a stale one of ours");
});

test("an unknown reader is reused, because unknown is not stale", () => {
  // Rows predating the coverage record have no reader version. Refusing those would re-read the
  // corpus on the strength of a missing field.
  assert.equal(decideReuse(parse({ readerVersion: null }), { currentParserVersion: "extract-2026-09-03" }).reuse, true);
});

test("the family test comes from the constant, not from a hardcoded prefix", () => {
  assert.equal(readByAnOlderParser("extract-2026-08-16", "extract-2026-09-03"), true);
  assert.equal(readByAnOlderParser("extract-2026-09-03", "extract-2026-09-03"), false, "same version is not stale");
  assert.equal(readByAnOlderParser("mistral/mistral-ocr-latest", "extract-2026-09-03"), false);
  assert.equal(readByAnOlderParser("gemini-3.7-flash", "extract-2026-09-03"), false);
  assert.equal(readByAnOlderParser(null, "extract-2026-09-03"), false);
  // 🔴 The column values that are LANE names, not versions. These never reach `readerVersion` —
  // the coverage record holds the real parser for all of them — but if they ever did, they must not
  // be mistaken for one of ours.
  assert.equal(readByAnOlderParser("pages", "extract-2026-09-03"), false);
  assert.equal(readByAnOlderParser("figures", "extract-2026-09-03"), false);
});
