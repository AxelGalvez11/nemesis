#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Phase 5 — detect-updates: emit `updates` rows from genuine corpus EVENTS.
 *
 * An update must map to a real event, never to "a row exists" (the project thesis
 * is auditable, not vibes). Phase 5 emits only APPEND-ONLY event signals, where a
 * new corpus row IS the event:
 *   - pubmed_new    : a PubMed article bridged to a drug entity (new research).
 *   - trial_results : a bridged trial that has results_first_posted (posted results).
 *
 * NOT emitted in Phase 5 (deliberate — see PROGRESS carry-forwards):
 *   - label_update / trial_status : these are CHANGE events, but persist.ts
 *     supersedes in place (same core_sources id, superseded_at stays null) and
 *     emits nothing, so there is no honest change signal to key on yet. They are
 *     deferred WITH the supersede→emit freshness pipeline (which will add
 *     content_hash to the 0116 dedup key). Emitting label_update for a label that
 *     has not changed would fabricate a non-event.
 *
 * The emitted key honors the LOCKED watchlist seam: a drug follow is
 * item_type='drug', item_ref=<entity_id uuid as text>. The ARTICLE/TRIAL identity
 * rides in source_id + title + source_url, NOT in item_ref — so the
 * get_watchlist_updates join matches the drug follow while the 0116 dedup key
 * (item_type,item_ref,update_type,source_id) still separates one article from the
 * next. Re-runs ON CONFLICT DO NOTHING → idempotent.
 *
 * detected_at = detection time (run timestamp): "PharmaBro surfaced this to
 * watchers now", NOT "published/changed now". The source's real publish/results
 * date rides in the summary so nothing misrepresents it. The weekly digest frames
 * items as "new to your watchlist this week".
 *
 * Idempotent; prove-before-bulk via --dry-run / --limit=N. Heavy reads on CLOUD.
 *
 * Usage:
 *   SB_URL=https://<ref>.supabase.co SERVICE_KEY=... \
 *     deno run --allow-net --allow-env scripts/detect-updates.ts \
 *       [--pubmed-only|--trials-only] [--only=<entity_id|normalized_name>] \
 *       [--limit=N] [--dry-run]
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
if (!SB_URL || !SERVICE_KEY) {
  console.error("SB_URL + SERVICE_KEY required");
  Deno.exit(2);
}
const sb = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });

const flag = (n: string) => Deno.args.includes(`--${n}`);
const arg = (n: string): string | undefined =>
  Deno.args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const LIMIT = arg("limit") ? Number(arg("limit")) : Infinity;
const ONLY = arg("only");
const PUBMED_ONLY = flag("pubmed-only");
const TRIALS_ONLY = flag("trials-only");
const DRY_RUN = flag("dry-run");

const DEDUP_COLS = "item_type,item_ref,update_type,source_id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Deterministic source_importance inputs (the digest comparator does the real
// ranking; this numeric is one stored signal). Bounded [0,1].
const IMP_TRIAL_RESULTS = 0.6;
const IMP_PUBMED_BASE = 0.4;
const IMP_RCT_BOOST = 0.2;
const IMP_REVIEW_BOOST = 0.3; // systematic review / meta-analysis outranks a lone RCT

interface UpdateRow {
  item_type: "drug";
  item_ref: string;
  update_type: "pubmed_new" | "trial_results";
  title: string;
  summary: string | null;
  source_id: string | null;
  source_url: string | null;
  importance_score: number;
  detected_at: string;
}

/** Paginate past PostgREST's 1000-row cap. */
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

function pubmedImportance(types: string[]): number {
  const t = types.map((x) => x.toLowerCase());
  let imp = IMP_PUBMED_BASE;
  if (t.some((x) => /meta-analysis|systematic review/.test(x))) imp += IMP_REVIEW_BOOST;
  else if (t.some((x) => /randomized controlled trial/.test(x))) imp += IMP_RCT_BOOST;
  return Math.min(1, Number(imp.toFixed(3)));
}

interface Entity { id: string; canonical_name: string; normalized_name: string }
interface Article {
  id: string; pmid: string; title: string | null; journal: string | null;
  publication_date: string | null; publication_types: string[] | null;
  source_url: string | null; source_id: string | null;
}
interface Trial {
  id: string; nct_id: string; brief_title: string | null; status: string | null;
  results_first_posted: string | null; source_url: string | null; source_id: string | null;
}

