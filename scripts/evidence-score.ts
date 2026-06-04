#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Phase 4 — the evidence-scoring engine (§9, "the IP"). Writes evidence_scores.
 *
 * DETERMINISTIC TIER, LLM PROSE ONLY (the §9 mandate, same discipline as the
 * safety layer):
 *   1. extractSignals() aggregates an entity's typed projections → RawAggregates.
 *   2. scoreSignals() (pure, packages/shared) returns the TIER. The LLM never
 *      touches it.
 *   3. The LLM writes ONLY rationale + limitations, grounded in the entity's
 *      source list. On any failure (no key, malformed, timeout) it DEGRADES to a
 *      deterministic templated rationale — scoring is never blocked by the model.
 *
 * Idempotent (delete-then-insert per target). Prove-before-bulk: default scores
 * the §9 anchor/example entities; --bulk scores every evidence-bearing entity.
 *
 * Usage:
 *   SB_URL=https://<ref>.supabase.co SERVICE_KEY=... [LLM_API_KEY=...] \
 *     deno run --allow-net --allow-env scripts/evidence-score.ts \
 *       [--bulk] [--only=a,b] [--no-llm] [--claims]
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  extractSignals,
  scoreSignals,
  toEvidenceCounts,
  type EntityEvidence,
  type EvidenceEntityType,
  type EvidenceSignals,
  type RawAggregates,
} from "../packages/shared/src/evidence-scoring.ts";
import type { ApprovedStatus } from "../packages/shared/src/search.ts";
import type { EvidenceTier } from "../packages/shared/src/evidence.ts";
import { callTool, hasLlmKey, llmApiKey } from "../supabase/functions/ask/llm.ts";
import { CURATED_CLAIMS, type CuratedClaim } from "./evidence-claims.ts";

const SB_URL = Deno.env.get("SB_URL");
const SERVICE_KEY = Deno.env.get("SERVICE_KEY");
if (!SB_URL || !SERVICE_KEY) {
  console.error("SB_URL + SERVICE_KEY required");
  Deno.exit(2);
}
const sb = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });

