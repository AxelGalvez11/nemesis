/**
 * The eight things a delimited file must still be true about after the chain.
 *
 * 🔴 THE SAME ASSERTIONS RUN TWICE, exactly as XLSX's do — once against the
 * parser's own output, once against the row production stored, decoded back
 * through `readDocumentModel`. Written once so the two cannot drift; run twice
 * so a production failure is diagnosable rather than ambiguous.
 *
 * Every one of these can fail while the document round-trips perfectly:
 *
 *   - the format decodes, or the WHOLE model reads back as null
 *   - a grid survives while nothing can address a cell in it
 *   - a quoted comma becomes a column boundary
 *   - a doubled quote becomes two characters
 *   - an absent cell and an empty one merge into "blank"
 *   - a blank line is dropped and every row below it renumbers
 *   - padding is tidied away and `007` becomes `7`
 *   - a header is invented because row 1 looks like one
 *
 * Bound to `fixtures/csv/acceptance.csv`, built to carry all eight at once.
 */

import { type DocumentModel, type DocTable } from "@nemesis/shared";

import { cellAtRef, sourceContextFromModel, type SourceContext } from "@/lib/sources/source-context";

export interface AcceptanceCheck {
  item: number;
  name: string;
  ok: boolean;
  found: string;
}

const tableOf = (model: DocumentModel): DocTable | null =>
  model.blocks.find((block) => block.kind === "table")?.table ?? null;

/**
 * The sole grid of a delimited file, found the way a consumer must find it.
 *
 * 🔴 A CSV UNIT HAS NO LABEL AND MUST NOT. `xlsx-model` states the rule: never
 * the filename. So there is no sheet name to look up — a CSV has exactly ONE
 * grid, and that is what makes addressing it unambiguous without one.
 */
export function soleGrid(context: SourceContext) {
  const tables = context.units.filter((unit) => unit.type === "table");
  return tables.length === 1 ? tables[0]! : null;
}

export function csvAcceptance(model: DocumentModel, sourceId: string): AcceptanceCheck[] {
  const checks: AcceptanceCheck[] = [];
  const add = (item: number, name: string, ok: boolean, found: string) =>
    checks.push({ found, item, name, ok });

  const table = tableOf(model);
  const at = (row: number, column: number) =>
    (table?.cells ?? []).find((cell) => cell.row === row && cell.column === column);

  // ── 1. the format decodes at all ─────────────────────────────────────────
  add(
    1,
    "the csv model survives the boundary — FORMATS and DocFormat are two lists",
    model.format === "csv" && model.units.length === 1 && model.units[0]?.kind === "sheet",
    `format=${model.format} units=${model.units.length} kind=${model.units[0]?.kind} label=${JSON.stringify(model.units[0]?.label ?? null)}`,
  );

  // ── 2. no header is claimed, because the file never said ─────────────────
  add(
    2,
    "no header is inferred from a row that merely looks like one",
    table?.headerRows === 0 && table?.columns === undefined,
    `headerRows=${table?.headerRows} columns=${JSON.stringify(table?.columns ?? null)}`,
  );

  // ── 3. quoting, the three ways it hides a cell ────────────────────────────
  const quotedComma = at(1, 1)?.text;
  const doubledQuote = at(2, 1)?.text;
  const multiline = at(3, 1)?.text;
  add(
    3,
    "a quoted delimiter, a doubled quote and a multi-line field all survive",
    quotedComma === "Comma, inside" && doubledQuote === 'She said "ok"' && multiline === "Two\r\nlines",
    `B2=${JSON.stringify(quotedComma ?? null)} B3=${JSON.stringify(doubledQuote ?? null)} B4=${JSON.stringify(multiline ?? null)}`,
  );

  // ── 4. an absent cell is not an empty one ────────────────────────────────
  const emptyMiddle = at(2, 2);
  const raggedPresent = at(5, 1);
  const raggedAbsent = at(5, 2);
  add(
    4,
    "an empty middle field exists and is empty; a short row's missing cell does NOT exist",
    emptyMiddle?.text === "" && raggedPresent?.text === "short" && raggedAbsent === undefined,
    `C3=${JSON.stringify(emptyMiddle?.text ?? null)} (present=${emptyMiddle !== undefined}) ` +
      `B6=${JSON.stringify(raggedPresent?.text ?? null)} C6=${raggedAbsent === undefined ? "absent" : "PRESENT"}`,
  );

  // ── 5. a blank line is a row ─────────────────────────────────────────────
  const rowsWithCells = [...new Set((table?.cells ?? []).map((cell) => cell.row))].sort((a, b) => a - b);
  add(
    5,
    "a blank line is a ROW — the ragged row is still row 6, not row 5",
    rowsWithCells.join(",") === "0,1,2,3,5",
    `rows carrying cells: [${rowsWithCells.join(", ")}] (row 4 is the blank line)`,
  );

  // ── 6. nothing is tidied ─────────────────────────────────────────────────
  const padded = at(1, 3)?.text;
  const numeric = at(2, 3)?.text;
  add(
    6,
    "padding and a numeric-looking string are left exactly as written",
    padded === " spaced " && numeric === "007",
    `D2=${JSON.stringify(padded ?? null)} D3=${JSON.stringify(numeric ?? null)}`,
  );

  // ── 7. the byte-order mark is gone from the first cell ───────────────────
  const first = at(0, 0)?.text;
  add(
    7,
    "the BOM was removed, so the first header is the word the author typed",
    first === "Student",
    `A1=${JSON.stringify(first ?? null)} (a surviving BOM would read identically here)`,
  );

  // ── 8. a consumer can address a cell ─────────────────────────────────────
  //
  // 🔴 A KNOWN LIMIT, ASSERTED RATHER THAN WISHED AWAY. `CanonicalSourceTable`
  // exposes `rows`, which `projectCells` builds as a RECTANGLE — so a short row
  // is padded to the grid's width there. The absent-versus-empty distinction is
  // real and survives in `cells` (check 4 asserts it on the persisted model), and
  // it does NOT survive into `rows`: at the boundary, `C6` of a two-field row
  // reads as "" exactly like a genuinely empty field would.
  //
  // That is recorded here rather than papered over, because it is precisely the
  // shape of loss this programme keeps finding: the model is right, the boundary
  // is narrower, and nothing errors. Closing it means carrying `cells` across the
  // boundary, which is a decision for the boundary — not something to smuggle in
  // under a CSV acceptance run.
  const context = sourceContextFromModel({ model, sourceId, sourceKind: "csv" });
  const grid = soleGrid(context);
  const resolved = grid ? cellAtRef(grid, "B2") : null;
  const shortRowCell = grid ? cellAtRef(grid, "C6") : null;
  const offGrid = grid ? cellAtRef(grid, "Z99") : "not-null";
  add(
    8,
    "source-context addressing resolves B2, and refuses a reference off the grid",
    resolved === "Comma, inside" && offGrid === null && shortRowCell === "",
    grid
      ? `B2 → ${JSON.stringify(resolved)} · Z99 → ${JSON.stringify(offGrid)} · ` +
        `C6 → ${JSON.stringify(shortRowCell)} (KNOWN LIMIT: rows is rectangular, so a short row's ` +
        `absent cell reads as empty here even though the stored cells say otherwise)`
      : "no sole grid found — a CSV must present exactly one table unit",
  );

  return checks;
}