async function main() {
  const detectedAt = new Date().toISOString();

  // Optional single-entity scope (id or normalized_name) for prove-before-bulk.
  let onlyId: string | undefined;
  if (ONLY) {
    const col = UUID_RE.test(ONLY) ? "id" : "normalized_name";
    const { data } = await sb.from("drug_entities").select("id").eq(col, ONLY).limit(1);
    onlyId = data?.[0]?.id;
    if (!onlyId) {
      console.error(`--only=${ONLY} did not resolve to a drug entity`);
      Deno.exit(2);
    }
    console.log(`Scope: only entity ${onlyId} (${ONLY})`);
  }

  const entities = await loadAll<Entity>("drug_entities", "id,canonical_name,normalized_name");
  const entityName = new Map(entities.map((e) => [e.id, e.canonical_name]));

  const rows: UpdateRow[] = [];
  let skippedNoSource = 0;

  // ---- pubmed_new: one update per (drug entity, bridged article) ----
  if (!TRIALS_ONLY) {
    const bridges = await loadAll<{ drug_entity_id: string; article_id: string }>(
      "drug_entity_pubmed", "drug_entity_id,article_id",
    );
    const articles = await loadAll<Article>(
      "pubmed_articles",
      "id,pmid,title,journal,publication_date,publication_types,source_url,source_id",
    );
    const byId = new Map(articles.map((a) => [a.id, a]));
    for (const b of bridges) {
      if (onlyId && b.drug_entity_id !== onlyId) continue;
      const a = byId.get(b.article_id);
      if (!a) continue;
      // An update must carry provenance (source_id → Layer A; also what powers the
      // dedup key). Skip + count the rare source-less row rather than let
      // NULLS NOT DISTINCT silently collapse distinct articles into one.
      if (!a.source_id) { skippedNoSource++; continue; }
      const types = a.publication_types ?? [];
      const datePart = a.publication_date ? ` · published ${a.publication_date}` : "";
      const typePart = types.length ? ` · ${types.slice(0, 3).join(", ")}` : "";
      rows.push({
        item_type: "drug",
        item_ref: b.drug_entity_id,
        update_type: "pubmed_new",
        title: `New PubMed article: ${a.title ?? `PMID ${a.pmid}`}`,
        summary: `${a.journal ?? "PubMed"}${datePart}${typePart} (PMID ${a.pmid})`,
        source_id: a.source_id,
        source_url: a.source_url,
        importance_score: pubmedImportance(types),
        detected_at: detectedAt,
      });
    }
  }

  // ---- trial_results: bridged trials that have posted results ----
  if (!PUBMED_ONLY) {
    const bridges = await loadAll<{ drug_entity_id: string; trial_id: string }>(
      "drug_entity_trials", "drug_entity_id,trial_id",
    );
    const trials = await loadAll<Trial>(
      "clinical_trials",
      "id,nct_id,brief_title,status,results_first_posted,source_url,source_id",
    );
    const byId = new Map(trials.map((t) => [t.id, t]));
    for (const b of bridges) {
      if (onlyId && b.drug_entity_id !== onlyId) continue;
      const t = byId.get(b.trial_id);
      if (!t || !t.results_first_posted) continue; // results posted = the event
      if (!t.source_id) { skippedNoSource++; continue; } // provenance required (see pubmed note)
      rows.push({
        item_type: "drug",
        item_ref: b.drug_entity_id,
        update_type: "trial_results",
        title: `Trial results posted: ${t.brief_title ?? t.nct_id} (${t.nct_id})`,
        summary: `Status: ${t.status ?? "unknown"} · results first posted ${t.results_first_posted}`,
        source_id: t.source_id,
        source_url: t.source_url,
        importance_score: IMP_TRIAL_RESULTS,
        detected_at: detectedAt,
      });
    }
  }

  // Slice for prove-before-bulk. (Deterministic order: by entity then type.)
  rows.sort((a, b) =>
    a.item_ref.localeCompare(b.item_ref) || a.update_type.localeCompare(b.update_type) ||
    (a.source_id ?? "").localeCompare(b.source_id ?? "")
  );
  const target = rows.slice(0, Math.min(rows.length, LIMIT));

  const byType = target.reduce<Record<string, number>>((m, r) => {
    m[r.update_type] = (m[r.update_type] ?? 0) + 1; return m;
  }, {});
  console.log(`Candidate updates: ${target.length}/${rows.length}`);
  for (const [k, v] of Object.entries(byType)) console.log(`  ${k}: ${v}`);
  if (skippedNoSource > 0) console.log(`  skipped (no source_id): ${skippedNoSource}`);
  if (onlyId) console.log(`  (for ${entityName.get(onlyId) ?? onlyId})`);

  if (DRY_RUN) {
    console.log("\n--dry-run: no writes. Sample:");
    for (const r of target.slice(0, 5)) console.log(`  [${r.update_type}] ${r.title}`);
    return;
  }

  // Idempotent emit: ON CONFLICT (dedup key) DO NOTHING. .select() returns only
  // the rows actually inserted (DO NOTHING ... RETURNING), so we count real emits.
  const BATCH = 200;
  let inserted = 0, errors = 0;
  for (let i = 0; i < target.length; i += BATCH) {
    const slice = target.slice(i, i + BATCH);
    const { data, error } = await sb
      .from("updates")
      .upsert(slice, { onConflict: DEDUP_COLS, ignoreDuplicates: true })
      .select("id");
    if (error) {
      if (errors < 3) console.error(`  batch ${i / BATCH + 1} → ${error.message}`);
      errors++;
      continue;
    }
    inserted += data?.length ?? 0;
    console.log(`  …emitted ${inserted} new (batch ${i / BATCH + 1})`);
  }
  console.log(
    `\n${errors === 0 ? "✅" : "⚠️"} detect-updates: ${inserted} new updates emitted, ${target.length - inserted} already present, ${skippedNoSource} skipped (no source_id), ${errors} batch errors`,
  );
  // No silent failures: a batch error means some updates did not land — fail loud
  // so the AC8 gate cannot pass on a partial/empty emit.
  if (errors > 0) Deno.exit(1);
}

main().catch((e) => {
  console.error("fatal:", e.message);
  Deno.exit(1);
});