const flag = (n: string) => Deno.args.includes(`--${n}`);
const arg = (n: string) => Deno.args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const BULK = flag("bulk");
const NO_LLM = flag("no-llm") || !hasLlmKey();
const WITH_CLAIMS = flag("claims") || !BULK; // curated claims run with the prove set
const ONLY = (arg("only") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const MODEL = Deno.env.get("LLM_MODEL") ?? "deepseek-chat";
const VERSION = "evidence-engine-1.0.0";
/** Cap the source_ids audit list persisted on each score row. */
const MAX_SOURCE_IDS = 25;
/** Cap the source titles handed to the LLM for the rationale prompt. */
const MAX_RATIONALE_SOURCES = 8;

const DEFAULT_ANCHORS = [
  "semaglutide", "atorvastatin", "warfarin", "sertraline", "metformin",
  "retatrutide", "bpc-157", "tb-500", "creatine", "tirzepatide",
];

// High-risk drug families requiring human review (§9 step 5 / doc-12).
const HIGH_RISK = /anticoagul|warfarin|heparin|apixaban|rivaroxaban|insulin|opioid|oxycodone|fentanyl|morphine|psychiatr|antipsychot|antidepress|ssri|benzodiazep|immunosuppress|chemother|antineoplast/i;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

async function loadAll<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Preload the corpus into in-memory maps (small: ~3k entities, <1k trials/pubmed)
// ---------------------------------------------------------------------------

interface EntityRow {
  id: string; normalized_name: string; canonical_name: string;
  entity_type: EvidenceEntityType; approved_status: ApprovedStatus;
}
interface TrialRowDb { id: string; study_type: string | null; phase: string | null; enrollment: number | null; results_first_posted: string | null; }
interface PubRowDb { id: string; publication_types: string[] | null; mesh_terms: string[] | null; }
interface SourceRow { id: string; title: string | null; provider: string | null; }

interface Ctx {
  labelCount: Map<string, number>;
  trialsByEntity: Map<string, TrialRowDb[]>;
  pubByEntity: Map<string, PubRowDb[]>;
  sourcesByEntity: Map<string, SourceRow[]>;
  classNamesByEntity: Map<string, string[]>;
}

async function preload(): Promise<{ entities: EntityRow[]; ctx: Ctx }> {
  const entities = await loadAll<EntityRow>(
    "drug_entities", "id,normalized_name,canonical_name,entity_type,approved_status",
  );
  const labels = await loadAll<{ drug_entity_id: string }>("label_documents", "drug_entity_id");
  const trials = await loadAll<TrialRowDb>("clinical_trials", "id,study_type,phase,enrollment,results_first_posted");
  const trialLinks = await loadAll<{ drug_entity_id: string; trial_id: string }>("drug_entity_trials", "drug_entity_id,trial_id");
  const pubs = await loadAll<PubRowDb>("pubmed_articles", "id,publication_types,mesh_terms");
  const pubLinks = await loadAll<{ drug_entity_id: string; article_id: string }>("drug_entity_pubmed", "drug_entity_id,article_id");
  const srcLinks = await loadAll<{ drug_entity_id: string; source_id: string }>("drug_entity_sources", "drug_entity_id,source_id");
  const sources = await loadAll<SourceRow>("core_sources", "id,title,provider");
  const memberships = await loadAll<{ drug_entity_id: string; class_id: string }>("drug_class_memberships", "drug_entity_id,class_id");
  const classes = await loadAll<{ id: string; name: string }>("drug_classes", "id,name");

  const trialById = new Map(trials.map((t) => [t.id, t]));
  const pubById = new Map(pubs.map((p) => [p.id, p]));
  const srcById = new Map(sources.map((s) => [s.id, s]));
  const className = new Map(classes.map((c) => [c.id, c.name]));

  const labelCount = new Map<string, number>();
  for (const l of labels) labelCount.set(l.drug_entity_id, (labelCount.get(l.drug_entity_id) ?? 0) + 1);

  const trialsByEntity = new Map<string, TrialRowDb[]>();
  for (const l of trialLinks) {
    const t = trialById.get(l.trial_id);
    if (!t) continue;
    (trialsByEntity.get(l.drug_entity_id) ?? trialsByEntity.set(l.drug_entity_id, []).get(l.drug_entity_id)!).push(t);
  }
  const pubByEntity = new Map<string, PubRowDb[]>();
  for (const l of pubLinks) {
    const p = pubById.get(l.article_id);
    if (!p) continue;
    (pubByEntity.get(l.drug_entity_id) ?? pubByEntity.set(l.drug_entity_id, []).get(l.drug_entity_id)!).push(p);
  }
  const sourcesByEntity = new Map<string, SourceRow[]>();
  for (const l of srcLinks) {
    const s = srcById.get(l.source_id);
    if (!s) continue;
    (sourcesByEntity.get(l.drug_entity_id) ?? sourcesByEntity.set(l.drug_entity_id, []).get(l.drug_entity_id)!).push(s);
  }
  const classNamesByEntity = new Map<string, string[]>();
  for (const m of memberships) {
    const n = className.get(m.class_id);
    if (!n) continue;
    (classNamesByEntity.get(m.drug_entity_id) ?? classNamesByEntity.set(m.drug_entity_id, []).get(m.drug_entity_id)!).push(n);
  }
  return { entities, ctx: { labelCount, trialsByEntity, pubByEntity, sourcesByEntity, classNamesByEntity } };
}

function entityEvidence(e: EntityRow, ctx: Ctx, isOffLabel = false): EntityEvidence {
  return {
    entity_type: e.entity_type,
    approved_status: e.approved_status,
    label_count: ctx.labelCount.get(e.id) ?? 0,
    trials: (ctx.trialsByEntity.get(e.id) ?? []).map((t) => ({
      study_type: t.study_type, phase: t.phase, enrollment: t.enrollment, results_first_posted: t.results_first_posted,
    })),
    pubmed: (ctx.pubByEntity.get(e.id) ?? []).map((p) => ({
      publication_types: p.publication_types ?? [], mesh_terms: p.mesh_terms ?? [],
    })),
    is_off_label: isOffLabel,
  };
}

// ---------------------------------------------------------------------------
// Rationale: LLM (prose only) with deterministic template fallback
// ---------------------------------------------------------------------------

const TIER_LABEL: Record<EvidenceTier, string> = {
  very_strong: "Very strong", strong: "Strong", moderate: "Moderate",
  weak: "Weak", very_weak: "Very weak", unknown: "Unknown / insufficient",
};

function templatedRationale(name: string, t: EvidenceTier, s: EvidenceSignals): { rationale: string; limitations: string[] } {
  const parts: string[] = [];
  if (s.n_meta_analysis || s.n_systematic_review) parts.push(`${s.n_meta_analysis + s.n_systematic_review} systematic review(s)/meta-analysis`);
  if (s.n_rct) parts.push(`${s.n_rct} randomized controlled trial(s)`);
  if (s.n_human_trials) parts.push(`${s.n_human_trials} human trial(s)`);
  if (s.n_observational) parts.push(`${s.n_observational} observational stud(ies)`);
  if (s.n_preclinical_only) parts.push(`${s.n_preclinical_only} preclinical/animal stud(ies)`);
  const body = parts.length ? parts.join(", ") : "no qualifying human or preclinical studies were linked";
  const approval = s.fda_approved_for_indication ? "It is FDA-approved." : "It is not FDA-approved for this use.";
  const rationale = `${TIER_LABEL[t]} evidence for ${name}: ${body}. ${approval}`;

  const limitations: string[] = [];
  if (!s.fda_approved_for_indication) limitations.push("Not FDA-approved for this indication.");
  if (!s.results_posted && s.n_human_trials > 0) limitations.push("Trial results are not yet posted.");
  if (!s.sample_size_adequate && (s.n_rct > 0 || s.n_human_trials > 0)) limitations.push("Limited sample size.");
  if (s.entity_type === "peptide" || s.approved_status === "research_use") limitations.push("Research-use compound; robust human safety/efficacy data are limited.");
  if (s.n_preclinical_only > 0 && s.n_human_trials === 0) limitations.push("Evidence is animal/mechanistic only; human results may differ.");
  if (!limitations.length) limitations.push("Evidence may not reflect all real-world populations or long-term outcomes.");
  return { rationale, limitations };
}

const RATIONALE_TOOL = {
  name: "write_evidence_rationale",
  description: "Write the rationale and limitations prose for a PRE-COMPUTED evidence tier. You must NOT change or restate a different tier — only explain it.",
  parameters: {
    type: "object",
    properties: {
      rationale: { type: "string", description: "1–2 sentences explaining why the evidence justifies the given tier, grounded ONLY in the provided counts/sources. No dosing, no cure claims, no safety guarantees." },
      limitations: { type: "array", items: { type: "string" }, description: "2–4 specific limitations of the evidence base." },
    },
    required: ["rationale", "limitations"],
  },
};

async function llmRationale(
  name: string, t: EvidenceTier, s: EvidenceSignals, sources: SourceRow[],
): Promise<{ rationale: string; limitations: string[]; via: "llm" | "template" }> {
  if (NO_LLM || t === "unknown") return { ...templatedRationale(name, t, s), via: "template" };
  const srcLines = sources.slice(0, MAX_RATIONALE_SOURCES).map((x) => `- ${x.provider}: ${x.title ?? "(untitled)"}`).join("\n") || "- (no linked sources)";
  const counts = `meta=${s.n_meta_analysis} sr=${s.n_systematic_review} rct=${s.n_rct} human_trials=${s.n_human_trials} observational=${s.n_observational} preclinical=${s.n_preclinical_only} max_phase=${s.max_trial_phase} fda_approved=${s.fda_approved_for_indication} label=${s.dailymed_label_present}`;
  try {
    const { input } = await callTool<{ rationale: string; limitations: string[] }>(
      {
        model: MODEL,
        max_tokens: 700,
        temperature: 0,
        system:
          "You write evidence-strength rationales for a medical education app. The TIER is already decided deterministically; never contradict it or assert a different strength. Ground every statement in the provided evidence counts and sources. Be conservative and factual. Never give dosing, never claim a cure, never say something is safe.",
        messages: [{
          role: "user",
          content: `Entity: ${name}\nAssigned tier (do not change): ${t}\nEvidence counts: ${counts}\nLinked sources:\n${srcLines}\n\nWrite the rationale + 2–4 limitations for this tier.`,
        }],
        tools: [RATIONALE_TOOL],
      },
      RATIONALE_TOOL.name,
      llmApiKey(),
    );
    const limitations = Array.isArray(input.limitations) ? input.limitations.filter((x) => typeof x === "string" && x.trim()) : [];
    if (typeof input.rationale === "string" && input.rationale.trim() && limitations.length) {
      return { rationale: input.rationale.trim(), limitations, via: "llm" };
    }
  } catch (e) {
    console.error(`  rationale LLM failed for ${name} (${(e as Error).message}); using template`);
  }
  return { ...templatedRationale(name, t, s), via: "template" };
}

// ---------------------------------------------------------------------------
// Score + persist
// ---------------------------------------------------------------------------

interface ScoreRow {
  entity_id: string; entity_type: string; claim_text: string | null;
  score: string; rationale: string; evidence_counts: unknown; limitations: string[];
  source_ids: string[]; generated_by_version: string; review_required: boolean; review_reason: string | null; reviewed: boolean;
}

function reviewReason(e: EntityRow, ctx: Ctx): string | null {
  const classes = ctx.classNamesByEntity.get(e.id) ?? [];
  if (HIGH_RISK.test(e.canonical_name) || classes.some((c) => HIGH_RISK.test(c))) return "high_risk_drug";
  if (e.entity_type === "peptide" || e.approved_status === "research_use") return "research_use_compound";
  return null;
}

/** Claim-scoped raw signals: inherit the entity's type/status, take the curated
 * counts (default 0 / false). The off-label flag drives the §9 cap. */
function claimRaw(e: EntityRow, c: CuratedClaim): RawAggregates {
  return {
    n_meta_analysis: 0, n_systematic_review: 0, n_rct: 0, n_human_trials: 0,
    n_observational: 0, n_preclinical_only: 0, max_trial_phase: 0, results_posted: false,
    max_enrollment: 0, fda_approved_for_indication: false, dailymed_label_present: false,
    ...c.evidence, // curated claim-scoped counts
    // entity-authoritative fields are pinned AFTER the spread so a curated claim
    // can never override them and slip past the peptide/research-use cap.
    entity_type: e.entity_type, approved_status: e.approved_status, is_off_label: c.off_label,
  };
}

async function buildRow(e: EntityRow, ctx: Ctx, claim?: CuratedClaim): Promise<ScoreRow> {
  const raw: RawAggregates = claim ? claimRaw(e, claim) : extractSignals(entityEvidence(e, ctx));
  const { tier: t, signals } = scoreSignals(raw);
  const sources = ctx.sourcesByEntity.get(e.id) ?? [];
  const name = claim ? `${e.canonical_name} — ${claim.claim}` : e.canonical_name;
  const { rationale, limitations, via } = await llmRationale(name, t, signals, sources);
  const reason = reviewReason(e, ctx);
  console.log(`  ${claim ? "claim" : "drug "} ${e.canonical_name}${claim ? ` [${claim.claim}]` : ""} → ${t} (${via})${reason ? ` ⚑${reason}` : ""}`);
  return {
    entity_id: e.id,
    entity_type: claim ? "claim" : "drug",
    claim_text: claim?.claim ?? null,
    score: t,
    rationale,
    evidence_counts: toEvidenceCounts(signals),
    limitations,
    source_ids: sources.slice(0, MAX_SOURCE_IDS).map((s) => s.id),
    generated_by_version: VERSION,
    review_required: reason !== null,
    review_reason: reason,
    reviewed: false,
  };
}

async function main() {
  console.log(`Evidence engine ${VERSION} — ${NO_LLM ? "templated rationale" : "LLM rationale"}; ${BULK ? "BULK" : "prove (anchors)"}\n`);
  const { entities, ctx } = await preload();
  const byNorm = new Map(entities.map((e) => [e.normalized_name, e]));

  // Target entity set.
  let targets: EntityRow[];
  if (BULK) {
    targets = entities.filter((e) =>
      (ctx.labelCount.get(e.id) ?? 0) > 0 || ctx.trialsByEntity.has(e.id) || ctx.pubByEntity.has(e.id)
    );
  } else {
    const names = ONLY.length ? ONLY : DEFAULT_ANCHORS;
    targets = names.map((n) => byNorm.get(norm(n))).filter((e): e is EntityRow => !!e);
  }
  console.log(`Scoring ${targets.length} entities (drug-level)…`);

  const rows: ScoreRow[] = [];
  for (const e of targets) rows.push(await buildRow(e, ctx));

  // Curated claim-level rows (AC9 "off-label < approved" needs claim rows).
  if (WITH_CLAIMS) {
    console.log(`\nScoring ${CURATED_CLAIMS.length} curated claims…`);
    for (const c of CURATED_CLAIMS) {
      const e = byNorm.get(norm(c.entity));
      if (!e) { console.log(`  (skip claim — entity '${c.entity}' not found)`); continue; }
      rows.push(await buildRow(e, ctx, c));
    }
  }

  // Idempotent replace: delete the rows we're about to (re)write, then insert.
  const drugIds = rows.filter((r) => r.entity_type === "drug").map((r) => r.entity_id);
  if (drugIds.length) {
    await sb.from("evidence_scores").delete().eq("entity_type", "drug").is("claim_text", null).in("entity_id", drugIds);
  }
  for (const r of rows.filter((r) => r.entity_type === "claim")) {
    await sb.from("evidence_scores").delete().eq("entity_type", "claim").eq("entity_id", r.entity_id).eq("claim_text", r.claim_text!);
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("evidence_scores").insert(rows.slice(i, i + 200));
    if (error) throw new Error(`insert evidence_scores: ${error.message}`);
  }

  const flagged = rows.filter((r) => r.review_required).length;
  console.log(`\n✅ wrote ${rows.length} evidence_scores (${flagged} flagged for human review)`);
}

main().catch((e) => {
  console.error("fatal:", e.message);
  Deno.exit(1);
});
