/**
 * The acceptance checks, run against the parser's own output.
 *
 * 🔴 THIS IS THE CALIBRATION HALF. The same seven checks run against the row
 * production stored (scripts/xlsx-acceptance.mts). If they only ever ran there,
 * a failure could not be told apart from a deploy problem; if they only ran
 * here, they would prove nothing about the boundary. Running both is what makes
 * a production failure diagnosable — local green plus production red means the
 * chain lost it, and that is a different bug from the parser never having it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { xlsxAcceptance } from "./xlsx-acceptance";
import { workbookToModel } from "./xlsx-model";
import { readWorkbook } from "./xlsx-structure";

const FIXTURE = new URL("./fixtures/xlsx/acceptance.xlsx", import.meta.url);

function model() {
  return workbookToModel(readWorkbook(new Uint8Array(readFileSync(FIXTURE))), null);
}

test("every acceptance property holds on the parser's own output", () => {
  const checks = xlsxAcceptance(model(), "local-fixture");
  const failed = checks.filter((check) => !check.ok);
  assert.deepEqual(
    failed.map((check) => `${check.item}. ${check.name} — ${check.found}`),
    [],
  );
  assert.equal(checks.length, 7);
});

/**
 * 🔴 THE FIXTURE IS ROUND-TRIPPED THROUGH LIBREOFFICE, AND THAT IS THE POINT.
 * LibreOffice writes `hidden="true"` where openpyxl writes `hidden="1"` — both
 * legal spellings of the same `xsd:boolean`. Every earlier hidden fixture was
 * openpyxl's, so a reader that only understood `"1"` reported a workbook with
 * nothing hidden and passed every test we had. This asserts the second spelling
 * specifically, at the raw-file level, so the fixture cannot quietly stop
 * carrying the case it exists for.
 */
test("hidden state is read from a file written by a second spreadsheet program", async () => {
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(new Uint8Array(readFileSync(FIXTURE)));
  const sheet = strFromU8(zip["xl/worksheets/sheet1.xml"]!);
  assert.match(sheet, /<row[^>]*hidden="true"/, "the fixture must contain the boolean spelling");
  assert.match(sheet, /<col[^>]*hidden="true"/, "the fixture must contain the boolean spelling");

  const workbook = readWorkbook(new Uint8Array(readFileSync(FIXTURE)));
  const ledger = workbook.sheets.find((s) => s.name === "Ledger")!;
  assert.deepEqual(ledger.hiddenRows, [3], "sheet row 8, four rows below the C5 origin");
  assert.deepEqual(ledger.hiddenColumns, [4], "column G, four columns right of the C5 origin");
});
