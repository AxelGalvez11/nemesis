/**
 * The CSV acceptance checks against the parser's own output, plus calibration.
 *
 * 🔴 LOCAL GREEN + PRODUCTION RED MEANS THE CHAIN LOST IT, which is a different
 * bug from the parser never having it. That distinction only exists because the
 * same eight checks run in both places.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readDocumentModel, structureEnvelope, type DocumentModel } from "@nemesis/shared";

import { cellAtRef, sourceContextFromModel } from "@/lib/sources/source-context";

import { csvAcceptance, soleGrid } from "./csv-acceptance";
import { csvToModel } from "./csv-model";
import { readCsv } from "./csv-structure";

const FIXTURE = new URL("./fixtures/csv/acceptance.csv", import.meta.url);

/** Through the envelope and back, exactly as production stores it. */
function model(): DocumentModel {
  const built = csvToModel(readCsv(new Uint8Array(readFileSync(FIXTURE))));
  const envelope = JSON.parse(JSON.stringify(structureEnvelope({ model: built, text: "", title: null })));
  const back = readDocumentModel(envelope.model);
  assert.ok(back, "the acceptance fixture must decode");
  return back!;
}

test("every acceptance property holds on the parser's own output", () => {
  const checks = csvAcceptance(model(), "local-fixture");
  assert.deepEqual(
    checks.filter((check) => !check.ok).map((check) => `${check.item}. ${check.name} — ${check.found}`),
    [],
  );
  assert.equal(checks.length, 8);
});

test("🔴 the fixture really does carry a BOM and a ragged row", () => {
  // A composite fixture that quietly stopped containing its hard cases would let
  // every check pass while testing nothing. Assert the BYTES, not the parse.
  const bytes = readFileSync(FIXTURE);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "a UTF-8 BOM");
  const grid = readCsv(new Uint8Array(bytes));
  assert.equal(grid.rows, 6, "including the blank line");
  assert.equal(grid.columns, 4);
  assert.equal(grid.cells.length, 18, "4+4+4+4 then a blank row then 2 — not 24");
});

test("🔴 a padded cell that gets trimmed fails check 6, not silently", () => {
  // Calibration: reproduce the tidying a well-meaning refactor would introduce.
  const broken = model();
  for (const block of broken.blocks) {
    for (const cell of block.table?.cells ?? []) cell.text = cell.text.trim();
  }
  const failed = csvAcceptance(broken, "local").filter((check) => !check.ok).map((check) => check.item);
  assert.deepEqual(failed, [6], "only the check that exists for it");
});

test("🔴 padding a short row to the grid's width fails check 4", () => {
  // The other direction: inventing the missing cell rather than losing a real one.
  const broken = model();
  for (const block of broken.blocks) {
    block.table?.cells?.push({ column: 2, row: 5, text: "" });
  }
  const failed = csvAcceptance(broken, "local").filter((check) => !check.ok).map((check) => check.item);
  assert.deepEqual(failed, [4], "the cell model is where absence lives");
});

/**
 * 🔴 THE LIMIT NAMED IN CHECK 8, PINNED SO IT CANNOT DRIFT UNNOTICED.
 *
 * `cells` distinguishes an absent cell from an empty one; `rows` — the
 * rectangular projection the extraction boundary exposes — cannot. Both facts
 * are asserted here together, so if anyone later carries `cells` across the
 * boundary this test fails and the limitation gets removed deliberately rather
 * than the comment quietly going stale.
 */
test("🔴 absence survives in cells and is FLATTENED in rows — both, on purpose", () => {
  const built = model();
  const table = built.blocks.find((b) => b.kind === "table")!.table!;

  const absent = (table.cells ?? []).find((c) => c.row === 5 && c.column === 2);
  assert.equal(absent, undefined, "the stored cells know row 6 has no third field");
  assert.equal(table.rows[5]![2], "", "and the rectangular projection cannot say so");

  const context = sourceContextFromModel({ model: built, sourceId: "s", sourceKind: "csv" });
  assert.equal(cellAtRef(soleGrid(context)!, "C6"), "", "so a consumer sees empty, not absent");
});

test("🔴 a CSV presents exactly one grid, addressable without a sheet name", () => {
  const context = sourceContextFromModel({ model: model(), sourceId: "s", sourceKind: "csv" });
  const grid = soleGrid(context);
  assert.ok(grid, "exactly one table unit");
  assert.equal(grid!.unitLabel, undefined, "and no invented name for it");
});
