/**
 * The seven things a workbook must still be true about after the whole chain.
 *
 * 🔴 THE SAME ASSERTIONS RUN TWICE, ON PURPOSE. Once locally against the parser's
 * own output, and once against the row production actually stored — decoded back
 * through `readDocumentModel`, not read out of the raw JSON. A check written
 * twice drifts; a check written once and pointed at two models cannot.
 *
 * They are deliberately about MEANING rather than shape. Every one of them can
 * fail while the document round-trips perfectly:
 *
 *   - a sheet count is right while the sheet NAMES are gone
 *   - a grid is preserved exactly while every reference into it is misplaced
 *   - `0.075` survives byte-for-byte while the source said `7.5%`
 *   - a currency amount survives with its currency deleted
 *   - a formula survives with its result, or its result with the formula
 *   - hidden rows vanish and the grid looks entirely healthy without them
 *   - all six of the above pass and no consumer can address a single cell
 *
 * Bound to `fixtures/xlsx/acceptance.xlsx`, which is built to carry all seven at
 * once (see scripts/make-xlsx-fixtures.py). Exact expected values are correct
 * here precisely BECAUSE the input is a known file.
 */

import { type DocumentModel, type DocTable } from "@nemesis/shared";

import { cellAtRef, sourceContextFromModel, type SourceContext } from "@/lib/sources/source-context";

import { cellRef } from "./xlsx-model";

export interface AcceptanceCheck {
  /** The owner's numbered acceptance item. */
  item: number;
  name: string;
  ok: boolean;
  /** What was actually found — printed whether it passed or failed, so a pass is
   *  evidence rather than a tick. */
  found: string;
}

const SHEETS = ["Ledger", "Catalog", "Internal"];

function tableOfSheet(model: DocumentModel, name: string): DocTable | null {
  const index = model.units.findIndex((unit) => unit.label?.trim() === name);
  if (index < 0) return null;
  const block = model.blocks.find((b) => b.unit === index && b.kind === "table");
  return block?.table ?? null;
}

/** The cell at an A1 reference, found the way a citation would find it: by
 *  reference string, never by index. */
function cellAt(table: DocTable, ref: string) {
  return (table.cells ?? []).find((cell) => cellRef(table, cell.row, cell.column) === ref) ?? null;
}

/**
 * Resolve `"Ledger"` + `"E7"` to what that cell shows, using ONLY what the
 * extraction boundary exposes — no reaching back into the model.
 *
 * 🔴 THIS IS ITEM 7, AND IT IS THE ONE THAT CAN FAIL SILENTLY. If the boundary
 * drops the grid's origin, this does not throw: it computes a different cell, or
 * falls off the end of a grid that is four rows tall. "Nothing came back" and
 * "the wrong cell came back" both mean the citation is not addressable, which is
 * the entire reason a workbook is stored as a grid instead of as prose.
 */
export function addressCell(
  context: SourceContext,
  sheet: string,
  ref: string,
): { text: string; via: string } | null {
  for (const unit of context.units) {
    if (unit.unitLabel?.trim() !== sheet) continue;
    // The origin arithmetic is the BOUNDARY's, not ours — see `cellAtRef`. Doing it
    // here is how the `?? 0` A1 assumption gets rewritten by every new consumer.
    const text = cellAtRef(unit, ref);
    if (text === null) continue;
    return { text, via: `unit ${unit.anchor.page} «${sheet}»` };
  }
  return null;
}

