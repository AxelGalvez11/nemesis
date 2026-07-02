// Diagnostic reachability check for the Discovery Engine schema.
//
// Run after applying migrations:
//   deno run --allow-env --allow-net scripts/diag/discovery-schema-check.ts
//
// Required env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceKey) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

const tables = [
  "research_projects",
  "research_claims",
  "claim_evidence",
  "study_characteristics",
  "evidence_ratings",
  "research_gaps",
  "research_hypotheses",
  "study_designs",
  "claim_versions",
  "evidence_updates",
] as const;

async function check(path: string): Promise<void> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${path}: ${res.status} ${body}`);
  }
}

for (const table of tables) {
  await check(`${table}?select=id&limit=1`);
  console.log(`ok ${table}`);
}

await check("research_report_runs?select=id,metadata&limit=1");
console.log("ok research_report_runs.metadata");
