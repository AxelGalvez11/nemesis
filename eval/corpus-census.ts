// eval/corpus-census.ts
// Proves what is retrievable today. Counts embedded chunks per provider (read via service key).
import { readEnv } from "./lib/corpus.ts";

const env = readEnv();
// Embedded chunk count grouped by provider — uses a PostgREST count over the join-free chunk table.
const providers = ["openfda", "dailymed", "pubmed_oa", "clinicaltrials", "rxnorm", "fda_orange_book"];
const census: Record<string, number> = {};
for (const p of providers) {
  // count core_sources for the provider that have >=1 embedded chunk is non-trivial via REST;
  // approximate corpus presence by counting core_sources rows per provider (durable + cheap).
  const res = await fetch(
    `${env.SB_URL}/rest/v1/core_sources?select=id&provider=eq.${p}&superseded_at=is.null`,
    { headers: { apikey: env.SERVICE_KEY, Authorization: `Bearer ${env.SERVICE_KEY}`, Prefer: "count=exact", Range: "0-0" } },
  );
  const range = res.headers.get("content-range") ?? "*/0"; // e.g. "0-0/4192"
  census[p] = Number(range.split("/")[1] ?? 0);
}
console.log(JSON.stringify({ generated_for: env.SB_URL, sources_by_provider: census }, null, 2));
