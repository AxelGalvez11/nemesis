# XLSX and CSV — proposed minimal implementation

Written against the architecture as it stands on `main` after the 2026-08-11
structure pass. Every call site named here was read, not assumed.

**Not implemented.** This is the proposal the owner asked for as report item 8.

## The headline: the model already fits, the boundary does not

`DocTable` after this pass is `{ rows, cells?, headerRows, columns?, … }` where
`DocCell` carries `row`, `column`, `rowSpan`, `colSpan` and `rows` is the
projection of `cells`. A worksheet **is** that: a grid of addressed cells with
merged ranges. `DocUnitKind` already includes `"sheet"`, and `describeLocator`
already says "sheet 3" for it.

So there is no new representation to design, and building one would be the
"second canonical document representation" the brief forbids. What is missing is
plumbing, plus **two boundary traps that are silent if missed**.

## 🔴 Trap 1 — the FORMATS set, or every stored parse validates to null

`packages/shared/src/document-envelope.ts`:

```ts
const FORMATS = new Set(["pdf", "docx", "pptx", "image"]);
```

`readDocumentModel` returns `null` when `format` is not in this set. `null` then
flows to `storedDocumentModel`, where it is **indistinguishable from a parse that
predates the canonical model** — so a spreadsheet would parse perfectly, store
perfectly, and read back as "old data with no structure", with no error anywhere.

That is the identical failure that left `source-index` skipping every document
for months. Adding `"xlsx"` / `"csv"` to `DocFormat` **and** to this set must
happen in the same commit, with a round-trip test.

## 🔴 Trap 2 — `DocUnit` is rebuilt field-by-field

Same file. Units are reconstructed from `index`, `kind`, `label`, `size` only —
the file's own comment records that this once deleted `label` silently. Blocks,
by contrast, pass through whole, which is why `cells` survived for free.

