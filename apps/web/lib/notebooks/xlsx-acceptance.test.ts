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

import { sourceContextFromModel } from "@/lib/sources/source-context";

import { addressCell, xlsxAcceptance } from "./xlsx-acceptance";
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
 * 🔴 THE CALIBRATION. A CHECK NEVER SEEN FAILING IS NOT KNOWN TO CHECK ANYTHING.
 *
 * Two DIFFERENT defects lose the origin, and they are worth pinning separately
 * because they fail differently — which is what makes a red run diagnosable.
 */
test("🔴 a parser that loses the origin fails every check that names a cell", () => {
  const broken = model();
  for (const block of broken.blocks) if (block.table) delete block.table.origin;

  const checks = xlsxAcceptance(broken, "local-fixture");
  assert.deepEqual(
    checks.filter((check) => !check.ok).map((check) => check.item),
    [2, 3, 4, 5, 7],
    "every check that looks a cell up BY REFERENCE — which is all of them but two",
  );
  // 1 (sheet names) and 6 (hidden state) do not name a cell, so they still pass.
  // A calibration that broke everything would prove nothing about which check
  // is load-bearing for what.
  assert.deepEqual(checks.filter((check) => check.ok).map((check) => check.item), [1, 6]);
});

test("🔴 a BOUNDARY that loses the origin fails item 7 alone — the model looks perfect", () => {
  // The live defect, exactly: the parser had the origin, persistence kept it, and
  // `sourceContextFromModel` dropped it on the way to the consumer. Items 1–6 read
  // the model and all pass; nothing is missing, nothing throws, and no cell in the
  // workbook can be addressed. That asymmetry is the reason item 7 exists.
  const context = sourceContextFromModel({ model: model(), sourceId: "s", sourceKind: "xlsx" });
  for (const unit of context.units) if (unit.table) delete unit.table.origin;

  assert.equal(addressCell(context, "Ledger", "E7"), null, "the offset sheet loses every reference");
  // 🔴 And a sheet that HAPPENS to start at A1 keeps working, which is why this
  // shipped unnoticed: two of the three sheets are unaffected.
  assert.equal(addressCell(context, "Catalog", "B2")?.text, "Beaker");
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
