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

import { decideReuse, type ExistingParse } from "./parse-reuse";

function parse(overrides: Partial<ExistingParse> = {}): ExistingParse {
  return {
    complete: true,
    docKind: "pdf",
    id: "00000000-0000-0000-0000-000000000001",
    parserVersion: "extract-2026-08-13",
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
  // 🔴 THE FIXTURE BUILDER, LIKE EVERY OTHER TEST IN THIS FILE. This one was written as a raw
  // database row — `content_hash`, `parser_version`, snake_case — and `decideReuse` takes
  // `ExistingParse`, which is the camelCase shape the client maps a row INTO. It did not typecheck,
  // and `web-units` runs `tsc` as a separate step after the tests, so the suite went green and the
  // job went red on main.
  const decision = decideReuse(parse({ complete: false, state: "partially_parsed" }), { reprocessRequested: true });
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
