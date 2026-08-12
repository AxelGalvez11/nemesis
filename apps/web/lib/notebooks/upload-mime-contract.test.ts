/**
 * A format the parser accepts must be a format Storage will accept.
 *
 * 🔴 THE FOURTH DOOR, AND THE ONE THAT WAS INVISIBLE. Adding CSV support meant
 * teaching four separate lists about it, each in a different place, each found
 * only by trying a real upload against production:
 *
 *   1. the parser          `kindFor` / `sniffKind`
 *   2. the upload route    a PRIVATE copy of the same list (fixed, #491)
 *   3. the database        the `doc_kind` CHECK — fails at INSERT
 *   4. Storage             `allowed_mime_types` — fails BEFORE any code runs
 *
 * The fourth is the worst of them, because it lived only in the live project:
 * nothing in the repository mentioned it, so no review, diff or test could see
 * it, and the failure it produces is a 415 from the data plane that looks
 * nothing like a parser problem.
 *
 * This asserts the pair from the SOURCE: every MIME type `kindFor` will act on
 * must appear in the bucket's allowlist migration. Decidable offline, and it
 * fails for the NEXT format rather than only for this one.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { kindFor } from "./parse-document";

const MIGRATIONS = new URL("../../../../supabase/migrations/", import.meta.url);

/**
 * Every MIME literal the bucket migrations actually EXECUTE for `library-sources`.
 *
 * 🔴 COMMENTS ARE STRIPPED FIRST, AND THAT IS NOT A DETAIL. The first version of
 * this scanner read every quoted literal in the file — including the ones inside
 * the migration's own explanatory comments, where 'text/csv' is discussed in
 * prose. Deleting the real entry from the executable list left the comment
 * behind, and the guard went on passing. A test that reads its own documentation
 * asserts nothing at all; it was caught only by deliberately breaking the file
 * and expecting a failure that did not come.
 */
function allowedByStorage(): Set<string> {
  const allowed = new Set<string>();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const raw = readFileSync(new URL(file, MIGRATIONS), "utf8");
    if (!raw.includes("library-sources")) continue;
    if (!/allowed_mime_types/.test(raw)) continue;
    const sql = raw
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of sql.matchAll(/'([a-z]+\/[a-z0-9.+-]+)'/gi)) allowed.add(m[1]!.toLowerCase());
  }
  return allowed;
}

/**
 * The MIME types the parser will act on. Kept as literals rather than derived,
 * so that adding one to `kindFor` without adding it here is a visible omission
 * — and the assertion below proves each really is accepted.
 */
const PARSER_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
];

test("every MIME type in the list is really one the parser acts on", () => {
  // Calibration for the list itself: a stale entry here would let the real
  // assertion pass while testing a format nothing parses.
  for (const mime of PARSER_MIMES) {
    assert.ok(kindFor("upload", mime), `${mime} must be a type kindFor recognises`);
  }
});

test("🔴 every format the parser accepts can actually be uploaded", () => {
  const storage = allowedByStorage();
  assert.ok(storage.size > 0, "the bucket allowlist must be represented in the repo, not only in production");

  const unuploadable = PARSER_MIMES.filter((mime) => !storage.has(mime));
  assert.deepEqual(
    unuploadable,
    [],
    "these would be refused by Storage with a 415 before any parser ran: " + unuploadable.join(", "),
  );
});

test("🔴 the allowlist is not widened with a wildcard", () => {
  // A `text/*` would satisfy every other assertion here forever while admitting
  // each future text format without anyone deciding to support it.
  //
  // 🔴 THIS READS THE SQL, NOT THE COLLECTED SET, AND THAT IS THE WHOLE POINT.
  // The first version iterated `allowedByStorage()` — whose own pattern cannot
  // match `text/*`, because the wildcard is not in its character class. So the
  // check was structurally incapable of seeing the thing it was written to
  // catch, and passed happily when a wildcard was inserted. Caught by inserting
  // one and expecting a failure that never arrived.
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const raw = readFileSync(new URL(file, MIGRATIONS), "utf8");
    if (!raw.includes("library-sources") || !/allowed_mime_types/.test(raw)) continue;
    const sql = raw
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n");
    assert.doesNotMatch(sql, /'[a-z]+\/\*'/i, `a wildcard MIME type appears in ${file}`);
  }
});