**Consequence for the design:** a sheet's identity must ride in fields that
already exist. `unit.label` is the sheet name — exactly what `label` is for ("the
author's own name for the unit"). Do **not** add `DocUnit.sheetIndex` or
`DocUnit.hidden` without also editing this validator; a new unit field dies here.

Hidden sheets and named ranges therefore belong on the **block**, not the unit,
or in a later change that updates the validator deliberately.

## Representation

```
Workbook          → DocumentModel { format: "xlsx" }
  Sheet           → DocUnit { kind: "sheet", index, label: sheetName }
    used range    → DocBlock { kind: "table", table: { cells, rows, headerRows } }
      cell        → DocCell { row, column, text, rowSpan?, colSpan? }
```

One table block per sheet, not per detected region. Region detection on a
spreadsheet is a guess; the used range is a fact.

### Displayed value vs formula vs raw value

The brief asks that "formulas are not mistaken for displayed values". Three
values exist and they are not interchangeable:

* **displayed** — what a person reading the file sees. This is `DocCell.text`,
  because everything downstream quotes `text` and a citation must match what the
  student sees on screen.
* **raw** — the underlying number/date before formatting.
* **formula** — `=SUM(B2:B9)`.

`DocCell` has no place for the other two, and adding `raw`/`formula` to it in
`packages/shared` widens a type every format shares for the benefit of one.
**Recommended: ship phase 1 with `text` = displayed value only**, and record in
capabilities that formulas were not extracted. Reason: a formula shown to a model
as if it were a value is worse than an absent formula, and `text` is the only
field with a guaranteed meaning today.

If formulas are wanted later, the honest shape is a sibling optional field on
`DocCell` (`formula?: string`), added together with an envelope round-trip test —
not a second parallel structure.

🔴 **A cached displayed value can be stale.** XLSX stores the last-calculated
value; a file edited by a tool that does not recalculate carries a value that no
longer matches its formula. Phase 1 should read the cached value and say so,
rather than evaluating formulas — evaluation is a spreadsheet engine, not a
parser.

### Merged ranges

`<mergeCells><mergeCell ref="B2:D2"/></mergeCells>` maps directly onto
`rowSpan`/`colSpan`. Excel's convention matches ours exactly: the value lives in
the top-left cell of the range and the covered cells are empty. So
`projectCells` already produces the right grid and `cellText` already resolves
it — no new logic.

### Header rows

`headerRows: 0` unless the sheet declares a table part
(`xl/tables/table1.xml`, which states `headerRowCount`). **Do not infer a header
from "row 1 is bold" or "row 1 is all text".** The PDF lane learned this the
expensive way: `headerRowsOf` promoted a data row to column names, and
`segmentsOf` skips header rows, so an uncorroborated header silently deletes a
record. A spreadsheet's first row genuinely is data very often.

## CSV

Deterministic, no LLM, no zip.

```
bytes → encoding → delimiter → rows → cells → DocTable
```

* **Encoding**: honour a UTF-8/UTF-16 BOM; otherwise UTF-8, and on invalid
  sequences fall back to windows-1252 rather than emitting replacement
  characters. Record which was used.
* **Delimiter**: count `,` `;` `\t` `|` outside quotes across the first N lines
  and take the one with the most *consistent* per-line count — not the most
  frequent. A prose column full of commas beats a semicolon file on raw count.
  **A tie is a refusal**: parse as one column rather than guessing.
* **Quoting**: RFC 4180 — `""` is a literal quote, a quoted field may contain the
  delimiter and newlines. Multiline quoted values are why a line-splitting
  implementation is wrong.
* **Header**: inferred **only** when row 1 is all non-empty, all distinct, and at
  least one later row differs from it in type shape. Otherwise `headerRows: 0`.
  Duplicate headers are kept verbatim, never de-duplicated with suffixes — a
  renamed column is a fabricated column name.
* **Ragged rows**: pad to the widest row. Never drop a short row, never truncate
  a long one — both lose data, and `projectCells` requires a rectangle anyway.
* One `body` unit — a CSV has no pages. Locator is `row N` + column/header, which
  `headingPath` on the block plus the cell's `row`/`column` already expresses.

## Call sites to change

| Where | Change |
|---|---|
| `packages/shared/src/document-model.ts` | `DocFormat` += `"xlsx" \| "csv"` |
| `packages/shared/src/document-envelope.ts` | **`FORMATS` set** — trap 1 |
| `apps/web/lib/notebooks/parse-document.ts` | `DocumentKind`, `kindFor`, `sniffKind` (XLSX is a zip containing `xl/workbook.xml`; CSV has no magic — extension/MIME only), and a branch in `parseDocument` |
| `apps/web/lib/notebooks/extract-coverage.ts` | a `sheetCoverage`, units = sheets |
| `apps/web/lib/sources/source-capabilities.ts` | `STRUCTURED_BY_NATURE` += xlsx; a `spreadsheetGrid` capability |
| `apps/web/lib/workspace/chat-attachments.ts` | `DOCUMENT_EXTENSIONS` + MIME map |
| `supabase/functions/source-index` | nothing — it consumes the envelope, which is why this stays one representation |
| tests | envelope round-trip (trap 1), merged-range fixture, CSV quoting/delimiter fixtures |

## Scope limits to state up front

Not in phase 1, and each should be reported as **unknown** rather than absent:
charts, pivot tables, conditional formatting, cell comments, named ranges, images
on sheets, hidden rows/columns, defined print areas, multi-sheet formulas.

## Before any of this is written

**There is no XLSX or CSV in the corpus** — `xlsx: 0, csv: 0`. Every row for
these formats in `docs/parser-acceptance-matrix.md` currently reads "not
measured — no sample available", and it must keep reading that until real files
exist to measure. A parser shipped against synthetic fixtures alone would repeat
the mistake this pass exists to correct: the DOCX and PPTX defects found here
were all invisible to the unit tests and visible only on real documents.
