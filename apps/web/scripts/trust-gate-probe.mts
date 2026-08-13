/**
 * What the trust gate would produce on every real canvas — and whether anything downstream still refuses.
 *
 * Run: pnpm --filter @nemesis/web exec tsx scripts/trust-gate-probe.mts
 *
 * 🔴 THE QUESTION THIS ANSWERS IS NOT "DOES THE GATE OPEN". It is "does the gate opening reach a
 * learner". `RUNTIME-001` deleted the gate where a task is CONSUMED while the gate where objectives
 * are PRODUCED zeroed its input, and every unit test passed because each layer was correct alone.
 * The same shape is available again one layer further down: `use-policy-runtime.ts` refuses on
 * `supportedObjectives(...).length === 0`, which filters to association knowledge carrying a recall
 * objective. Producing objectives that are not supported would open the gate onto another closed one.
 *
 * So this prints, per canvas, every clause between a source row and a question on screen:
 *   durable/total → the `:118` clause → outcome → coverage → extracted → SUPPORTED
 *
 * 🔴 IT RUNS THE PRODUCTION FUNCTIONS, NOT A COPY OF THEM. `extractKnowledgeObjects`,
 * `coverageOfSource`, `policyOwnsCanvas` and `supportedKnowledge` are the same functions the app
 * calls, so this cannot report a boundary nobody ships.
 *
 * READ-ONLY. It never writes a row. Prints counts, verdicts and shapes — never a line of anyone's
 * document.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { extractKnowledgeObjects } from "../lib/learn/knowledge-extraction";
import {
  coverageOfSource,
  emptyCoverage,
  policyOwnsCanvas,
  supportedKnowledge,
  withSourceCoverage,
  type CanvasCoverage,
} from "../lib/learn/knowledge-coverage";
import type { KnowledgeObject } from "../lib/learn/knowledge-types";
import { objectivesForKnowledge } from "../lib/learn/learning-objective";
import { buildSourceContext } from "../lib/sources/source-context";

function env(): { url: string; key: string } {
  const candidates = [
    new URL("../../../.env", import.meta.url).pathname,
    `${process.env.HOME}/Desktop/AIcodingProjects/nemesis/.env`,
  ];
  const found = candidates.find((path) => {
    try {
      readFileSync(path, "utf8");
      return true;
    } catch {
      return false;
    }
  });
  if (!found) throw new Error(`no .env found in: ${candidates.join(", ")}`);
  const raw = readFileSync(found, "utf8");
  const find = (name: string) =>
    raw.split("\n").find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") ?? "";
  const url = find("SUPABASE_URL") || find("NEXT_PUBLIC_SUPABASE_URL");
  const key = find("SUPABASE_SERVICE_ROLE_KEY") || find("SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env");
  return { key, url };
}

async function main() {
  const { key, url } = env();
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: canvases, error } = await db
    .from("learning_canvases")
    .select("id, title, state, document, deleted")
    .eq("deleted", false);
  if (error) throw error;

  for (const row of canvases!) {
    const sources = (row.document as { sources?: { librarySourceId?: string }[] } | null)?.sources ?? [];
    const durable = sources.map((s) => s.librarySourceId).filter((id): id is string => Boolean(id));

    console.log(`\n${"═".repeat(92)}`);
    console.log(`canvas ${String(row.id).slice(0, 8)}  "${String(row.title ?? "").slice(0, 44)}"  state=${row.state}`);
    console.log(`  sources: ${durable.length} durable of ${sources.length} attached`);

    // The clause RUNTIME-005 must NOT touch (canvas-knowledge.ts, the `sourceIds.length !==
    // canvas.sources.length` return). Printed so a refusal here can never be misread as a result
    // from the ownership gate further down — that is the exact trap the task spec warns about.
    if (durable.length === 0 || durable.length !== sources.length) {
      console.log(`  ⛔ DIES EARLY at the durable-source clause — RUNTIME-004's territory, not RUNTIME-005's.`);
      continue;
    }

    let coverage: CanvasCoverage = emptyCoverage(sources.length);
    let outcome: "complete" | "degraded" | "failed" = "complete";
    const extracted: KnowledgeObject[] = [];

    for (const sourceId of durable) {
      const { data: source } = await db
        .from("library_sources")
        .select("parsed_documents(structure, doc_kind)")
        .eq("id", sourceId)
        .maybeSingle();
      const parsed = (Array.isArray(source?.parsed_documents) ? source?.parsed_documents[0] : source?.parsed_documents) as
        | { structure: unknown; doc_kind: string }
        | undefined;
      if (!parsed) {
        outcome = "failed";
        continue;
      }

      const context = buildSourceContext({
        sourceId,
        sourceKind: parsed.doc_kind ?? "unknown",
        structure: parsed.structure,
      });
      const extraction = extractKnowledgeObjects(context);
      if (extraction.outcome === "failed") outcome = "failed";
      else if (extraction.outcome === "degraded" && outcome !== "failed") outcome = "degraded";
      coverage = withSourceCoverage(coverage, coverageOfSource({ context, objects: extraction.objects }));
      extracted.push(...extraction.objects);
    }

    const ownership = policyOwnsCanvas({ coverage, outcome });
    const supported = supportedKnowledge(extracted);

    console.log(`  extraction outcome : ${outcome}`);
    console.log(
      `  coverage           : substantive=${coverage.substantive} represented=${coverage.represented} unrepresented=${coverage.unrepresented}`,
    );
    console.log(`  knowledge objects  : ${extracted.length} extracted  (${extracted.map((o) => o.type).join(", ") || "none"})`);
    console.log(`  SUPPORTED slice    : ${supported.length}  ← what use-policy-runtime.ts:214 counts`);
    for (const object of supported) {
      const caps = objectivesForKnowledge(object).map((o) => o.capability);
      console.log(`      · ${object.type} → objectives [${caps.join(", ")}]`);
    }

    console.log(`  TODAY  (coverage gate): owns=${ownership.owns} refusal=${ownership.refusal ?? "none"} → objectives ${ownership.owns ? supported.length : 0}`);
    // What RUNTIME-005 changes: production gated on trust alone.
    const trusts = outcome === "complete";
    console.log(`  AFTER  (trust gate)   : trusted=${trusts} → objectives ${trusts ? supported.length : 0}`);
    if (trusts && supported.length === 0) {
      console.log(`  🔴 GATE OPENS ONTO A CLOSED ONE — production would succeed and :214 would still refuse.`);
    } else if (trusts && supported.length > 0) {
      console.log(`  🟢 a question reaches the learner.`);
    }
  }
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
