/**
 * What the indexer considers OUTSTANDING, guarded at the only level it exists: the SQL.
 *
 * 🔴🔴 TWO WAYS THIS GOES WRONG, AND BOTH HAVE ALREADY HAPPENED ONCE IN THIS FUNCTION.
 *
 * ONE — the predicate gets restated. `list_unchunked_parses` and `count_unchunked_parses` used to
 * spell out the same four conditions separately, so the batch and the queue-depth reading could
 * disagree; the second copy exists precisely because the first was wrong and someone had to
 * remember to fix both. On 2026-09-03 this was the third time in a week that "what is outstanding"
 * turned out to be subtly wrong. There is one definition now, and these tests fail if a second one
 * appears.
 *
 * TWO — the trigger becomes `updated_at`. Re-indexing has to fire when a parse's CONTENT changes.
 * If it fires when the ROW is touched, then a lease, a counter, a coverage recompute, a backfill or
 * a future migration's column re-embeds the whole document — and two such writers can chase each
 * other and re-embed in a loop nobody notices until the bill arrives. `updated_at` is legitimate
 * exactly once, in the one-time backfill, and never in the predicate.
 *
 * These read the migration text because there is no SQL test lane in this repo. Comments are
 * stripped first: this file's own migration discusses `updated_at` at length, and a guard that
 * matched its own explanation would pass forever while asserting nothing.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const MIGRATIONS = path.join(import.meta.dirname, "../../../../supabase/migrations");
const FILE = "20260903T40_reindex_when_the_parse_changes.sql";

const sql = readFileSync(path.join(MIGRATIONS, FILE), "utf8");

/** The statements, with every `--` comment line removed. */
const code = sql
  .split(/\r?\n/)
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

/** One `create ... function <name>` body, comments already gone. */
function body(name: string): string {
  const start = code.indexOf(`function public.${name}(`);
  assert.ok(start >= 0, `${name} is not defined in ${FILE}`);
  const open = code.indexOf("$function$", start);
  const close = code.indexOf("$function$", open + 10);
  assert.ok(open >= 0 && close > open, `${name} has no body`);
  return code.slice(open, close);
}

test("🔴 re-indexing triggers on the parse's CONTENT, never on the row being touched", () => {
  assert.equal(
    body("outstanding_parses").includes("updated_at"),
    false,
    "a bookkeeping write must not re-embed a document, and two of them must not be able to loop",
  );
  assert.match(body("outstanding_parses"), /parse_content_digest/);
  // And the digest itself reads only the chunkable text — not the state, not the coverage, not
  // a timestamp.
  assert.match(body("parse_content_digest"), /structure->>'text'/);
  assert.equal(body("parse_content_digest").includes("updated_at"), false);
});

test("🔴 outstanding is defined once and delegated to, never restated", () => {
  for (const reader of ["list_unchunked_parses", "count_unchunked_parses"]) {
    const text = body(reader);
    assert.match(text, /outstanding_parses\(/, `${reader} must read the one definition`);
    // The tells of a restated predicate. Any one of these inside a reader means the definition
    // has been copied and the copies can now disagree.
    for (const restated of ["library_chunks", "unreferenced_at", "units-blocks"]) {
      assert.equal(
        text.includes(restated),
        false,
        `${reader} restates the predicate (${restated}); it must delegate to outstanding_parses`,
      );
    }
  }
});

test("🔴 an unstamped chunk matches an unstamped parse, so a schema change re-embeds nothing", () => {
  // `= ` instead of `is not distinct from` would make every row written before the column existed
  // outstanding at once — the whole corpus re-embedded as a side effect of adding a column.
  assert.match(body("outstanding_parses"), /source_digest is not distinct from/);
});

test("🔴 the writer stamps the digest it was HANDED, and only falls back", () => {
  const writer = body("replace_source_chunks");
  // Recomputing from the row at write time would stamp a reparse that landed mid-index onto chunks
  // built from the content it replaced: permanently stale, and silent.
  assert.match(writer, /coalesce\(\s*p_source_digest/);
  assert.match(writer, /source_digest/);
});

test("🔴 updated_at is used exactly once, in the one-time backfill", () => {
  // There is no digest on the past to compare against, so the clock is the only evidence that a
  // parse outran its chunks. That is sound for a statement that runs once and unsound as a standing
  // rule — so it must appear in the migration's own statements and in no function body.
  const inBodies = ["outstanding_parses", "list_unchunked_parses", "count_unchunked_parses", "parse_content_digest", "replace_source_chunks"]
    .filter((name) => body(name).includes("updated_at"));
  assert.deepEqual(inBodies, [], "no function may decide on the clock");
  assert.equal(
    (code.match(/updated_at/g) ?? []).length,
    1,
    "one use, in the backfill delete; a second one is a standing rule wearing a backfill's clothes",
  );
});
