/**
 * Phase 1 acceptance — the real document, through the real pipeline.
 *
 * 🔴 NOT A UNIT TEST AND NOT A SYNTHETIC GRID. It replays the RECORDED Mistral response for the
 * owner's own drug chart — the file that produced 561 candidate facts and 0 knowledge objects —
 * through `modelFromMistral` → `sourceContextFromModel` → `extractKnowledgeObjects`, which is the
 * exact chain production runs. The point is that the count can be defended against the document by
 * eye rather than asserted.
 *
 * Run: npx tsx scripts/knowledge-acceptance.mts
 */

import { readFileSync } from "node:fs";

import { extractKnowledgeObjects } from "../lib/learn/knowledge-extraction";
import { modelFromMistral } from "../lib/notebooks/mistral-model";
import { sourceContextFromModel } from "../lib/sources/source-context";

const fixture = JSON.parse(
  readFileSync(new URL("../lib/notebooks/fixtures/mistral-ocr-recorded.json", import.meta.url), "utf8"),
) as Record<string, { response?: unknown; pages?: unknown }>;

for (const name of ["drug_charts", "instructions", "diagram"]) {
  const raw = fixture[name];
  if (!raw) continue;
  const response = ((raw as { response?: unknown }).response ?? raw) as Parameters<typeof modelFromMistral>[0];

  const model = modelFromMistral(response, "pdf", name);
  if (!model) {
    console.log(`\n=== ${name} === model: NULL`);
    continue;
  }
  const context = sourceContextFromModel({ model, sourceId: name, sourceKind: "pdf" });
  const { objects, outcome, refusals } = extractKnowledgeObjects(context);

  const tables = model.blocks.filter((b) => b.kind === "table");
  const widths = tables.map((b) => Math.max(0, ...(b.table?.rows ?? []).map((r) => r.length)));

  console.log(`\n=== ${name} ===`);
  console.log(`units ${model.units.length} · blocks ${model.blocks.length} · tables ${tables.length} · widths [${widths.join(", ")}]`);
  console.log(`outcome ${outcome} · OBJECTS ${objects.length} · refusals ${refusals.length}`);
  for (const refusal of refusals.slice(0, 4)) console.log(`  refused (${refusal.reason}) ${refusal.detail}`);

  // Show real relations, so the count can be checked against the document rather than trusted.
  for (const object of objects.slice(0, 8)) {
    console.log(`  ${object.pair?.leftRole ?? "?"} → ${object.pair?.rightRole ?? "?"} | ${object.statement}`);
  }
  if (objects.length > 8) console.log(`  … ${objects.length - 8} more`);

  // Provenance and identity are the two claims most worth checking on real data.
  const anchored = objects.filter((o) => (o.sourceAnchors?.length ?? 0) > 0).length;
  const distinct = new Set(objects.map((o) => o.identityKey)).size;
  console.log(`  anchored ${anchored}/${objects.length} · distinct identities ${distinct}/${objects.length}`);
}
