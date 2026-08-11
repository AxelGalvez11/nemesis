/**
 * Gate D — does a real syllabus's schedule survive ingestion as structure and
 * reach `ScheduleCandidate` intact?
 *
 * 🔴 PER DOCUMENT, NOT AGGREGATED. An aggregate hides the case that matters: one
 * file recovering everything and another recovering nothing averages to
 * "mostly working", which is not a state any student is ever in.
 *
 * The whole path, with nothing stubbed:
 *   PDF → readPdfStructure → DocumentModel → parseCapabilities
 *       → segmentsOf (cells, not a joined string) → scheduleCandidatesFrom
 *
 * Run from apps/web:
 *   npx tsx scripts/gate-d.mts <file.pdf> [more.pdf …]
 */

import { basename } from "node:path";
import { readFileSync } from "node:fs";

import {
  bareDateInCell,
  DATE_COLUMN,
  parseCapabilities,
  scheduleCandidatesFrom,
  segmentsOf,
} from "../lib/learn/schedule-from-document.ts";
import { findDateMentions } from "../lib/workspace/syllabus-dates.ts";
import { readPdfStructure } from "../lib/pdf/structure.ts";

const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (files.length === 0) { console.error("usage: gate-d.mts <file.pdf> …"); process.exit(2); }

/** Structural assessment nouns. Present because the ACCEPTANCE TARGET names them, not the parser. */
const PROBES: ReadonlyArray<readonly [string, RegExp]> = [
  ["exams", /\bexam\s*\d/i],
  ["iRATs", /\birat\s*\d/i],
];

let failures = 0;

for (const file of files) {
  const { model } = await readPdfStructure(new Uint8Array(readFileSync(file)));
  const caps = parseCapabilities(model);
  const segments = segmentsOf(model);
  const { candidates, unresolved } = scheduleCandidatesFrom(model, {
    anchor: new Date("2026-08-01T00:00:00Z"),
    canvasId: "gate-d",
    newId: (_s, i) => `g-${i}`,
    parsedDocumentId: "parse",
    sourceId: "source",
  });

  const rows = segments.filter((s) => s.fromTable);
  const named = rows.filter((s) => s.cells.some((c) => c.column));
  const dated = candidates.filter((c) => c.startAt);
  const withProvenance = candidates.filter(
    (c) => (c.sourceRefs[0]?.blockIds ?? []).length > 0 && typeof c.sourceRefs[0]?.unitIndex === "number",
  );

  console.log(`\n${"═".repeat(80)}\n${basename(file).slice(0, 68)}\n${"═".repeat(80)}`);
  console.log(`  capabilities        ${JSON.stringify(caps)}`);
  console.log(`  table-row segments  ${rows.length}  (${named.length} with named columns)`);
  console.log(`  candidates          ${candidates.length}   dated ${dated.length}   unresolved ${unresolved.length}`);
  console.log(`  by kind             ${JSON.stringify(candidates.reduce<Record<string, number>>((a, c) => { a[c.kind] = (a[c.kind] ?? 0) + 1; return a; }, {}))}`);
  console.log(`  provenance resolves ${withProvenance.length}/${candidates.length}`);

  for (const [label, probe] of PROBES) {
    const inRows = rows.filter((s) => probe.test(s.text));
    const asCandidates = candidates.filter((c) => probe.test(c.title) || probe.test(c.originalExpression ?? ""));
    const datedOnes = asCandidates.filter((c) => c.startAt);
    const ok = inRows.length > 0 && datedOnes.length === inRows.length;
    if (inRows.length > 0 && !ok) failures += 1;
    console.log(
      `  ${label.padEnd(18)}  in the document ${inRows.length}  →  candidates ${asCandidates.length}  →  dated ${datedOnes.length}  ` +
      `${inRows.length === 0 ? "(none in this file)" : ok ? "✅" : "🔴"}`,
    );
    for (const c of datedOnes) console.log(`       ${c.startAt?.slice(0, 10)}  [${c.kind}]  ${c.title.replace(/\s+/g, " ").slice(0, 54)}`);
  }

  // 🔴 THE DEFECT THIS SLICE EXISTS TO PREVENT: a TIME read as a DATE.
  //
  // Not "does the evidence look date-shaped" — the evidence is the whole row and it OPENS with the
  // date, so that test flags every CORRECT candidate and reported 47 failures on a file with none.
  // The real question is where the date came from: a dated candidate built from a table row must
  // have a date cell that actually reads as a date. Dated while its date cell is unreadable means
  // the value came from elsewhere in the row, which is the time-as-date failure exactly.
  //
  // `newId` numbers candidates by segment index, so `g-N` addresses segment N.
  //
  // 🔴 THE DENOMINATOR IS PRINTED BECAUSE "NOT EXAMINED" MUST NOT READ AS "VERIFIED CLEAN".
  // A file whose tables carry no column names has no date cell to check, so this loop examines
  // nothing — and a bare `0 ✅` there claims a guarantee that was never tested.
  let fromWrongCell = 0;
  let examined = 0;
  for (const c of candidates) {
    if (!c.startAt) continue;
    const segment = segments[Number(c.id.slice(2))];
    if (!segment?.fromTable) continue;
    const cell = segment.cells.find((x) => x.column && DATE_COLUMN.test(x.column));
    if (!cell) continue;                       // no named date column: nothing was claimed
    examined += 1;
    if (findDateMentions(cell.value).length === 0 && bareDateInCell(cell.value) === null) fromWrongCell += 1;
  }
  console.log(
    `  date/time confusion ${fromWrongCell}/${examined} ` +
    (examined === 0 ? "— NOT CHECKED (no named date column in this file)" : fromWrongCell === 0 ? "\u2705" : "\uD83D\uDD34"),
  );
  if (fromWrongCell > 0) failures += 1;
}

console.log(`\n${failures === 0 ? "✅ GATE D — every probe recovered and dated" : `🔴 GATE D FAILED — ${failures} probe(s)`}`);
process.exit(failures === 0 ? 0 : 1);
