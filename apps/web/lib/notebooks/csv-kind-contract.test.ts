/**
 * `ParsedDocKind` and the database CHECK are the same list, written twice.
 *
 * 🔴 THE PAIR NOTHING GUARDED. `document-envelope.test.ts` already pins
 * `DocFormat` against `FORMATS`, because a format missing from one of those
 * makes the whole model read back as null. This is the OTHER pair, and it fails
 * somewhere worse: not at build time and not at parse time, but at INSERT —
 * after the file has been fetched, read, modelled and measured. The upload does
 * all of its work and then throws it away, and the error names a constraint
 * instead of a format.
 *
 * `ParsedDocKind` already carried "xlsx" for months before anything could
 * produce one, so drift in this direction is not hypothetical here.
 *
 * The assertion reads the MIGRATION rather than the live database, so it works
 * offline, in CI, and on a branch whose migration has not been applied yet — and
 * so it fails for whoever adds the next format, not only for this one.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { type ParsedDocKind } from "./parse-record";

const MIGRATIONS = new URL("../../../../supabase/migrations/", import.meta.url);

/** Every value the LAST migration to touch the constraint allows. */
function allowedByDatabase(): string[] {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let latest: string[] | null = null;
  for (const file of files) {
    const sql = readFileSync(new URL(file, MIGRATIONS), "utf8");
    // The last `check (doc_kind in (...))` in the last file that defines one.
    const matches = [...sql.matchAll(/check\s*\(\s*doc_kind\s+in\s*\(([^)]*)\)/gi)];
    const last = matches.at(-1);
    if (last) latest = [...last[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  }
  assert.ok(latest, "no migration defines the doc_kind CHECK");
  return latest!;
}

test("🔴 every ParsedDocKind is a value the database will actually accept", () => {
  // The union has no runtime form, so it is listed here and pinned by the
  // exhaustiveness check below — a value added to the type without being added
  // here is a compile error, not a silent omission.
  const kinds: Record<ParsedDocKind, true> = {
    csv: true,
    docx: true,
    html: true,
    image: true,
    other: true,
    pdf: true,
    pptx: true,
    text: true,
    xlsx: true,
  };

  const allowed = new Set(allowedByDatabase());
  const rejected = Object.keys(kinds).filter((kind) => !allowed.has(kind));
  assert.deepEqual(
    rejected,
    [],
    `these doc kinds would fail the CHECK at INSERT: ${rejected.join(", ")}`,
  );
});

test("the migration list has not silently grown values the type does not know", () => {
  const kinds = new Set<string>(["csv", "docx", "html", "image", "other", "pdf", "pptx", "text", "xlsx"]);
  const extra = allowedByDatabase().filter((value) => !kinds.has(value));
  assert.deepEqual(extra, [], "the database allows kinds ParsedDocKind cannot express");
});
