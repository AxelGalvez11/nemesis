#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Phase 4 — backfill the evidence-scoring SIGNALS that Phases 1–2 never captured.
 *
 * The §9 engine can't tier without them, and they are empty corpus-wide
 * (flagged as a Phase-4 backfill in PROGRESS.md):
 *   - clinical_trials.enrollment / results_first_posted / study_type   (all null)
 *   - clinical_trials.phase / status / dates                           (partial)
 *   - pubmed_articles.publication_types  (RCT | Meta-Analysis | Systematic Review …)
 *
 * Strategy (the projections were built from core_sources.metadata, which the
 * providers under-captured, so a re-fetch is required — not a re-project):
 *   - Trials: GET the ClinicalTrials.gov v2 single-study endpoint per NCT id and
 *     update the row. study_type/enrollment/results come from the full study.
 *   - PubMed: efetch the abstract XML in batches and extract <PublicationType> +
 *     refresh mesh (mesh 'Animals' ¬'Humans' is the preclinical proxy at scoring).
 *
 * Idempotent: re-running overwrites the same columns. Prove-before-bulk via
 * --limit=N (default = all). Reuses the entity-link.ts client + env contract.
 *
 * Usage:
 *   SB_URL=https://<ref>.supabase.co SERVICE_KEY=... [NCBI_API_KEY=...] \
 *     deno run --allow-net --allow-env scripts/backfill-evidence-signals.ts \
 *       [--trials-only|--pubmed-only] [--limit=N]
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
const NCBI_API_KEY = Deno.env.get("NCBI_API_KEY") ?? "";
if (!SB_URL || !SERVICE_KEY) {
  console.error("SB_URL + SERVICE_KEY required");
  Deno.exit(2);
}
const sb = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });

const flag = (n: string) => Deno.args.includes(`--${n}`);
const arg = (n: string): string | undefined =>
  Deno.args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const LIMIT = arg("limit") ? Number(arg("limit")) : Infinity;
const TRIALS_ONLY = flag("trials-only");
const PUBMED_ONLY = flag("pubmed-only");

const CT_BASE = "https://clinicaltrials.gov/api/v2/studies";
const EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Paginate past PostgREST's 1000-row cap (the bug class entity-link hit). */
async function loadAll<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select(select).range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}

/** CT.gov dates may be YYYY, YYYY-MM, or YYYY-MM-DD; the column is `date`. */
function toDate(s: string | undefined | null): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  return null;
}

// ---------------------------------------------------------------------------
// Trials — re-fetch each NCT from ClinicalTrials.gov v2
// ---------------------------------------------------------------------------

async function backfillTrials() {
  const trials = await loadAll<{ id: string; nct_id: string }>("clinical_trials", "id,nct_id");
  const target = trials.slice(0, Math.min(trials.length, LIMIT));
  console.log(`Trials: ${target.length}/${trials.length} to backfill (v2 re-fetch)`);

  let updated = 0, withResults = 0, withEnroll = 0, errors = 0;
  for (const t of target) {
    try {
      // nct_id is DB-sourced, but validate the shape before path interpolation
      // (defense-in-depth against a tampered id producing an unexpected path).
      if (!/^NCT\d{8}$/i.test(t.nct_id)) { errors++; continue; }
      const res = await fetch(`${CT_BASE}/${encodeURIComponent(t.nct_id)}?format=json`, {
        headers: { "User-Agent": "PharmaBroBot/1.0" },
      });
      if (!res.ok) {
        if (errors < 3) console.error(`  fetch ${t.nct_id} → ${res.status}: ${(await res.text()).slice(0, 120)}`);
        errors++; await sleep(200); continue;
      }
      const s = await res.json();
      const p = s?.protocolSection ?? {};
      const design = p.designModule ?? {};
      const status = p.statusModule ?? {};
      const phases: string[] = design.phases ?? [];
      const enrollment: number | null = design.enrollmentInfo?.count ?? null;
      const resultsPosted = toDate(status.resultsFirstPostDateStruct?.date);

      const patch = {
        // Join multi-phase trials (e.g. ["PHASE2","PHASE3"]) so parsePhase()'s
        // pipe-tolerant match resolves the HIGHEST phase, not just phases[0].
        phase: phases.length ? phases.join("|") : null,
        status: status.overallStatus ?? null,
        study_type: design.studyType ?? null,
        enrollment,
        results_first_posted: resultsPosted,
        start_date: toDate(status.startDateStruct?.date),
        completion_date: toDate(status.completionDateStruct?.date),
        last_update_posted: toDate(status.lastUpdatePostDateStruct?.date),
        updated_at: new Date().toISOString(),
      };
      const { error } = await sb.from("clinical_trials").update(patch).eq("id", t.id);
      if (error) {
        if (errors < 3) console.error(`  update ${t.nct_id} → ${error.message}`);
        errors++;
      } else {
        updated++;
        if (resultsPosted) withResults++;
        if (enrollment) withEnroll++;
      }
    } catch (e) {
      if (errors < 3) console.error(`  throw ${t.nct_id} → ${(e as Error).message}`);
      errors++;
    }
    await sleep(150); // be polite to CT.gov
    if (updated % 50 === 0 && updated) console.log(`  …${updated} updated`);
  }
  console.log(
    `Trials done: ${updated} updated, ${withResults} with results_posted, ${withEnroll} with enrollment, ${errors} errors`,
  );
}

