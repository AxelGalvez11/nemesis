/**
 * What does the knowledge layer ACTUALLY mint from the real production corpus, per kind?
 *
 * 🔴 THE BASELINE THIS ANSWERS IS NOT THE ONE THE QUESTION ASSUMES. "Zero causal objects across 19
 * documents" reads as an extractor that misses mechanisms. `extractKnowledgeObjects` is deterministic
 * and model-free and has no causal lane at all — so measuring IT for causal counts is vacuous. What
 * decides whether a document's mechanisms are ever read is the TRUST GATE in
 * `ensureKnowledgeForCanvas`: `knowledgeProductionFor({ outcome })` returns early on a `degraded`
 * extraction, and the causal read (`mechanismsFor`) sits BELOW that return.
 *
 * So this reports three things per document, over the real stored parses:
 *   1. the per-kind counts the deterministic lane produces
 *   2. the `ExtractionOutcome` — which is what the trust gate reads
 *   3. whether the causal lane would be REACHED at all
 *
 * Usage, from apps/web:
 *
 *     NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... \
 *       pnpm exec tsx scripts/causal-corpus-measure.ts
 */
import { extractKnowledgeObjects } from "@/lib/learn/knowledge-extraction";
import { knowledgeProductionFor } from "@/lib/learn/knowledge-production";
import { excerptsFromSourceContext } from "@/lib/learn/canvas-grounding";
import { sourceContextFromModel } from "@/lib/sources/source-context";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_KEY!;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

interface SourceRow {
  id: string;
  file_name?: string;
  parsed_document_id?: string | null;
}

async function main(): Promise<void> {
  const sources = (await fetch(
    `${SB}/rest/v1/library_sources?select=id,file_name,parsed_document_id&parsed_document_id=not.is.null&limit=1000`,
    { headers: svc },
  ).then((r) => r.json())) as SourceRow[];

  console.log(`library sources with a parse: ${sources.length}\n`);

  const totals: Record<string, number> = {};
  const outcomes: Record<string, number> = {};
  let reachCausal = 0;
  let blockedFromCausal = 0;
  const rows: string[] = [];

  for (const source of sources) {
    const parsed = (await fetch(
      `${SB}/rest/v1/parsed_documents?id=eq.${source.parsed_document_id}&select=structure,doc_kind,parser_version`,
      { headers: svc },
    ).then((r) => r.json())) as {
      structure?: { model?: unknown };
      doc_kind?: string;
      parser_version?: string;
    }[];

    const doc = parsed[0];
    const model = doc?.structure?.model;
    if (!model) {
      rows.push(`  ${(source.file_name ?? source.id).slice(0, 46).padEnd(48)} NO MODEL`);
      outcomes["no-model"] = (outcomes["no-model"] ?? 0) + 1;
      blockedFromCausal += 1;
      continue;
    }

    const context = sourceContextFromModel({
      model,
      sourceId: source.id,
      sourceKind: doc?.doc_kind ?? "pdf",
    } as never);

    const extraction = extractKnowledgeObjects(context);
    const byKind: Record<string, number> = {};
    for (const object of extraction.objects) byKind[object.type] = (byKind[object.type] ?? 0) + 1;
    for (const [kind, n] of Object.entries(byKind)) totals[kind] = (totals[kind] ?? 0) + n;

    outcomes[extraction.outcome] = (outcomes[extraction.outcome] ?? 0) + 1;

    // The exact gate `ensureKnowledgeForCanvas` applies before it ever reaches `mechanismsFor`.
    const production = knowledgeProductionFor({ outcome: extraction.outcome });
    if (production.produce) reachCausal += 1;
    else blockedFromCausal += 1;

    // How much material the causal lane would even be handed, and whether it is anchorable.
    const excerpts = excerptsFromSourceContext("s1", context);
    const anchorable = excerpts.filter((e) => e.unitId).length;

    rows.push(
      `  ${(source.file_name ?? source.id).slice(0, 46).padEnd(48)}` +
        `${extraction.outcome.padEnd(10)}` +
        `${production.produce ? "REACHES  " : "BLOCKED  "}` +
        `units=${String(context.units.length).padEnd(6)}` +
        `sem=${String(context.capabilities.semanticUnits).padEnd(6)}` +
        `exc=${String(excerpts.length).padEnd(6)}` +
        `anch=${String(anchorable).padEnd(6)}` +
        `${JSON.stringify(byKind)}`,
    );
  }

  console.log("per-document:");
  for (const row of rows) console.log(row);

  console.log("\n================ BASELINE ================");
  console.log("knowledge objects the DETERMINISTIC lane mints, by kind:");
  for (const [kind, n] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(18)} ${n}`);
  }
  console.log(`  ${"causal".padEnd(18)} ${totals["causal"] ?? 0}   <- no causal lane exists in this function`);

  console.log("\nExtractionOutcome distribution (what the trust gate reads):");
  for (const [outcome, n] of Object.entries(outcomes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${outcome.padEnd(18)} ${n}`);
  }

  console.log(`\ndocuments whose canvas would REACH the causal lane:   ${reachCausal}`);
  console.log(`documents BLOCKED before the causal lane ever runs:   ${blockedFromCausal}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