export function xlsxAcceptance(model: DocumentModel, sourceId: string): AcceptanceCheck[] {
  const checks: AcceptanceCheck[] = [];
  const add = (item: number, name: string, ok: boolean, found: string) =>
    checks.push({ found, item, name, ok });

  // ── 1. workbook and sheet identity ───────────────────────────────────────
  // The NAMES, not the count. Units are rebuilt field by field at the boundary,
  // and `label` is the field that has been deleted that way before.
  const labels = model.units.map((unit) => unit.label?.trim() ?? "");
  const kinds = [...new Set(model.units.map((unit) => unit.kind))];
  add(
    1,
    "sheet identity — the tab names the author typed",
    labels.join("|") === SHEETS.join("|") && kinds.join(",") === "sheet",
    `format=${model.format} units=[${labels.join(", ")}] kinds=[${kinds.join(",")}]`,
  );

  // ── 2. a non-A1 origin resolves literally ────────────────────────────────
  const ledger = tableOfSheet(model, "Ledger");
  const topLeft = ledger ? cellRef(ledger, 0, 0) : "—";
  const firstCell = ledger ? cellAt(ledger, "C5") : null;
  add(
    2,
    "C5 is cited as C5, not A1",
    topLeft === "C5" && firstCell?.text === "Cohort",
    `top-left=${topLeft} origin=${JSON.stringify(ledger?.origin ?? null)} C5=${JSON.stringify(firstCell?.text ?? null)}`,
  );

  // ── 3. a percentage shows what the author saw, and keeps what the file stores ─
  const percent = ledger ? cellAt(ledger, "E7") : null;
  add(
    3,
    "a percentage keeps display, raw value AND format evidence",
    percent?.text === "7.5%" && percent?.raw === "0.075" && percent?.format === "0.0%",
    `E7 text=${JSON.stringify(percent?.text ?? null)} raw=${JSON.stringify(percent?.raw ?? null)} format=${JSON.stringify(percent?.format ?? null)}`,
  );

  // ── 4. currency identity ─────────────────────────────────────────────────
  // 🔴 THE SYMBOL IS THE FACT. "4,500.00" is not the same claim as "$4,500.00",
  // and a workbook of fees whose currency was deleted reads as a bare number.
  const money = ledger ? cellAt(ledger, "F7") : null;
  add(
    4,
    "a currency cell keeps its currency",
    money?.text === "$4,500.00" && money?.raw === "4500" && (money?.format ?? "").includes("$"),
    `F7 text=${JSON.stringify(money?.text ?? null)} raw=${JSON.stringify(money?.raw ?? null)} format=${JSON.stringify(money?.format ?? null)}`,
  );

  // ── 5. a formula and its cached result are different facts ───────────────
  const derived = ledger ? cellAt(ledger, "E6") : null;
  add(
    5,
    "a formula keeps BOTH the formula and its displayed result",
    Boolean(derived?.formula) && derived?.text === "77.5%" && derived?.raw === "0.775",
    `E6 formula=${JSON.stringify(derived?.formula ?? null)} text=${JSON.stringify(derived?.text ?? null)} raw=${JSON.stringify(derived?.raw ?? null)}`,
  );

  // ── 6. hidden state, at all three levels ─────────────────────────────────
  const hiddenSheet = model.units.find((unit) => unit.label?.trim() === "Internal")?.hidden === true;
  const hiddenRow = (ledger?.hiddenRows ?? []).includes(3);
  const hiddenColumn = (ledger?.hiddenColumns ?? []).includes(4);
  add(
    6,
    "hidden sheet, hidden row and hidden column all survive",
    hiddenSheet && hiddenRow && hiddenColumn,
    `sheet «Internal» hidden=${hiddenSheet} Ledger hiddenRows=${JSON.stringify(ledger?.hiddenRows ?? [])} hiddenColumns=${JSON.stringify(ledger?.hiddenColumns ?? [])}`,
  );

  // ── 7. a consumer can address a real sheet/cell reference ────────────────
  const context = sourceContextFromModel({ model, sourceId, sourceKind: "xlsx" });
  const addressed = addressCell(context, "Ledger", "E7");
  add(
    7,
    "source-context addressing resolves Ledger!E7",
    addressed?.text === "7.5%",
    addressed ? `Ledger!E7 → ${JSON.stringify(addressed.text)} (${addressed.via})` : "Ledger!E7 → nothing resolved",
  );

  return checks;
}
