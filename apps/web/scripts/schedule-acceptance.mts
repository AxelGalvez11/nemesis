/**
 * Gates A–D for syllabus → Calendar, against a PERSISTED production parse.
 *
 * 🔴 IT READS `parsed_documents.structure`. IT DOES NOT RE-PARSE THE FILE. That is the entire
 * point of the change it verifies: the schedule extractor consumes the canonical model the
 * ingestion pipeline already stored, rather than re-uploading the document and rebuilding an
 * understanding of it from a flat string.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/schedule-acceptance.mts [parsedDocumentId]
 *
 * With no id it takes the most recent `units-blocks` parse.
 */

import { createClient } from "@supabase/supabase-js";

import { storedDocumentModel } from "../../../packages/shared/src/document-envelope.ts";
import { parseCapabilities, scheduleCandidatesFrom, segmentsOf } from "../lib/learn/schedule-from-document.ts";

const URL_ = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}
const db = createClient(URL_, KEY, { auth: { persistSession: false } });
const wanted = process.argv[2] ?? null;

const query = db
  .from("parsed_documents")
  .select("id,doc_kind,structure,created_at")
  .order("created_at", { ascending: false })
  .limit(20);
const { data, error } = await query;
if (error) { console.error(error.message); process.exit(1); }

const rows = (data ?? []) as { id: string; structure: unknown; created_at: string }[];
const row = wanted ? rows.find((r) => r.id === wanted) : rows.find((r) => (r.structure as { shape?: string })?.shape === "units-blocks");
if (!row) { console.error("No units-blocks parse found."); process.exit(1); }

// ── Gate A: the source, read from storage ────────────────────────────────────
const shape = (row.structure as { shape?: string })?.shape ?? "(none)";
const model = storedDocumentModel(row.structure);
console.log(`\nGate A — persisted source\n${"─".repeat(70)}`);
console.log(`  parse ${row.id}`);
console.log(`  structure.shape = ${shape}`);
console.log(`  model read from the STORED envelope: ${model ? `${model.units.length} units, ${model.blocks.length} blocks` : "NONE"}`);
if (!model || shape !== "units-blocks") { console.error("\nGate A FAILED."); process.exit(1); }

// ── Gate B: capabilities, from the model and never from a count ──────────────
const caps = parseCapabilities(model);
console.log(`\nGate B — capabilities (derived from the model, not unit_count)\n${"─".repeat(70)}`);
for (const [k, v] of Object.entries(caps)) console.log(`  ${v ? "yes" : "no "}  ${k}`);
if (!caps.scheduleExtraction) { console.error("\nGate B FAILED: schedule extraction not supported."); process.exit(1); }

// ── Gate C: candidates with locators ─────────────────────────────────────────
const segments = segmentsOf(model);
const { candidates, unresolved } = scheduleCandidatesFrom(model, {
  anchor: new Date(row.created_at),
  canvasId: "acceptance",
  newId: (_s, i) => `acc-${i}`,
  parsedDocumentId: row.id,
  sourceId: row.id,
});

console.log(`\nGate C — candidates\n${"─".repeat(70)}`);
console.log(`  segments: ${segments.length} (${segments.filter((s) => s.fromTable).length} from table rows)`);
console.log(`  candidates: ${candidates.length}   unresolved: ${unresolved.length}`);
for (const c of candidates.slice(0, 25)) {
  const ref = c.sourceRefs[0]!;
  const where = `p${(ref.unitIndex ?? 0) + 1} ${ref.blockIds?.join(",") ?? "-"}`;
  const when = c.startAt ?? "(recurring/undated)";
  console.log(`  • [${c.kind}] ${c.title}`);
  console.log(`      when=${when}  conf=${c.confidence}  at=${where}`);
  console.log(`      under=${JSON.stringify(ref.headingPath?.slice(-2) ?? [])}`);
  console.log(`      evidence="${(c.originalExpression ?? "").slice(0, 90)}"`);
}
if (candidates.length > 25) console.log(`  … ${candidates.length - 25} more`);

// ── Gate D: composition, so "we found some events" is not the claim ──────────
const byKind = candidates.reduce<Record<string, number>>((acc, c) => {
  acc[c.kind] = (acc[c.kind] ?? 0) + 1;
  return acc;
}, {});
const withLocator = candidates.filter((c) => (c.sourceRefs[0]?.blockIds ?? []).length > 0).length;
const withDate = candidates.filter((c) => c.startAt).length;
console.log(`\nGate D — composition\n${"─".repeat(70)}`);
console.log(`  by kind: ${JSON.stringify(byKind)}`);
console.log(`  with a resolved date: ${withDate}/${candidates.length}`);
console.log(`  with a block locator: ${withLocator}/${candidates.length}`);
console.log(`  unresolved (reported, not dropped): ${unresolved.length}`);
for (const u of unresolved.slice(0, 5)) console.log(`      p${u.unit + 1}: ${u.reason} — "${u.text.slice(0, 70)}"`);

console.log(`\n🔴 NOT COVERED by this script: verification (Gate E), recurrence mapping into Calendar`);
console.log(`   (Gate F), approval (Gate G), the Calendar write (Gate H), idempotency (Gate I),`);
console.log(`   provenance resolution in the UI (Gate J), and the downstream question (Gate K).`);
