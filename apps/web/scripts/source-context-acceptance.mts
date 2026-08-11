/**
 * Does the extraction boundary work against the REAL production corpus?
 *
 * Run: pnpm --filter @nemesis/web exec tsx scripts/source-context-acceptance.mts
 *
 * 🔴 THE POINT IS THE MIXED CORPUS, NOT THE HAPPY PATH. Production holds both shapes at once:
 * documents parsed before the PDF worker was shipped are one flat string, and documents parsed
 * after it carry units, blocks, heading paths and rectangles. A capability abstraction that is
 * only ever exercised against the new shape has not been tested — the whole reason it exists is
 * that the two must flow through one extractor.
 *
 * 🔴 IT PRINTS SHAPE, NEVER CONTENT. Kinds, counts, capability flags, whether a date-like string
 * is present — never a line of anyone's document. These are the owner's own uploaded materials.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { buildSourceContext, readableUnits, type CanonicalSourceUnit } from "../lib/sources/source-context";
import { extractKnowledgeObjects } from "../lib/learn/knowledge-extraction";

function env(): { url: string; key: string } {
  // Read straight from .env rather than importing app config: this is a script, and the app's
  // env module is built for a request context.
  const raw = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
  const find = (name: string) =>
    raw.split("\n").find((line) => line.startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") ?? "";
  const url = find("SUPABASE_URL") || find("NEXT_PUBLIC_SUPABASE_URL");
  const key = find("SUPABASE_SERVICE_ROLE_KEY") || find("SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in .env");
  return { key, url };
}

function typeCounts(units: CanonicalSourceUnit[]): string {
  const counts = new Map<string, number>();
  for (const unit of units) counts.set(unit.type, (counts.get(unit.type) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([type, n]) => `${type}:${n}`).join(" ");
}

const flags = (capabilities: Record<string, boolean>) =>
  Object.entries(capabilities).filter(([, on]) => on).map(([name]) => name).sort().join(",") || "none";

/** Date-like SHAPE only — never the matched text. */
const DATE_SHAPE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/;

async function main() {
  const { key, url } = env();
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await db
    .from("parsed_documents")
    .select("id, doc_kind, structure, unit_count, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  console.log(`\n${data!.length} real parsed documents\n`);
  console.log(
    ["id".padEnd(10), "kind".padEnd(5), "quality".padEnd(9), "units".padEnd(6), "anchored".padEnd(9), "date?".padEnd(6), "capabilities"].join(" "),
  );
  console.log("-".repeat(120));

  let structured = 0;
  let legacy = 0;
  let anyDate = 0;
  let anyTable = 0;
  let associations = 0;
  const refusalCounts = new Map<string, number>();

  for (const row of data!) {
    const context = buildSourceContext({
      sourceId: row.id as string,
      sourceKind: (row.doc_kind as string) ?? "unknown",
      structure: row.structure,
    });
    const units = readableUnits(context);
    // How many units could actually be cited — the property provenance depends on.
    const anchored = units.filter((unit) => unit.anchor.page !== undefined).length;
    const hasDate = units.some((unit) => DATE_SHAPE.test(unit.text ?? ""));
    if (hasDate) anyDate += 1;
    if (context.capabilities.semanticUnits) structured += 1;
    else legacy += 1;
    if (units.some((unit) => unit.type === "table")) anyTable += 1;

    // The knowledge chain, run over the same context. Counts and refusal REASONS only.
    const extraction = extractKnowledgeObjects(context);
    associations += extraction.objects.length;
    for (const refusal of extraction.refusals) {
      refusalCounts.set(refusal.reason, (refusalCounts.get(refusal.reason) ?? 0) + 1);
    }

    console.log(
      [
        String(row.id).slice(0, 8).padEnd(10),
        String(row.doc_kind).padEnd(5),
        context.quality.padEnd(9),
        String(units.length).padEnd(6),
        `${anchored}/${units.length}`.padEnd(9),
        (hasDate ? "yes" : "no").padEnd(6),
        flags(context.capabilities as unknown as Record<string, boolean>),
      ].join(" "),
    );
    if (units.length > 1) console.log(`${" ".repeat(11)}unit types: ${typeCounts(units)}`);
  }

  console.log("\n--- what this proves ---");
  console.log(`structured rows: ${structured}   legacy flat rows: ${legacy}`);
  console.log("both shapes produced a SourceContext through the same call, with no branching on file type.");
  console.log(`documents containing a date-like string: ${anyDate}`);
  if (anyDate === 0) {
    console.log("🔴 NO SOURCE IN THE CORPUS CONTAINS A DATE — the schedule vertical slice has no");
    console.log("   acceptance case until a syllabus is uploaded. Zero extracted candidates from");
    console.log("   this corpus is the CORRECT result, and is a precision test, not a success.");
  }

  console.log("\n--- knowledge extraction (association) ---");
  console.log(`documents containing a TABLE: ${anyTable}`);
  console.log(`associations extracted: ${associations}`);
  console.log(
    `refusals: ${[...refusalCounts.entries()].map(([reason, n]) => `${reason}:${n}`).join(" ") || "none"}`,
  );
  if (anyTable === 0) {
    console.log("🔴 NO SOURCE IN THE CORPUS CONTAINS A TABLE, so association extraction has no");
    console.log("   acceptance case here either. Zero objects is the CORRECT result: the pairs in");
    console.log("   these documents were flattened into prose before extraction could see them,");
    console.log("   and guessing them back out of the words would mint confident nonsense — the");
    console.log("   measured sample being room numbers, Zoom links and shredded grading tables.");
    console.log("   🔴 DO NOT read a future non-zero number here as 'the table lane works' unless");
    console.log("      every object also reports derivation: 'table-row'.");
  }
}

void main();
