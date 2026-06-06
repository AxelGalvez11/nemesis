#!/usr/bin/env -S deno run --allow-net --allow-env --allow-read
/**
 * Focused MVP drug corpus ingest.
 *
 * This is the concrete path for the 10-drug MVP RAG corpus:
 * RxNorm + OpenFDA + DailyMed + ClinicalTrials.gov + targeted PubMed OA query
 * families. It POSTs to the existing core-source-sync edge function, so all
 * license gates, chunking, embeddings, and idempotent upserts stay centralized.
 *
 * Usage:
 *   SERVICE_KEY=... SB_URL=https://<ref>.supabase.co \
 *     deno run --allow-net --allow-env --allow-read scripts/mvp-drug-corpus-ingest.ts
 *
 * Useful options:
 *   --dry-run
 *   --only-drug=semaglutide,metformin
 *   --only-provider=dailymed,pubmed_oa
 *   --skip-embed
 *   --start=N
 */

interface CorpusManifest {
  drugs: string[];
  providers: Provider[];
  pubmed_query_families: Array<{
    name: string;
    query_template: string;
    retmax: number;
  }>;
}

type Provider =
  | "rxnorm"
  | "openfda"
  | "dailymed"
  | "clinicaltrials"
  | "pubmed_oa";

interface Job {
  drug: string;
  provider: Provider;
  family?: string;
  opts: Record<string, unknown>;
}

const SB_URL = (Deno.env.get("SB_URL") ?? "http://127.0.0.1:54321").replace(
  /\/$/,
  "",
);
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");

function arg(name: string): string | undefined {
  return Deno.args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1)
    .join("=");
}

function flag(name: string): boolean {
  return Deno.args.includes(`--${name}`);
}

const DRY_RUN = flag("dry-run");
const SKIP_EMBED = flag("skip-embed");
const START = arg("start") ? Number(arg("start")) : 0;
const ONLY_DRUG = csv(arg("only-drug")).map(normalize);
const ONLY_PROVIDER = new Set(csv(arg("only-provider")) as Provider[]);

if (!SERVICE_KEY && !DRY_RUN) {
  console.error("SERVICE_KEY required unless --dry-run is set");
  Deno.exit(2);
}

const manifest: CorpusManifest = JSON.parse(
  await Deno.readTextFile(new URL("./mvp-drug-corpus.json", import.meta.url)),
);

const drugs = manifest.drugs.filter((drug) =>
  ONLY_DRUG.length ? ONLY_DRUG.includes(normalize(drug)) : true
);
const providers = manifest.providers.filter((provider) =>
  ONLY_PROVIDER.size ? ONLY_PROVIDER.has(provider) : true
);

const jobs = buildJobs(drugs, providers, manifest);
console.log(
  `mvp-drug-corpus -> ${SB_URL} | drugs=${drugs.length} jobs=${jobs.length} start=${START}` +
    `${DRY_RUN ? " DRY_RUN" : ""}${SKIP_EMBED ? " SKIP_EMBED" : ""}`,
);

if (DRY_RUN) {
  for (const [index, job] of jobs.entries()) {
    console.log(
      `[${index + 1}/${jobs.length}] ${label(job)} ${JSON.stringify(job.opts)}`,
    );
  }
  Deno.exit(0);
}

const summary: Record<
  string,
  {
    fetched: number;
    ingested: number;
    skipped: number;
    chunks: number;
    errors: number;
    not_found: number;
  }
> = {};
const failures: Array<{ job: Job; detail: string }> = [];

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
      body: JSON.stringify({
        provider: job.provider,
        opts: job.opts,
        skip_embed: SKIP_EMBED,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      bump(job.provider, "errors");
      failures.push({
        job,
        detail: `${res.status} ${JSON.stringify(body).slice(0, 240)}`,
      });
      console.log(
        `[${i + 1}/${jobs.length}] fail ${label(job)} -> ${res.status} ${
          String(body.error ?? "").slice(0, 120)
        }`,
      );
    } else {
      const fetched = Number(body.fetched ?? 0);
      bump(job.provider, "fetched", fetched);
      bump(job.provider, "ingested", Number(body.ingested ?? 0));
      bump(job.provider, "skipped", Number(body.skipped_unchanged ?? 0));
      bump(job.provider, "chunks", Number(body.chunk_count ?? 0));
      if (fetched === 0) bump(job.provider, "not_found");
      console.log(
        `[${i + 1}/${jobs.length}] ok   ${
          label(job)
        } -> fetched=${body.fetched} ingested=${body.ingested} chunks=${body.chunk_count}`,
      );
    }
  } catch (e) {
    bump(job.provider, "errors");
    failures.push({ job, detail: (e as Error).message });
    console.log(
      `[${i + 1}/${jobs.length}] fail ${label(job)} -> ${(e as Error).message}`,
    );
  }
  await sleep(350);
}

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(summary, null, 2));
console.log(`failures: ${failures.length}`);
for (const failure of failures.slice(0, 30)) {
  console.log(`  ${label(failure.job)} - ${failure.detail}`);
}

function buildJobs(
  drugsToIngest: string[],
  providersToRun: Provider[],
  source: CorpusManifest,
): Job[] {
  const jobs: Job[] = [];
  for (const drug of drugsToIngest) {
    for (const provider of providersToRun) {
      if (provider === "pubmed_oa") {
        for (const family of source.pubmed_query_families) {
          jobs.push({
            drug,
            provider,
            family: family.name,
            opts: {
              query: family.query_template.replaceAll("{drug}", drug),
              retmax: family.retmax,
            },
          });
        }
        continue;
      }
      jobs.push({ drug, provider, opts: optsFor(provider, drug) });
    }
  }
  return jobs;
}

function optsFor(
  provider: Exclude<Provider, "pubmed_oa">,
  drug: string,
): Record<string, unknown> {
  switch (provider) {
    case "rxnorm":
      return { name: drug };
    case "openfda":
      return { query: `openfda.generic_name:"${drug}"`, limit: 3 };
    case "dailymed":
      return { drug_name: drug, pagesize: 5 };
    case "clinicaltrials":
      return { query: drug, pageSize: 15 };
  }
}

function label(job: Job): string {
  return `${job.provider}:${job.drug}${job.family ? `:${job.family}` : ""}`;
}

function bump(
  provider: string,
  key: keyof (typeof summary)[string],
  amount = 1,
): void {
  summary[provider] ??= {
    fetched: 0,
    ingested: 0,
    skipped: 0,
    chunks: 0,
    errors: 0,
    not_found: 0,
  };
  summary[provider][key] += amount;
}

function csv(value: string | undefined): string[] {
  return (value ?? "").split(",").map((part) => part.trim()).filter(Boolean);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
