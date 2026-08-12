/**
 * Every door agrees about what a file IS.
 *
 * 🔴 THE DEFECT THIS EXISTS FOR: the upload route carried its own private
 * `kindFor`/`sniffKind`, written before the canonical pair moved into
 * `parse-document.ts`. The worker route imported the real ones. So when .xlsx
 * support landed, the parser learned about spreadsheets, the worker learned with
 * it, and the door every interactive upload comes through kept answering
 * 415 "Unsupported file" — a finished parser behind a shut door, which is
 * indistinguishable from no parser at all.
 *
 * Nothing caught it. Every unit test exercised the canonical copy; a route's
 * private function is not importable, so nothing could test it directly, and
 * `sniffKind` resolving to a local definition is not a type error.
 *
 * So the assertion is about the SOURCE: a route may not define its own answer to
 * a question `parse-document` already answers. That is decidable by reading the
 * file, cannot go stale as formats are added, and fails for the next format
 * rather than only for this one.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { kindFor, sniffKind } from "./parse-document";

/** Server entry points that must decide a file's format the same way. */
const DOORS = [
  "../../app/api/notebooks/extract/file/route.ts",
  "../../app/api/documents/parse/worker/route.ts",
];

for (const door of DOORS) {
  test(`🔴 ${door.split("/api/")[1]} imports the format decision rather than owning one`, () => {
    const source = readFileSync(new URL(door, import.meta.url), "utf8");

    assert.match(
      source,
      /import \{[^}]*\bkindFor\b[^}]*\} from "@\/lib\/notebooks\/parse-document"/,
      "must import kindFor from parse-document",
    );
    assert.match(
      source,
      /import \{[^}]*\bsniffKind\b[^}]*\} from "@\/lib\/notebooks\/parse-document"/,
      "must import sniffKind from parse-document",
    );
    // The half that actually caught the bug: importing is not enough if a local
    // definition shadows it.
    assert.doesNotMatch(
      source,
      /function (kindFor|sniffKind)\s*\(/,
      "must not define its own — a second list drifts the moment a format is added",
    );
    // A route that spells the magic bytes or the Office MIME strings itself is
    // re-deriving the same decision under another name.
    assert.doesNotMatch(
      source,
      /openxmlformats-officedocument\.(wordprocessingml|presentationml|spreadsheetml)/,
      "must not carry its own Office MIME table",
    );
  });
}

/** The canonical decision itself, on the format this was found by. */
test("a workbook is recognised by name, by declared type, and by contents", () => {
  const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  assert.equal(kindFor("budget.xlsx", ""), "xlsx");
  assert.equal(kindFor("no-extension", XLSX_MIME), "xlsx");

  // Contents, for the file whose name lost its extension.
  const bytes = new Uint8Array(readFileSync(new URL("./fixtures/xlsx/acceptance.xlsx", import.meta.url)));
  assert.equal(sniffKind(bytes), "xlsx");
  assert.equal(kindFor("acceptance", "") ?? sniffKind(bytes), "xlsx", "the route's own expression");
});
