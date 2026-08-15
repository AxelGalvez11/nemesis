/**
 * Every argument the worker sends to a parse RPC must be one that RPC declares.
 *
 * 🔴 THE BUG THIS EXISTS FOR COST A COMPLETED PARSE, SILENTLY, EVERY TIME.
 *
 * `finish_document_parse` declares `p_peak_rss_mb`. The worker called it with
 * `p_parse_peak_rss_mb` — the COLUMN's name (`parse_peak_rss_mb`), which is genuinely
 * different from the ARGUMENT's — from the day it was written.
 *
 * PostgREST resolves an RPC by its argument NAMES. One wrong name is not a wrong value;
 * it is "no function matches", returned as a PostgrestError. So the worker fetched the
 * document, parsed it, paid for its figures, and then threw the whole result away at the
 * last step and recorded a failure. `parsed_document_id` stayed null forever.
 *
 * Nothing caught it:
 *   * Unit tests mock the Supabase client, so any argument name "works".
 *   * TypeScript cannot type an RPC's arguments from a .sql file.
 *   * Production could not catch it either, because the worker had never once run — the
 *     Vault secrets that let pg_cron call it were never set.
 *
 * So this test reads the MIGRATION — the definition that is actually deployed — and the
 * ROUTE, and compares them. It is deliberately a string-level check: the whole failure is
 * that the two sides are strings nothing compares.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test, { describe } from "node:test";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const MIGRATIONS = join(REPO, "supabase", "migrations");
const ROUTE = join(REPO, "apps", "web", "app", "api", "documents", "parse", "worker", "route.ts");

/**
 * The argument names a function declares, taken from the LAST migration that defines it.
 *
 * Last, not first: these functions are redefined by later migrations, and the deployed
 * signature is whichever ran most recently. Reading the first would test a definition
 * that no longer exists.
 */
function declaredArguments(functionName: string): Set<string> {
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let found: Set<string> | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    // `create or replace function public.<name>( ... )` up to the closing paren before
    // `returns`. Arguments are `p_something type`, one per line in this codebase.
    const match = sql.match(
      new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\(([^)]*)\\)`, "i"),
    );
    if (match) found = new Set([...match[1]!.matchAll(/\bp_[a-z0-9_]+/gi)].map((m) => m[0]!.toLowerCase()));
  }
  if (!found) throw new Error(`no migration defines public.${functionName}`);
  return found;
}

/** The argument names the route passes in its `admin.rpc("<name>", { ... })` call. */
function passedArguments(source: string, functionName: string): Set<string> {
  const at = source.indexOf(`"${functionName}"`);
  assert.notEqual(at, -1, `the route does not call ${functionName}`);
  const open = source.indexOf("{", at);
  // Walk braces so a nested object inside the payload cannot end the scan early.
  let depth = 0;
  let close = open;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
  }
  const payload = source.slice(open, close + 1);
  return new Set([...payload.matchAll(/(?:^|[{,\s])(p_[a-z0-9_]+)\s*:/gi)].map((m) => m[1]!.toLowerCase()));
}

const ROUTE_SOURCE = readFileSync(ROUTE, "utf8");

const CALLED = [
  "claim_document_parses",
  "fail_document_parse",
  "finish_document_parse",
  "renew_document_parse_lease",
  "reserve_vision_units",
  "settle_vision_units",
] as const;

describe("the worker's RPC arguments exist on the deployed functions", () => {
  for (const name of CALLED) {
    test(`${name}: every argument the route sends is declared`, () => {
      const declared = declaredArguments(name);
      const passed = passedArguments(ROUTE_SOURCE, name);
      assert.ok(passed.size > 0, `found no p_ arguments in the ${name} call — the scan is broken, not the code`);
      const undeclared = [...passed].filter((argument) => !declared.has(argument));
      assert.deepEqual(
        undeclared,
        [],
        `${name} does not declare ${undeclared.join(", ")}. PostgREST resolves by argument NAME, ` +
          `so this is "no function matches", not a wrong value. Declared: ${[...declared].sort().join(", ")}`,
      );
    });
  }

  test("the scan actually reads the real signatures, so an empty read cannot pass silently", () => {
    // 🔴 A SCANNING GUARD'S FAILURE MODE IS FINDING NOTHING. If the regex stopped matching,
    // `declared` would be empty, `undeclared` would be everything, and the tests above
    // would fail loudly — but if `passed` were empty instead, they would all pass while
    // checking nothing. Both sides are asserted non-trivial here.
    const declared = declaredArguments("finish_document_parse");
    assert.ok(declared.has("p_source_id"), "the migration scan lost its arguments");
    assert.ok(declared.has("p_peak_rss_mb"), "the migration declares p_peak_rss_mb, not p_parse_peak_rss_mb");
    assert.ok(declared.size >= 10, `expected the full signature, read ${declared.size}`);
    assert.ok(passedArguments(ROUTE_SOURCE, "finish_document_parse").size >= 10, "the route scan lost its arguments");
  });
});
