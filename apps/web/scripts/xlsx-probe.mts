/** What `readWorkbook` makes of each fixture. Diagnosis, not a gate.
 *
 *   npx tsx scripts/xlsx-probe.mts lib/notebooks/fixtures/xlsx
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { formatRef, readWorkbook } from "../lib/notebooks/xlsx-structure.ts";

const dir = process.argv[2] ?? "lib/notebooks/fixtures/xlsx";

for (const file of readdirSync(dir).filter((f) => f.endsWith(".xlsx")).sort()) {
  const wb = readWorkbook(new Uint8Array(readFileSync(join(dir, file))));
  console.log(`\n${"─".repeat(72)}\n${file}`);
  if (wb.unsupported.length) console.log(`  unsupported: ${wb.unsupported.map((u) => `${u.kind}×${u.count}`).join(", ")}`);
  for (const sheet of wb.sheets) {
    const origin = formatRef(sheet.origin.row, sheet.origin.column);
    console.log(
      `  «${sheet.name}»${sheet.hidden ? " [HIDDEN]" : ""} ${sheet.rows}×${sheet.columns} origin=${origin} cells=${sheet.cells.length}` +
      `${sheet.merges.length ? ` merges=${sheet.merges.length}` : ""}` +
      `${sheet.hiddenRows.length ? ` hiddenRows=[${sheet.hiddenRows}]` : ""}` +
      `${sheet.hiddenColumns.length ? ` hiddenCols=[${sheet.hiddenColumns}]` : ""}` +
      `${sheet.tables.length ? ` tables=${sheet.tables.map((t) => `${t.name}@${t.ref}/h${t.headerRowCount}`).join(",")}` : ""}`,
    );
    for (const cell of sheet.cells.slice(0, 8)) {
      const ref = formatRef(cell.row + sheet.origin.row, cell.column + sheet.origin.column);
      const bits = [`${ref}="${cell.text}"`];
      if (cell.formula) bits.push(`=${cell.formula}`);
      if (cell.raw) bits.push(`raw=${cell.raw}`);
      console.log(`      ${bits.join("  ")}`);
    }
    if (sheet.cells.length > 8) console.log(`      … ${sheet.cells.length - 8} more`);
  }
}
