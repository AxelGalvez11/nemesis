#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * Phase 1 CP6 — seed-corpus ingest.
 *
 * Reads scripts/seed-manifest.json and ingests each entity through its
 * "query" providers (openfda / rxnorm / clinicaltrials / pubmed_oa) by POSTing
 * to core-source-sync. The STRUCTURED providers in the routing map
 * (fda_orange_book / purple_book / cms_nadac) are NOT handled here — they need
 * the data-file companion scripts (orange-book-ingest / purple-book-ingest /
 * pricing-ingest) and are run separately.
 *
 * Idempotent: the function upserts by (provider, provider_id) + content_hash,
 * so re-running skips unchanged rows. Sequential to respect NCBI/openFDA rate
 * limits.
 *
 * Usage (cloud or local):
 *   SERVICE_KEY=... SB_URL=https://<ref>.supabase.co \
 *     deno run --allow-net --allow-env --allow-read scripts/seed-ingest.ts \
 *     [--limit=N] [--only=openfda,pubmed_oa] [--start=N]
 */

const SB_URL = Deno.env.get("SB_URL") ?? "http://127.0.0.1:54321";
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
if (!SERVICE_KEY) {
  console.error("SERVICE_KEY required");
  Deno.exit(2);
}

function arg(n: string): string | undefined {
  return Deno.args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
}
const LIMIT = arg("limit") ? Number(arg("limit")) : undefined;
const START = arg("start") ? Number(arg("start")) : 0;
const ONLY = (arg("only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const QUERY_PROVIDERS = new Set(["openfda", "rxnorm", "clinicaltrials", "pubmed_oa"]);

interface Entity {
  name: string;
  type: string;
  class?: string;
}
interface Manifest {
  routing: Record<string, string[]>;
  entities: Entity[];
}

const manifest: Manifest = JSON.parse(
  await Deno.readTextFile(new URL("./seed-manifest.json", import.meta.url)),
);

function buildOpts(provider: string, name: string): Record<string, unknown> {
  switch (provider) {
    case "openfda":
      return { query: `openfda.generic_name:"${name}"`, limit: 1 };
    case "rxnorm":
      return { name };
    case "clinicaltrials":
      return { query: name, pageSize: 5 };
    case "pubmed_oa":
      return { query: name, retmax: 3 };
    default:
      return {};
  }
}

// Build the job list: (entity × routed query-provider).
interface Job {
  entity: string;
  type: string;
  provider: string;
}
const jobs: Job[] = [];
let entities = manifest.entities;
if (LIMIT) entities = entities.slice(0, LIMIT);
for (const e of entities) {
  const routed = manifest.routing[e.type] ?? [];
  for (const p of routed) {
    if (!QUERY_PROVIDERS.has(p)) continue; // structured providers handled by companions
    if (ONLY.length && !ONLY.includes(p)) continue;
    jobs.push({ entity: e.name, type: e.type, provider: p });
  }
}

console.log(
  `seed-ingest → ${SB_URL} | ${entities.length} entities → ${jobs.length} jobs (start=${START})`,
);

const summary: Record<string, { ingested: number; skipped: number; chunks: number; errors: number; not_found: number }> = {};
const failures: Array<{ job: Job; detail: string }> = [];

function bump(p: string, k: keyof (typeof summary)[string], n = 1) {
  summary[p] ??= { ingested: 0, skipped: 0, chunks: 0, errors: 0, not_found: 0 };
  summary[p][k] += n;
}

for (let i = START; i < jobs.length; i++) {
  const job = jobs[i];
  try {
    const res = await fetch(`${SB_URL}/functions/v1/core-source-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY!,
      },
      body: JSON.stringify({ provider: job.provider, opts: buildOpts(job.provider, job.entity) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      bump(job.provider, "errors");
      failures.push({ job, detail: `${res.status} ${JSON.stringify(body).slice(0, 160)}` });
      console.log(`[${i + 1}/${jobs.length}] ✗ ${job.provider}:${job.entity} → ${res.status} ${String(body.error ?? "").slice(0, 80)}`);
    } else {
      bump(job.provider, "ingested", body.ingested ?? 0);
      bump(job.provider, "skipped", body.skipped_unchanged ?? 0);
      bump(job.provider, "chunks", body.chunk_count ?? 0);
      if ((body.fetched ?? 0) === 0) bump(job.provider, "not_found");
      console.log(`[${i + 1}/${jobs.length}] ✓ ${job.provider}:${job.entity} → fetched=${body.fetched} ingested=${body.ingested} chunks=${body.chunk_count}`);
    }
  } catch (e) {
    bump(job.provider, "errors");
    failures.push({ job, detail: (e as Error).message });
    console.log(`[${i + 1}/${jobs.length}] ✗ ${job.provider}:${job.entity} → ${(e as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, 300)); // gentle pacing
}

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));
console.log(`failures: ${failures.length}`);
for (const f of failures.slice(0, 20)) console.log(`  ${f.job.provider}:${f.job.entity} — ${f.detail}`);
