// Regenerates supabase/functions/ask/doaj-registry.data.ts from DOAJ's bulk journal metadata.
// DOAJ publishes every vetted open-access journal (with its print + online ISSNs) as one CSV.
//
//   deno run --allow-net --allow-read --allow-write scripts/gen-doaj-registry.ts
//
// Run this periodically (journals join/leave DOAJ) and commit the regenerated data file.

import { parse } from "https://deno.land/std@0.224.0/csv/mod.ts";

const CSV_URL = "https://doaj.org/csv";
const OUT = new URL("../supabase/functions/ask/doaj-registry.data.ts", import.meta.url);
const ISSN_COLS = ["Journal ISSN (print version)", "Journal EISSN (online version)"];
const ISSN_RE = /^[0-9]{4}-[0-9]{3}[0-9X]$/;

const res = await fetch(CSV_URL);
if (!res.ok) throw new Error(`DOAJ CSV fetch failed: ${res.status}`);
const rows = parse(await res.text(), { skipFirstRow: true }) as Record<string, string>[];

const issns = new Set<string>();
for (const row of rows) {
  for (const col of ISSN_COLS) {
    const v = (row[col] ?? "").trim().toUpperCase();
    if (ISSN_RE.test(v)) issns.add(v);
  }
}
const sorted = [...issns].sort();

// 20 ISSNs per line keeps the generated file diff-friendly; the module splits on whitespace/comma.
const lines: string[] = [];
for (let i = 0; i < sorted.length; i += 20) lines.push(sorted.slice(i, i + 20).join(","));
const date = new Date().toISOString().slice(0, 10);
const file = `// AUTO-GENERATED — DO NOT EDIT BY HAND.
// Source: DOAJ bulk journal metadata (${CSV_URL}). Generated ${date}.
// ${sorted.length} ISSNs of DOAJ-listed open-access journals (each passed DOAJ's anti-predatory vetting).
// Regenerate with: deno run --allow-net --allow-read --allow-write scripts/gen-doaj-registry.ts
//
// Edge-only (bundled into the ask function); NEVER imported by the web client (keeps the browser
// bundle lean). The membership LOGIC + tests live in doaj-registry.ts; this file is only data.
const RAW = \`
${lines.join("\n")}
\`;
export const DOAJ_ISSNS: ReadonlySet<string> = new Set(RAW.split(/[\\s,]+/).filter(Boolean));
`;
await Deno.writeTextFile(OUT, file);
console.log(`wrote ${OUT.pathname}: ${sorted.length} ISSNs`);
