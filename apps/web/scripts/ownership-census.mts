/**
 * Which canvases the policy runtime owns, and — for the ones it does not — exactly why.
 *
 * Run: pnpm --filter @nemesis/web exec tsx scripts/ownership-census.mts
 *
 * 🔴 "WHY ISN'T THIS CANVAS OWNED?" IS THE RECURRING QUESTION, AND IT HAS A COUNTED ANSWER. Under
 * the strict rule a canvas is owned only when every substantive unit of every source is represented
 * by supported knowledge, so a refusal is never a mood — it is a number of units and a named
 * reason. This prints both, which is what makes the boundary tunable with evidence later rather
 * than by guessing at a percentage now.
 *
 * 🔴 IT RUNS THE PRODUCTION PATH, NOT A COPY OF IT. `coverageOfSource` and `policyOwnsCanvas` are
 * the same functions the app calls; a script that re-implemented the rule would happily report a
 * boundary nobody ships.
 *
 * READ-ONLY. Prints counts, reasons and shapes. Never a line of anyone's document.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { extractKnowledgeObjects } from "../lib/learn/knowledge-extraction";
import {
  coverageOfSource,
  emptyCoverage,
  policyOwnsCanvas,
  withSourceCoverage,
  type CanvasCoverage,
} from "../lib/learn/knowledge-coverage";
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

  console.log("\ncanvas      state         src  read  substantive  covered  uncovered  verdict");
  console.log("-".repeat(96));

  let owned = 0;
  const refusals = new Map<string, number>();

  for (const row of canvases!) {
    const sources = ((row.document as { sources?: { librarySourceId?: string }[] } | null)?.sources ?? []);
    const durable = sources.map((s) => s.librarySourceId).filter((id): id is string => Boolean(id));

    let coverage: CanvasCoverage = emptyCoverage(sources.length);
    let outcome: "complete" | "degraded" | "failed" = "complete";

    for (const sourceId of durable) {
      const { data: source } = await db
        .from("library_sources")
        .select("parsed_documents(structure, doc_kind)")
        .eq("id", sourceId)
        .maybeSingle();
      const parsed = (Array.isArray(source?.parsed_documents) ? source?.parsed_documents[0] : source?.parsed_documents) as
        | { structure: unknown; doc_kind: string }
        | undefined;
      // Not counted as read — which is exactly what the app does, and what refuses the canvas.
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
    }

    const decision = policyOwnsCanvas({ coverage, outcome });
    if (decision.owns) owned += 1;
    else refusals.set(decision.refusal!, (refusals.get(decision.refusal!) ?? 0) + 1);

    console.log(
      [
        String(row.id).slice(0, 8).padEnd(11),
        String(row.state).padEnd(13),
        String(coverage.sourcesTotal).padEnd(4),
        String(coverage.sourcesAccounted).padEnd(5),
        String(coverage.substantive).padEnd(12),
        String(coverage.represented).padEnd(8),
        String(coverage.unrepresented).padEnd(10),
        decision.owns ? "🟢 POLICY OWNS" : `legacy — ${decision.refusal}`,
      ].join(" "),
    );
  }

  console.log("\n--- what the strict rule does today ---");
  console.log(`${owned} of ${canvases!.length} canvases are owned by the policy runtime.`);
  for (const [reason, count] of [...refusals].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count} refused: ${reason}`);
  }
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
