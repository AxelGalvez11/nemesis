/**
 * Gates E–K on a real syllabus: candidate → verification → approval → Calendar
 * → provenance → idempotency → the question a student would actually ask.
 *
 * 🔴 NOTHING IS STUBBED AND NOTHING IS WRITTEN TO A REAL ACCOUNT. The PDF is
 * parsed by the same `readPdfStructure` production runs; the calendar is an
 * in-memory store standing in for `saveCalendarEvent`, which upserts on `id` —
 * so the idempotency this proves is the id's, which is the part that can be
 * wrong. A gate that needed a live account could not run in CI, and a gate that
 * cannot run is a gate nobody checks.
 *
 * Run from apps/web:
 *   npx tsx scripts/gates-ek.mts <syllabus.pdf> [--series-end YYYY-MM-DD]
 */

import { readFileSync } from "node:fs";

import { scheduleCandidatesFrom } from "../lib/learn/schedule-from-document.ts";
import { readPdfStructure } from "../lib/pdf/structure.ts";
import { expandRecurringEvents, upcomingEvents, type CalendarEvent } from "../lib/workspace/calendar-model.ts";
import { decodeCalendarEvent, encodeCalendarEvent } from "../lib/workspace/calendar-codec.ts";
import { approve, planCalendarImport } from "../lib/workspace/schedule-import.ts";

const file = process.argv[2];
if (!file) { console.error("usage: gates-ek.mts <syllabus.pdf> [--series-end YYYY-MM-DD]"); process.exit(2); }
const seriesEndArg = process.argv.indexOf("--series-end");
const seriesEnd = seriesEndArg > 0 ? process.argv[seriesEndArg + 1] : undefined;

const SOURCE_ID = "gate-ek-source";
const ANCHOR = new Date("2026-08-01T00:00:00Z");
let failures = 0;
const check = (gate: string, ok: boolean, detail: string) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✅" : "🔴"} ${gate.padEnd(48)} ${detail}`);
};

// ── the real document ────────────────────────────────────────────────────────
const { model } = await readPdfStructure(new Uint8Array(readFileSync(file)));
const { candidates } = scheduleCandidatesFrom(model, {
  anchor: ANCHOR,
  canvasId: "gate-ek",
  newId: (_s, i) => `c-${i}`,
  parsedDocumentId: "gate-ek-parse",
  sourceId: SOURCE_ID,
});

const plan = planCalendarImport(candidates, {
  sourceId: SOURCE_ID,
  ...(seriesEnd ? { seriesEnd } : {}),
});

console.log(`\n${"═".repeat(84)}`);
console.log(`GATES E–K · ${file.split("/").pop()}`);
console.log(`${"═".repeat(84)}`);
console.log(`  candidates ${candidates.length} → ${plan.events.length} ready, ${plan.needsApproval.length} to approve, ${plan.refused.length} refused\n`);

// ── E — every refusal states a reason ────────────────────────────────────────
const reasons = plan.refused.reduce<Record<string, number>>((a, r) => { a[r.reason] = (a[r.reason] ?? 0) + 1; return a; }, {});
check("E  refusals carry a reason", plan.refused.every((r) => Boolean(r.reason)), JSON.stringify(reasons));

// ── F — a recurring meeting is ONE series ────────────────────────────────────
const series = [...plan.events, ...plan.needsApproval.map((n) => n.event)].filter((e) => e.recurrence);
const seriesRefused = plan.refused.filter((r) => r.reason === "no_series_end").length;
check(
  "F  recurrence is one series, never one per day",
  series.every((e) => (e.recurrence?.days.length ?? 0) >= 2),
  series.length > 0
    ? `${series.length} series, days=${JSON.stringify(series[0]!.recurrence!.days)} until=${series[0]!.recurrence!.until}`
    : `no series emitted; ${seriesRefused} refused as no_series_end (the document states no term end)`,
);

// ── G — approval turns a proposal into a placement ───────────────────────────
const before = plan.needsApproval.length;
const approved = plan.needsApproval.map((n) => approve(n.candidate));
const afterApproval = planCalendarImport([...candidates.filter((c) => !plan.needsApproval.some((n) => n.candidate.id === c.id)), ...approved], {
  sourceId: SOURCE_ID,
  ...(seriesEnd ? { seriesEnd } : {}),
});
check(
  "G  approval places what the bar would not",
  afterApproval.events.length === plan.events.length + before,
  `${plan.events.length} + ${before} approved = ${afterApproval.events.length}`,
);

// ── H — the write, through the real codec ────────────────────────────────────
const store = new Map<string, CalendarEvent>();
function save(event: (typeof afterApproval.events)[number]): void {
  // The exact shape the cloud stores, read back the way the cloud reads it.
  const row = JSON.parse(JSON.stringify(encodeCalendarEvent(event, "gate-ek-user", "agent")));
  const decoded = decodeCalendarEvent(row);
  if (decoded) store.set(decoded.id, decoded as CalendarEvent);
}
for (const event of afterApproval.events) save(event);
check("H  events survive encode → store → decode", store.size === afterApproval.events.length, `${store.size} written`);

// ── I — importing the same document again changes nothing ────────────────────
const sizeAfterFirst = store.size;
for (const event of planCalendarImport(candidates, { sourceId: SOURCE_ID, ...(seriesEnd ? { seriesEnd } : {}) }).events) save(event);
check("I  a second import writes no duplicates", store.size === sizeAfterFirst, `${sizeAfterFirst} → ${store.size}`);

// ── J — every stored event resolves back to the document ─────────────────────
const resolvable = [...store.values()].filter((e) => {
  const ref = (e as { sourceRefs?: { unitIndex?: number; blockIds?: string[] }[] }).sourceRefs?.[0];
  if (!ref || typeof ref.unitIndex !== "number" || !(ref.blockIds ?? []).length) return false;
  // The locator must point at a unit and blocks that EXIST in the stored parse.
  const unitOk = ref.unitIndex >= 0 && ref.unitIndex < model.units.length;
  const blocksOk = ref.blockIds!.every((id) => model.blocks.some((b) => b.id === id));
  return unitOk && blocksOk;
});
check("J  provenance resolves in the stored parse", resolvable.length === store.size, `${resolvable.length}/${store.size}`);

// ── K — the question a student asks ──────────────────────────────────────────
//
// 🔴 ANSWERED WITHOUT COURSE FILTERING, AND THAT IS A STATED LIMIT. `course` is not populated by
// extraction — Library import lands `course_id` NULL — so "my next PHCY 2119 exam" and "my next
// exam" are the same query today. Filtering on a field nothing fills would answer nothing and
// look like it worked.
const asOf = new Date("2026-08-16T00:00:00");
const expanded = expandRecurringEvents([...store.values()], asOf, new Date("2026-12-31T00:00:00"));
const nextExam = upcomingEvents(expanded, asOf, 120).find((e) => e.kind === "exam");
check(
  "K  \"when is my next exam?\" (no course filter)",
  Boolean(nextExam),
  nextExam ? `${nextExam.date} — ${nextExam.title.slice(0, 46)}` : "no exam found",
);
const withCourse = [...store.values()].filter((e) => e.course).length;
console.log(`     ⓘ course populated on ${withCourse}/${store.size} events — course-scoped K is NOT proven`);

console.log(`\n${failures === 0 ? "✅ E–K PASS" : `🔴 ${failures} GATE(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