// ---------------------------------------------------------------------------
// PubMed — efetch publication_types + mesh in batches
// ---------------------------------------------------------------------------

interface PubMedSignals {
  publication_types: string[];
  mesh: string[];
}

function parsePubMedXml(xml: string): Map<string, PubMedSignals> {
  const out = new Map<string, PubMedSignals>();
  const blocks = xml.split(/<PubmedArticle[^>]*>/).slice(1);
  for (const block of blocks) {
    const pmid = block.match(/<PMID[^>]*>([\s\S]*?)<\/PMID>/)?.[1]?.trim();
    if (!pmid) continue;
    const publication_types = Array.from(
      block.matchAll(/<PublicationType[^>]*>([^<]+)<\/PublicationType>/g),
      (m) => m[1].trim(),
    );
    const mesh = Array.from(
      block.matchAll(/<DescriptorName[^>]*>([^<]+)<\/DescriptorName>/g),
      (m) => m[1].trim(),
    );
    out.set(pmid, { publication_types, mesh });
  }
  return out;
}

async function backfillPubMed() {
  const articles = await loadAll<{ id: string; pmid: string }>("pubmed_articles", "id,pmid");
  const target = articles.slice(0, Math.min(articles.length, LIMIT));
  console.log(`PubMed: ${target.length}/${articles.length} to backfill (efetch publication_types)`);

  const BATCH = 100;
  let updated = 0, withRct = 0, withReview = 0, errors = 0;
  for (let i = 0; i < target.length; i += BATCH) {
    const slice = target.slice(i, i + BATCH);
    const params = new URLSearchParams({
      db: "pubmed",
      id: slice.map((a) => a.pmid).join(","),
      rettype: "abstract",
      retmode: "xml",
    });
    if (NCBI_API_KEY) params.set("api_key", NCBI_API_KEY);
    let parsed = new Map<string, PubMedSignals>();
    try {
      const res = await fetch(`${EFETCH}?${params.toString()}`, {
        headers: { "User-Agent": "PharmaBroBot/1.0 (axel@nemesis.app)" },
      });
      if (res.ok) parsed = parsePubMedXml(await res.text());
      else errors += slice.length;
    } catch (_e) {
      errors += slice.length;
    }
    for (const a of slice) {
      const sig = parsed.get(a.pmid);
      if (!sig) continue;
      const { error } = await sb.from("pubmed_articles")
        .update({ publication_types: sig.publication_types, mesh_terms: sig.mesh })
        .eq("id", a.id);
      if (error) { errors++; continue; }
      updated++;
      if (sig.publication_types.some((t) => /randomized controlled trial/i.test(t))) withRct++;
      if (sig.publication_types.some((t) => /meta-analysis|systematic review/i.test(t))) withReview++;
    }
    console.log(`  …${updated} updated (batch ${i / BATCH + 1})`);
    await sleep(NCBI_API_KEY ? 150 : 400); // 10 vs 3 req/s
  }
  console.log(
    `PubMed done: ${updated} updated, ${withRct} RCTs, ${withReview} reviews/meta, ${errors} errors`,
  );
}

async function main() {
  if (!PUBMED_ONLY) await backfillTrials();
  if (!TRIALS_ONLY) await backfillPubMed();
  console.log("\n✅ backfill complete");
}

main().catch((e) => {
  console.error("fatal:", e.message);
  Deno.exit(1);
});
