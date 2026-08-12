/** What `readCsv` makes of each fixture. Diagnosis, not a gate.
 *
 *   npx tsx scripts/csv-probe.mts lib/notebooks/fixtures/csv
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { readCsv } from "../lib/notebooks/csv-structure.ts";

const dir = process.argv[2] ?? "lib/notebooks/fixtures/csv";
const show = (d: string) => (d === "\t" ? "\\t" : d);

for (const file of readdirSync(dir).filter((f) => f.endsWith(".csv")).sort()) {
  const g = readCsv(new Uint8Array(readFileSync(join(dir, file))));
  console.log(
    `\n${file}\n  ${g.rows}r x ${g.columns}c  cells=${g.cells.length}  delim="${show(g.delimiter)}" ` +
      `(${g.delimiterEvidence})  ${g.encoding}` +
      `${g.unsupported.length ? `  unsupported=${g.unsupported.map((u) => u.kind).join(",")}` : ""}`,
  );
  for (const c of g.cells.slice(0, 7)) console.log(`      (${c.row},${c.column}) ${JSON.stringify(c.text)}`);
  if (g.cells.length > 7) console.log(`      … ${g.cells.length - 7} more`);
}
