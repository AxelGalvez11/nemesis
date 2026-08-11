/**
 * The whole knowledge chain, run LOCALLY over a real file, before it is uploaded for real.
 *
 * Run: pnpm --filter @nemesis/web exec tsx scripts/acceptance-docx-chain.mts <file.docx>
 *
 * 🔴 THIS IS A REHEARSAL, NOT THE ACCEPTANCE TEST. It calls the parser directly, which is exactly
 * what the acceptance standard forbids as a substitute for the real path. Its only job is to make
 * a failure cheap: if the document is malformed, or a table does not survive the parser at all,
 * that is worth discovering here rather than after writing rows into a real account.
 *
 * 🔴 THE THREE-COLUMN TABLE MUST PARSE. Its refusal has to come from the COLUMN-COUNT RULE, not
 * from the grid failing to parse — those produce an identical empty result, and only one of them
 * is the test that was meant to run. So the grid's own shape is printed before the extractor's
 * answer is believed.
 */

import { readFileSync } from "node:fs";

import { structureEnvelope } from "../../../packages/shared/src/document-envelope";
import { extractKnowledgeObjects } from "../lib/learn/knowledge-extraction";
import { parseDocument } from "../lib/notebooks/parse-document";
import { buildSourceContext, unitContent } from "../lib/sources/source-context";

const bytes = new Uint8Array(readFileSync(process.argv[2]!));
const outcome = await parseDocument(
  bytes,
  "acceptance-source.docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
);
if (!outcome.ok) {
  console.log("PARSE FAILED:", outcome.reason);
  process.exit(1);
}
const model = outcome.document.model;
console.log("format:", model?.format, "blocks:", model?.blocks.length);
for (const b of model?.blocks ?? []) {
  const grid = b.kind === "table" && b.table
    ? ` cols=${Math.max(...b.table.rows.map((r) => r.length))} rows=${b.table.rows.length} headerRows=${b.table.headerRows}`
    : "";
  console.log(` ${b.id} ${b.kind}${grid} hp=[${b.headingPath.join(" > ")}] text=${JSON.stringify(b.text.slice(0, 56))}`);
}

// Through the REAL stored envelope, exactly as production reads it back.
const stored = JSON.parse(JSON.stringify(structureEnvelope({
  model,
  text: outcome.document.text,
  title: outcome.document.title,
})));
const ctx = buildSourceContext({ sourceId: "lib-TEST", sourceKind: "docx", structure: stored });
console.log(
  "\nunits:", ctx.units.length,
  "quality:", ctx.quality,
  "caps:", Object.entries(ctx.capabilities).filter(([, v]) => v).map(([k]) => k).join(","),
);
for (const u of ctx.units) {
  const c = unitContent(u);
  const grid = c.kind === "table" ? ` ${c.rows.length}x${Math.max(...c.rows.map((r) => r.length))} headerRows=${c.headerRows}` : "";
  console.log(` ${u.id} ${u.type} -> ${c.kind}${grid}`);
}

const ex = extractKnowledgeObjects(ctx);
console.log("\noutcome:", ex.outcome, "objects:", ex.objects.length);
for (const o of ex.objects) {
  console.log(`  ${o.pair!.left} <-> ${o.pair!.right}  relation=${o.relationKind}  derivation=${o.derivation}  key=${o.identityKey}`);
}
for (const r of ex.refusals) console.log(`  REFUSED ${r.unitId ?? "-"}: ${r.reason}`);
