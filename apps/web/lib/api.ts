"use client";

import type {
  AskMode,
  AskResponse,
  Digest,
  DrugOverview,
  EntitlementSnapshot,
  EntitySuggestion,
  QuotaExceededError,
  ReportMode,
  ResearchProgressStep,
  ResearchReport,
  ScopeResult,
  SearchResult,
  SourceDetail,
  UsageSnapshot,
  WatchEvent,
  WatchlistItem,
  WatchlistUpdate,
  WatchItemType,
} from "@pharmabro/shared";
import { resolveWatchCadence, watchEntitlement } from "@pharmabro/shared";
import { isMeshTerm, mergeSuggestions, type MeshTerm } from "./mesh";
import { supabase } from "./supabase";
import { isPreviewMode, supabaseAnonKey, supabaseUrl } from "./env";

export interface LabelDoc {
  label_id: string;
  extracted_sections: Record<string, string>;
  source_id: string | null;
  provider: string | null;
  citation_url: string | null;
}

export interface DrugTrial {
  trial_id: string;
  nct_id: string | null;
  brief_title: string | null;
  phase: string | null;
  status: string | null;
  source_id: string | null;
}

export interface DrugPubmed {
  article_id: string;
  pmid: string | null;
  title: string | null;
  journal: string | null;
  publication_date: string | null;
  source_id: string | null;
}

export interface AskQuotaError extends Error {
  quota: QuotaExceededError;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function rows<T>(raw: unknown, keep: (r: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => (isObj(item) ? [keep(item)].filter((x): x is T => x !== null) : []));
}

const periodStart = new Date().toISOString().slice(0, 10);
const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const demoEntitlements: EntitlementSnapshot = {
  plan: "free",
  entitlements: {
    ask_daily_limit: 10,
    watchlist_limit: 3,
    stripe_plus_enabled: true,
  },
};

const demoUsage: UsageSnapshot = {
  plan: "free",
  counters: {
    ask_daily: {
      used: 2,
      limit: 10,
      period_start: periodStart,
      period_end: periodEnd,
    },
  },
};

const demoSources: SourceDetail[] = [
  {
    source_id: "source-preview-label",
    provider: "openfda",
    title: "Semaglutide prescribing information",
    subtitle: "Preview label source",
    url: "https://www.accessdata.fda.gov/",
    external_id: "preview-label-semaglutide",
    license: "public-domain",
    attribution_required: false,
    published_at: "2025-01-01",
    fetched_at: "2026-06-05T12:00:00Z",
    retrieved_at: "2026-06-05T12:00:00Z",
    superseded_at: null,
    is_current: true,
    sections: ["warnings", "indications", "adverse_reactions"],
    metadata: { preview: true },
  },
  {
    source_id: "source-preview-trial",
    provider: "clinicaltrials",
    title: "Semaglutide cardiovascular outcomes trial",
    subtitle: "Preview trial source",
    url: "https://clinicaltrials.gov/",
    external_id: "NCT-preview",
    license: "public",
    attribution_required: false,
    published_at: "2025-09-15",
    fetched_at: "2026-06-05T12:00:00Z",
    retrieved_at: "2026-06-05T12:00:00Z",
    superseded_at: null,
    is_current: true,
    sections: ["study design", "outcomes"],
    metadata: { preview: true },
  },
];

let demoWatchlist: WatchlistItem[] = [
  {
    id: "preview-watch-semaglutide",
    item_type: "drug",
    item_ref: "semaglutide",
    alert_types: ["pubmed_new", "trial_results"],
    frequency: "weekly",
    created_at: "2026-06-05T12:00:00Z",
  },
];

function demoDrug(id: string): DrugOverview {
  return {
    id,
    canonical_name: id === "ozempic" ? "Ozempic" : "Semaglutide",
    entity_type: "drug",
    approved_status: "approved",
    mechanism_summary: "GLP-1 receptor agonist used for glycemic control and chronic weight management indications depending on product labeling.",
    rxnorm_cui: "1991302",
    primary_class: { id: "glp1", name: "GLP-1 receptor agonists" },
    classes: [{ id: "glp1", name: "GLP-1 receptor agonists" }],
    brand_names: ["Ozempic", "Wegovy", "Rybelsus"],
    evidence_score: {
      score: "strong",
      rationale: "Preview score based on label, trial, and PubMed-style evidence surfaces.",
      evidence_counts: { n_rct: 4, n_human_trials: 8, max_trial_phase: "Phase 4" },
      limitations: ["Preview data only until Supabase is configured."],
    },
    counts: { labels: 1, trials: 1, pubmed: 1, prices: 0 },
    sources: demoSources.map(({ source_id, provider, title, url, license, retrieved_at }) => ({
      source_id,
      provider,
      title,
      url,
      license,
      retrieved_at,
    })),
  };
}

export async function fetchEntitlements(): Promise<EntitlementSnapshot> {
  if (isPreviewMode) return demoEntitlements;
  const { data, error } = await supabase.rpc("get_my_entitlements");
  if (error) throw new Error(`entitlements failed: ${error.message}`);
  return (isObj(data) ? data : { plan: "free", entitlements: {} }) as unknown as EntitlementSnapshot;
}

export async function fetchUsage(): Promise<UsageSnapshot> {
  if (isPreviewMode) return demoUsage;
  const { data, error } = await supabase.rpc("get_my_usage");
  if (error) throw new Error(`usage failed: ${error.message}`);
  return (isObj(data) ? data : { plan: "free", counters: {} }) as unknown as UsageSnapshot;
}

export async function askQuestion(question: string, mode?: AskMode): Promise<AskResponse> {
  if (isPreviewMode) {
    // Keep local demos honest: preview answers are static, but the UI should still exercise the
    // same thinking/progress state users see while the real evidence engine is working.
    await new Promise((resolve) => setTimeout(resolve, 1250));
    return {
      answer_id: "preview-answer",
      intent: "drug_overview",
      plain_english_summary: `Preview answer for: ${question}`,
      evidence_grade: "strong",
      answer_sections: {
        what_we_know: [
          { text: "Semaglutide is a **GLP-1 receptor agonist** with product-specific approved indications.", citation_ids: ["[1]"] },
          { text: "In phase 3 trials it produced clinically meaningful reductions in HbA1c and body weight.", citation_ids: ["[2]", "[3]"] },
        ],
        what_we_do_not_know: [
          { text: "This local preview does not query the live corpus, so it should not be used as medical guidance.", citation_ids: [] },
        ],
        safety_notes: [
          { text: "Labeled warnings include gastrointestinal adverse reactions and a boxed warning for thyroid C-cell tumors that require individualized clinician review.", citation_ids: ["[1]"] },
          { text: "Talk with a licensed clinician before changing any medication plan.", citation_ids: [] },
        ],
        questions_to_ask: ["Which product label applies to me?", "What warning signs should prompt urgent care?"],
      },
      citations: [
        {
          chunk_tag: "[1]",
          source_id: "source-preview-label",
          source_type: "openfda",
          title: "Semaglutide prescribing information",
          section: "warnings",
          url: "https://www.accessdata.fda.gov/",
          license: "public-domain",
          published_date: "2025-01-01",
          retrieved_at: "2026-06-05T12:00:00Z",
          support_level: "direct",
          support_score: 96,
          evidence_role: "official_label",
          evidence_weight: 92,
          support_reason: "Official label; cited claims have direct label support.",
        },
        {
          chunk_tag: "[2]",
          source_id: "source-preview-pubmed",
          source_type: "pubmed",
          title: "Semaglutide and cardiovascular outcomes in type 2 diabetes (illustrative example)",
          section: "results",
          url: "https://pubmed.ncbi.nlm.nih.gov/",
          license: "abstract",
          published_date: "2024-06-01",
          retrieved_at: "2026-06-05T12:00:00Z",
          support_level: "partial",
          support_score: 66,
          evidence_role: "research_article",
          evidence_weight: 52,
          support_reason: "Research article reviewed for outcome context; support is partial in preview mode.",
        },
        {
          chunk_tag: "[3]",
          source_id: "source-preview-trial",
          source_type: "clinicaltrials",
          title: "Phase 3 semaglutide weight-management trial (illustrative example)",
          section: "outcomes",
          url: "https://clinicaltrials.gov/",
          license: "public-domain",
          published_date: "2023-11-15",
          retrieved_at: "2026-06-05T12:00:00Z",
          support_level: "partial",
          support_score: 70,
          evidence_role: "clinical_trial",
          evidence_weight: 74,
          support_reason: "Trial record supports study context in preview mode.",
        },
      ],
      safety_flags: [],
      refused_unsupported: false,
      oldest_source_date: "2026-06-05T12:00:00Z",
    };
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to ask");

  const res = await fetch(`${supabaseUrl}/functions/v1/ask`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question, use_health_context: false, ...(mode ? { mode } : {}) }),
  });
  const body = await res.json().catch(() => null);
  if (res.status === 429 && isObj(body) && body.error === "quota_exceeded") {
    const err = new Error("quota_exceeded") as AskQuotaError;
    err.quota = body as unknown as QuotaExceededError;
    throw err;
  }
  if (!res.ok) throw new Error(isObj(body) && typeof body.error === "string" ? body.error : `ask failed (${res.status})`);
  return body as AskResponse;
}

export async function searchEntities(q: string): Promise<SearchResult[]> {
  const query = q.trim();
  if (!query) return [];
  if (isPreviewMode) {
    return [
      { id: "semaglutide", type: "drug", name: "Semaglutide", subtitle: "Ozempic, Wegovy, Rybelsus", status: "approved", score: 1 },
      { id: "ozempic", type: "drug", name: "Ozempic", subtitle: "Brand page mapped to semaglutide evidence", status: "approved", score: 0.92 },
    ];
  }
  const { data, error } = await supabase.rpc("search_entities", { q: query });
  if (error) throw new Error(`search failed: ${error.message}`);
  return rows(data, (r) => typeof r.id === "string" && typeof r.name === "string" ? r as unknown as SearchResult : null);
}

// A couple of fixed suggestions for preview mode (drug + condition + device) so the universal picker is
// exercisable without a backend — mirrors the searchEntities / demoDrug preview mocks.
function demoSuggestions(): EntitySuggestion[] {
  return [
    { kind: "drug", source: "catalog", id: "semaglutide", name: "Semaglutide", subtitle: "Ozempic, Wegovy, Rybelsus", score: 1 },
    { kind: "condition", source: "mesh", id: "68003920", name: "Diabetes Mellitus", subtitle: "Diabetes", score: 0.9 },
    { kind: "device", source: "mesh", id: "68068098", name: "Insulin Infusion Systems", subtitle: "Insulin Pump", score: 0.8 },
  ];
}

// The MeSH half of the picker — hits our server route (which proxies NCBI). Failures degrade to [] so an
// NCBI hiccup never hides the drug results; the route URL is relative (same-origin) so it works in the app.
async function fetchMeshTerms(q: string): Promise<MeshTerm[]> {
  try {
    const res = await fetch(`/api/entities/suggest?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    const body = (await res.json()) as { terms?: unknown };
    // Validate element shape, not just that it's an array: a malformed term must never reach
    // mergeSuggestions (which runs outside the allSettled boundary and would otherwise discard drugs too).
    return Array.isArray(body.terms) ? body.terms.filter(isMeshTerm) : [];
  } catch {
    return [];
  }
}

/** The universal picker source: in-house drug catalog (brand→generic) MERGED with MeSH-resolved
 *  conditions/devices/procedures. The two sources run concurrently and independently — a failure of one
 *  never sinks the other (allSettled), so the drug catalog still suggests even if NCBI is down. */
export async function suggestEntities(q: string): Promise<EntitySuggestion[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  if (isPreviewMode) return demoSuggestions();
  const [drugsR, meshR] = await Promise.allSettled([searchEntities(query), fetchMeshTerms(query)]);
  const drugs = drugsR.status === "fulfilled" ? drugsR.value : [];
  const mesh = meshR.status === "fulfilled" ? meshR.value : [];
  return mergeSuggestions(drugs, mesh);
}

export async function fetchDrug(id: string): Promise<DrugOverview | null> {
  if (isPreviewMode) return demoDrug(id);
  const { data, error } = await supabase.rpc("get_drug", { p_id: id });
  if (error) throw new Error(`get_drug failed: ${error.message}`);
  return isObj(data) && typeof data.id === "string" ? data as unknown as DrugOverview : null;
}

export async function fetchDrugLabel(id: string): Promise<LabelDoc[]> {
  if (isPreviewMode) {
    return [{
      label_id: `preview-label-${id}`,
      source_id: "source-preview-label",
      provider: "openfda",
      citation_url: "https://www.accessdata.fda.gov/",
      extracted_sections: {
        indications: "Preview label: product-specific indications vary by brand and formulation.",
        warnings: "Preview label: warnings require clinician review and product-specific labeling.",
        adverse_reactions: "Preview label: gastrointestinal effects are commonly discussed in labeling.",
      },
    }];
  }
  const { data, error } = await supabase.rpc("get_drug_label", { p_id: id });
  if (error) throw new Error(`label failed: ${error.message}`);
  return rows(data, (r) => typeof r.label_id === "string"
    ? { ...r, extracted_sections: isObj(r.extracted_sections) ? r.extracted_sections : {} } as unknown as LabelDoc
    : null);
}

export async function fetchDrugTrials(id: string): Promise<DrugTrial[]> {
  if (isPreviewMode) {
    return [{
      trial_id: `preview-trial-${id}`,
      nct_id: "NCT-preview",
      brief_title: "Preview semaglutide outcomes study",
      phase: "Phase 4",
      status: "Recruiting",
      source_id: "source-preview-trial",
    }];
  }
  const { data, error } = await supabase.rpc("get_drug_trials", { p_id: id, p_phase: null, p_status: null, max_results: 12 });
  if (error) throw new Error(`trials failed: ${error.message}`);
  return rows(data, (r) => typeof r.trial_id === "string" ? r as unknown as DrugTrial : null);
}

export async function fetchDrugPubmed(id: string): Promise<DrugPubmed[]> {
  if (isPreviewMode) {
    return [{
      article_id: `preview-pubmed-${id}`,
      pmid: "PMID-preview",
      title: "Preview PubMed evidence summary for semaglutide",
      journal: "Preview Journal",
      publication_date: "2026-06-05",
      source_id: "source-preview-label",
    }];
  }
  const { data, error } = await supabase.rpc("get_drug_pubmed", { p_id: id, max_results: 12 });
  if (error) throw new Error(`pubmed failed: ${error.message}`);
  return rows(data, (r) => typeof r.article_id === "string" ? r as unknown as DrugPubmed : null);
}

export async function fetchSource(id: string): Promise<SourceDetail | null> {
  if (isPreviewMode) return demoSources.find((source) => source.source_id === id) ?? null;
  const { data, error } = await supabase.rpc("get_source", { p_id: id });
  if (error) throw new Error(`source failed: ${error.message}`);
  return isObj(data) && typeof data.source_id === "string" ? data as unknown as SourceDetail : null;
}

export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  if (isPreviewMode) return demoWatchlist;
  const { data, error } = await supabase
    .from("watchlist_items")
    .select("id,item_type,item_ref,alert_types,frequency,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`watchlist failed: ${error.message}`);
  return rows(data, (r) => typeof r.id === "string" ? r as unknown as WatchlistItem : null);
}

export async function followItem(itemType: WatchItemType, itemRef: string): Promise<void> {
  if (isPreviewMode) {
    if (demoWatchlist.some((item) => item.item_type === itemType && item.item_ref === itemRef)) return;
    const limit = Number(demoEntitlements.entitlements.watchlist_limit ?? 3);
    if (demoWatchlist.length >= limit) throw new Error("watchlist_limit_exceeded");
    demoWatchlist = [
      {
        id: `preview-watch-${Date.now().toString(36)}`,
        item_type: itemType,
        item_ref: itemRef,
        alert_types: ["pubmed_new", "trial_results"],
        frequency: "weekly",
        created_at: new Date().toISOString(),
      },
      ...demoWatchlist,
    ];
    return;
  }
  const { error } = await supabase.from("watchlist_items").insert({ item_type: itemType, item_ref: itemRef });
  if (error) throw new Error(error.message.includes("watchlist_limit_exceeded") ? "watchlist_limit_exceeded" : `follow failed: ${error.message}`);
}

export async function unfollowItem(id: string): Promise<void> {
  if (isPreviewMode) {
    demoWatchlist = demoWatchlist.filter((item) => item.id !== id);
    return;
  }
  const { error } = await supabase.from("watchlist_items").delete().eq("id", id);
  if (error) throw new Error(`unfollow failed: ${error.message}`);
}

export async function fetchWatchlistUpdates(): Promise<WatchlistUpdate[]> {
  if (isPreviewMode) {
    return [{
      id: "preview-update-semaglutide",
      item_type: "drug",
      item_ref: "semaglutide",
      // Preview only shows the signal types the real pipeline can actually emit (pubmed_new,
      // trial_results) — never label_update/trial_status, which are deferred change events.
      update_type: "pubmed_new",
      title: "New PubMed article bridged to semaglutide",
      summary: "A newly indexed open-access study on semaglutide was linked to your followed drug.",
      source_id: "source-preview-pubmed",
      source_url: "https://pubmed.ncbi.nlm.nih.gov/",
      importance_score: 0.72,
      detected_at: "2026-06-05T12:00:00Z",
    }];
  }
  const { data, error } = await supabase.rpc("get_watchlist_updates", { max_results: 100 });
  if (error) throw new Error(`updates failed: ${error.message}`);
  return rows(data, (r) => typeof r.id === "string" ? r as unknown as WatchlistUpdate : null);
}

export async function fetchLatestDigest(): Promise<Digest | null> {
  if (isPreviewMode) {
    return {
      id: "preview-digest",
      period_start: "2026-06-01",
      period_end: "2026-06-05",
      update_count: 1,
      generated_at: "2026-06-05T12:00:00Z",
      items: [{
        id: "preview-update-semaglutide",
        item_type: "drug",
        item_ref: "semaglutide",
        update_type: "pubmed_new",
        title: "New PubMed article bridged to semaglutide",
        summary: "A newly indexed open-access study on semaglutide was linked to your followed drug.",
        source_id: "source-preview-pubmed",
        source_url: "https://pubmed.ncbi.nlm.nih.gov/",
        importance_score: 0.72,
        detected_at: "2026-06-05T12:00:00Z",
        evidence_rank: 3,
      }],
    };
  }
  const { data, error } = await supabase
    .from("digests")
    .select("id,period_start,period_end,items,update_count,generated_at")
    .order("generated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`digest failed: ${error.message}`);
  const first = Array.isArray(data) ? data[0] : null;
  return isObj(first) && typeof first.id === "string" ? { ...first, items: Array.isArray(first.items) ? first.items : [] } as unknown as Digest : null;
}

export async function exportMyData(): Promise<Record<string, unknown>> {
  if (isPreviewMode) {
    return {
      exported_at: new Date().toISOString(),
      profile: { email: "preview@pharmaorb.app" },
      subscription: { plan: "free", status: "preview" },
      watchlist: demoWatchlist,
      usage: demoUsage,
    };
  }
  const { data, error } = await supabase.rpc("export_my_data");
  if (error) throw new Error(`export failed: ${error.message}`);
  return isObj(data) ? data : { exported_at: new Date().toISOString() };
}

export async function deleteMyAccount(): Promise<void> {
  if (isPreviewMode) throw new Error("Account deletion is disabled in preview mode.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to delete your account");

  const res = await fetch(`${supabaseUrl}/functions/v1/account-delete`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirm: true }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = isObj(body) && typeof body.error === "string" ? body.error : `delete failed (${res.status})`;
    throw new Error(message);
  }
}

// ── Conversations (saved chat history) ──────────────────────────────────────
// Direct, RLS-scoped table access (same pattern as watchlist_items): the policies on
// conversations / conversation_messages restrict every row to user_id = auth.uid(), so the
// authenticated browser client can only ever read/write the signed-in user's own chats.

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
  pinned: boolean;
}

/** A reconstructed deep-research card (persisted on completion) — links to the finished report. */
export interface SavedResearchCard {
  mode: ReportMode;
  savedReportId: string | null;
  title: string;
  citationCount: number;
}

function parseReportMode(value: unknown): ReportMode {
  return value === "structured_review" || value === "meta" || value === "lab_draft" || value === "discovery" || value === "standard"
    ? value
    : "standard";
}

/** One reconstructed turn: a cited chat answer, OR a deep-research card (when `research` is set). */
export interface SavedTurn {
  q: string;
  a: AskResponse | null;
  research?: SavedResearchCard;
}

/** The user's saved chats, newest first — drives the rail history. */
export async function fetchConversations(): Promise<ConversationSummary[]> {
  if (isPreviewMode) return [];
  const { data, error } = await supabase
    .from("conversations")
    .select("id,title,updated_at,pinned")
    .order("pinned", { ascending: false }) // pinned chats first…
    .order("updated_at", { ascending: false }) // …then most-recent
    .limit(50);
  if (error) throw new Error(`conversations failed: ${error.message}`);
  return rows(data, (r) =>
    typeof r.id === "string" && typeof r.title === "string"
      ? { id: r.id, title: r.title, updated_at: String(r.updated_at ?? ""), pinned: r.pinned === true }
      : null,
  );
}

/** Create a chat (title = first question, trimmed); returns its id. */
export async function createConversation(title: string): Promise<string | null> {
  if (isPreviewMode) return null;
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user.id;
  if (!userId) throw new Error("Sign in to save chats");
  const clean = title.trim().slice(0, 120) || "New chat";
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title: clean })
    .select("id")
    .single();
  if (error) throw new Error(`create chat failed: ${error.message}`);
  return isObj(data) && typeof data.id === "string" ? data.id : null;
}

/** Delete a chat and (via ON DELETE CASCADE) its messages. RLS scopes the delete to the owner. */
export async function deleteConversation(conversationId: string): Promise<void> {
  if (isPreviewMode) return;
  const { error } = await supabase.from("conversations").delete().eq("id", conversationId);
  if (error) throw new Error(`delete chat failed: ${error.message}`);
}

/** Rename a chat (title only; trimmed/capped). RLS scopes the update to the owner. No-op if blank. */
export async function renameConversation(conversationId: string, title: string): Promise<void> {
  if (isPreviewMode) return;
  const clean = title.trim().slice(0, 120);
  if (!clean) return;
  const { error } = await supabase.from("conversations").update({ title: clean }).eq("id", conversationId);
  if (error) throw new Error(`rename chat failed: ${error.message}`);
}

/** Pin / unpin a chat (sorts it to the top of the rail). RLS scopes the update to the owner. */
export async function pinConversation(conversationId: string, pinned: boolean): Promise<void> {
  if (isPreviewMode) return;
  const { error } = await supabase.from("conversations").update({ pinned }).eq("id", conversationId);
  if (error) throw new Error(`pin chat failed: ${error.message}`);
}

/** Persist one turn (question + cited answer) at the given ordinal base, and bump the chat's
 *  updated_at so it sorts to the top of the history. */
export async function saveTurn(conversationId: string, ordinalBase: number, question: string, answer: AskResponse): Promise<void> {
  if (isPreviewMode) return;
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user.id;
  if (!userId) return;
  const { error } = await supabase.from("conversation_messages").insert([
    // Both rows MUST carry the SAME keys: supabase-js sends the UNION of keys as PostgREST's `columns`
    // param, and a row missing a listed column is inserted as NULL — the column DEFAULT is NOT applied. So
    // omitting payload/citations on the user row made it violate their NOT NULL and 400'd the WHOLE insert,
    // silently losing every chat (conversation created, zero messages). Keep both rows' keys in sync.
    { conversation_id: conversationId, user_id: userId, role: "user", ordinal: ordinalBase, content: question, payload: {}, citations: [] },
    {
      conversation_id: conversationId,
      user_id: userId,
      role: "assistant",
      ordinal: ordinalBase + 1,
      content: answer.plain_english_summary ?? "",
      // NB: do NOT set answer_id here. It's a FK to generated_answers, and if the server's audit-trace
      // write was rejected (storeTrace doesn't check the HTTP status), that row won't exist — the FK
      // then fails and the WHOLE message insert is rejected, so the chat silently never persists and a
      // reopen shows nothing. The full answer is in `payload`; the chat doesn't need the FK link.
      payload: answer, // full structured answer → a reopened chat re-renders identically
      citations: answer.citations,
    },
  ]);
  if (error) throw new Error(`save chat failed: ${error.message}`);
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

/** Persist a completed deep-research turn (question + a research-run card pointing at the saved
 *  report) so a reopened chat re-renders the "Report ready" card. The card payload carries `kind:
 *  "research_run"` to distinguish it from a normal cited answer on load. */
export async function saveResearchTurn(conversationId: string, ordinalBase: number, question: string, card: SavedResearchCard): Promise<void> {
  if (isPreviewMode) return;
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user.id;
  if (!userId) return;
  const { error } = await supabase.from("conversation_messages").insert([
    // Keep both rows' keys in sync (see saveTurn): a key on one row but missing on the other inserts NULL
    // (default NOT applied) and 400s the whole insert. The assistant row sets payload, so the user row must.
    { conversation_id: conversationId, user_id: userId, role: "user", ordinal: ordinalBase, content: question, payload: {} },
    {
      conversation_id: conversationId,
      user_id: userId,
      role: "assistant",
      ordinal: ordinalBase + 1,
      content: `Report: ${card.title}`,
      payload: { kind: "research_run", mode: card.mode, saved_report_id: card.savedReportId, title: card.title, citation_count: card.citationCount },
    },
  ]);
  if (error) throw new Error(`save research turn failed: ${error.message}`);
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

/** Load a chat's turns, ordered, rehydrating the full cited answers from `payload`. */
export async function fetchConversationTurns(conversationId: string): Promise<SavedTurn[]> {
  if (isPreviewMode) return [];
  const { data, error } = await supabase
    .from("conversation_messages")
    .select("role,content,payload,ordinal")
    .eq("conversation_id", conversationId)
    .order("ordinal", { ascending: true });
  if (error) throw new Error(`load chat failed: ${error.message}`);
  const msgs = rows(data, (r) => r);
  const turns: SavedTurn[] = [];
  let pendingQ: string | null = null;
  for (const m of msgs) {
    if (m.role === "user") {
      pendingQ = typeof m.content === "string" ? m.content : "";
    } else if (m.role === "assistant") {
      const p = m.payload;
      if (isObj(p) && p.kind === "research_run") {
        turns.push({
          q: pendingQ ?? "",
          a: null,
          research: {
            mode: parseReportMode(p.mode),
            savedReportId: typeof p.saved_report_id === "string" ? p.saved_report_id : null,
            title: typeof p.title === "string" ? p.title : (pendingQ ?? ""),
            citationCount: typeof p.citation_count === "number" ? p.citation_count : 0,
          },
        });
      } else {
        turns.push({ q: pendingQ ?? "", a: isObj(p) ? (p as unknown as AskResponse) : null });
      }
      pendingQ = null;
    }
  }
  return turns;
}

// ── Deep Research (async, Pro-gated reports) ────────────────────────────────
// startResearch kicks off a background job (research edge function); the run row is then POLLED
// (no Realtime configured) for live progress, and the finished report is read from saved_reports —
// all via the RLS-scoped browser client (every row restricted to user_id = auth.uid()).

export type ResearchRunStatusValue = "queued" | "running" | "completed" | "failed";

/** Live view of an in-flight (or finished) deep-research run, for polling. */
export interface ResearchRunRow {
  id: string;
  status: ResearchRunStatusValue;
  question: string;
  progress: ResearchProgressStep[];
  saved_report_id: string | null;
  error: string | null;
}

/** A finished report listed in the rail history. */
export interface ResearchReportSummary {
  id: string;
  title: string;
  created_at: string;
  citation_count: number;
  /** Report sub-type for grouping: 'standard' | 'meta' | 'structured_review' | 'lab_draft' | 'discovery'. */
  mode: string;
}

/** Start a deep-research run. Returns the run id to poll. Throws AskQuotaError on the Pro gate /
 *  daily-limit 429 (deep_research_daily_limit is 0 for free/plus). */
export async function startResearch(question: string, mode: ReportMode = "standard"): Promise<string> {
  if (isPreviewMode) throw new Error("Deep research needs a live connection (not available in preview).");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to run deep research");

  const res = await fetch(`${supabaseUrl}/functions/v1/research`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question, mode }),
  });
  const body = await res.json().catch(() => null);
  if (res.status === 429 && isObj(body) && body.error === "quota_exceeded") {
    const err = new Error("quota_exceeded") as AskQuotaError;
    err.quota = body as unknown as QuotaExceededError;
    throw err;
  }
  if (!res.ok || !isObj(body) || typeof body.run_id !== "string") {
    throw new Error(isObj(body) && typeof body.error === "string" ? body.error : `research failed (${res.status})`);
  }
  return body.run_id;
}

/** Scope a deep-research question: returns clarifying questions ONLY when ambiguous. Best-effort —
 *  any failure (no session, non-OK, malformed) resolves to needs_clarification:false ("just run it"),
 *  so scoping can never block a run. Consumes no quota and starts no run. */
export async function scopeResearch(question: string): Promise<ScopeResult> {
  const none: ScopeResult = { needs_clarification: false, questions: [] };
  if (isPreviewMode) return none;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return none;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/research`, {
      method: "POST",
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ question, action: "scope" }),
    });
    if (!res.ok) return none;
    const body = await res.json().catch(() => null);
    if (!isObj(body) || typeof body.needs_clarification !== "boolean" || !Array.isArray(body.questions)) return none;
    return body as unknown as ScopeResult;
  } catch {
    return none;
  }
}

/** Poll one run row (RLS-scoped). Returns null if not found yet. */
export async function fetchResearchRun(runId: string): Promise<ResearchRunRow | null> {
  if (isPreviewMode) return null;
  const { data, error } = await supabase
    .from("research_report_runs")
    .select("id,status,question,progress,saved_report_id,error")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(`research run failed: ${error.message}`);
  if (!isObj(data) || typeof data.id !== "string") return null;
  return {
    id: data.id,
    status: (typeof data.status === "string" ? data.status : "running") as ResearchRunStatusValue,
    question: typeof data.question === "string" ? data.question : "",
    progress: Array.isArray(data.progress) ? (data.progress as unknown as ResearchProgressStep[]) : [],
    saved_report_id: typeof data.saved_report_id === "string" ? data.saved_report_id : null,
    error: typeof data.error === "string" ? data.error : null,
  };
}

/** Read a finished report's full body from saved_reports.payload. */
export async function fetchResearchReport(savedReportId: string): Promise<ResearchReport | null> {
  if (isPreviewMode) return null;
  const { data, error } = await supabase
    .from("saved_reports")
    .select("payload")
    .eq("id", savedReportId)
    .eq("kind", "deep_research") // only deep-research rows carry a ResearchReport payload
    .maybeSingle();
  if (error) throw new Error(`research report failed: ${error.message}`);
  return isObj(data) && isObj(data.payload) ? (data.payload as unknown as ResearchReport) : null;
}

/** The user's saved deep-research reports, newest first — drives the rail history. */
export async function fetchResearchReports(): Promise<ResearchReportSummary[]> {
  if (isPreviewMode) return [];
  const { data, error } = await supabase
    .from("saved_reports")
    .select("id,title,created_at,citation_count,mode")
    .eq("kind", "deep_research")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`research reports failed: ${error.message}`);
  return rows(data, (r) => (typeof r.id === "string" && typeof r.title === "string"
    ? ({
      id: r.id,
      title: r.title,
      created_at: typeof r.created_at === "string" ? r.created_at : "",
      citation_count: typeof r.citation_count === "number" ? r.citation_count : 0,
      mode: typeof r.mode === "string" ? r.mode : "standard",
    } as ResearchReportSummary)
    : null));
}

// ── Live monitoring (WS-D) — read-only fetches for the Monitoring section ────────────────────────
// These read the owner-scoped evidence_watches / watch_events tables directly (RLS). Until the
// monitoring migration is applied + the feature deployed (owner-gated), those tables don't exist:
// a "relation does not exist" (Postgres 42P01) is EXPECTED pre-deploy and degrades to empty so the
// pages show their normal empty states rather than a scary DB error. Any other error still surfaces.
export interface WatchSummary {
  id: string;
  title: string;
  cadence: string; // 'weekly' | 'daily'
  status: string; // 'active' | 'paused'
  last_checked_at: string | null;
  baselined_at: string | null;
}

function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // supabase-js talks to PostgREST, NOT Postgres directly, so a missing table surfaces as PGRST205
  // (schema-cache miss) — never Postgres 42P01. PGRST205 is the definitive pre-deploy signal; a broader
  // "does not exist" match would also wrongly swallow a post-deploy column/function error as "empty".
  return error.code === "PGRST205";
}

export async function fetchWatches(): Promise<WatchSummary[]> {
  if (isPreviewMode) return [];
  const { data, error } = await supabase
    .from("evidence_watches")
    .select("id,title,cadence,status,last_checked_at,baselined_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (isMissingRelation(error)) return []; // monitoring not deployed yet
    throw new Error(`watches failed: ${error.message}`);
  }
  return rows(data, (r) => (typeof r.id === "string" && typeof r.title === "string"
    ? ({
      id: r.id,
      title: r.title,
      cadence: typeof r.cadence === "string" ? r.cadence : "weekly",
      status: typeof r.status === "string" ? r.status : "active",
      last_checked_at: typeof r.last_checked_at === "string" ? r.last_checked_at : null,
      baselined_at: typeof r.baselined_at === "string" ? r.baselined_at : null,
    } as WatchSummary)
    : null));
}

// Preview-mode demo so the watch detail UI is viewable without a real backend (mirrors the
// searchEntities / demoDrug preview mocks). Timestamps are relative to now so the "last checked"
// label reads realistically; events stay empty (fetchWatchEvents) — the fresh-watch state where the
// "see the current evidence" view earns its keep.
function demoWatch(id: string): WatchSummary {
  const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
  return {
    id: id || "demo",
    title: "Semaglutide",
    cadence: "daily",
    status: "active",
    last_checked_at: iso(3 * 60 * 60 * 1000), // 3h ago
    baselined_at: iso(26 * 60 * 60 * 1000), // baselined ~1d ago
  };
}

export async function fetchWatch(id: string): Promise<WatchSummary | null> {
  if (isPreviewMode) return demoWatch(id);
  const { data, error } = await supabase
    .from("evidence_watches")
    .select("id,title,cadence,status,last_checked_at,baselined_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw new Error(`watch failed: ${error.message}`);
  }
  if (!data || typeof data.id !== "string") return null;
  return {
    id: data.id,
    title: typeof data.title === "string" ? data.title : "Watch",
    cadence: typeof data.cadence === "string" ? data.cadence : "weekly",
    status: typeof data.status === "string" ? data.status : "active",
    last_checked_at: typeof data.last_checked_at === "string" ? data.last_checked_at : null,
    baselined_at: typeof data.baselined_at === "string" ? data.baselined_at : null,
  };
}

export async function fetchWatchEvents(watchId: string): Promise<WatchEvent[]> {
  if (isPreviewMode) return [];
  const { data, error } = await supabase
    .from("watch_events")
    .select("id,channel,source_key,is_alert,alert_reason,title,url,provider,study_type,published_date,summary,detected_at,read_at")
    .eq("watch_id", watchId)
    .order("detected_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(`watch events failed: ${error.message}`);
  }
  return rows(data, (r) => (typeof r.id === "string"
    ? ({
      id: r.id,
      channel: r.channel === "news" ? "news" : "evidence",
      source_key: typeof r.source_key === "string" ? r.source_key : "",
      is_alert: r.is_alert === true,
      alert_reason: r.alert_reason === "new_high_tier_study" || r.alert_reason === "retraction" ? r.alert_reason : null,
      title: typeof r.title === "string" ? r.title : "",
      url: typeof r.url === "string" ? r.url : null,
      provider: typeof r.provider === "string" ? r.provider : null,
      study_type: typeof r.study_type === "string" ? r.study_type : null,
      published_date: typeof r.published_date === "string" ? r.published_date : null,
      summary: typeof r.summary === "string" ? r.summary : null,
      detected_at: typeof r.detected_at === "string" ? r.detected_at : "",
      read_at: typeof r.read_at === "string" ? r.read_at : null,
    } as WatchEvent)
    : null));
}

interface CreateWatchCommon {
  title: string;
  query_terms: string;
  mentions?: string[];
  include_news?: boolean;
  cadence?: "weekly" | "daily";
}
// A watch is either a typed TOPIC or a saved REPORT's question — they differ only in where the terms
// come from (the kind_ref CHECK in the migration requires topic for 'topic', saved_report_id for the other).
export type CreateWatchInput =
  | (CreateWatchCommon & { kind: "topic"; topic: string })
  | (CreateWatchCommon & { kind: "saved_question"; saved_report_id: string });

export type CreateWatchResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_enabled" | "limit" | "auth" | "unknown" };

/** Create a watch — a typed topic or a saved report's question (the "Watch this" affordances). user_id
 *  is set explicitly from the session and
 *  validated by the evidence_watches RLS WITH CHECK (auth.uid() = user_id), so a client can't insert
 *  for someone else. The per-plan limit is enforced by the enforce_watch_limit DB trigger, surfaced
 *  here as reason:"limit". Pre-deploy the table is absent (PGRST205) → reason:"not_enabled", so the
 *  button reports "monitoring isn't on yet" instead of crashing. */
export async function createWatch(input: CreateWatchInput): Promise<CreateWatchResult> {
  if (isPreviewMode) return { ok: false, reason: "not_enabled" };
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user?.id;
  if (!userId) return { ok: false, reason: "auth" };
  // Tier-gate the cadence: a free user can't create/persist a daily watch (the scheduler enforces which
  // watches are actually due; this is the client-side gate). Defensive read — a failed entitlement fetch
  // falls back to the free floor (weekly), never silently grants daily.
  const ent = watchEntitlement(await fetchEntitlements().catch(() => null));
  const cadence = resolveWatchCadence(input.cadence, ent.dailyEnabled);
  // One object shape (not a union) so supabase-js's excess-property check stays happy. Both topic and
  // saved_report_id are nullable; exactly one is set per kind, which satisfies the kind_ref CHECK.
  const row = {
    user_id: userId,
    kind: input.kind,
    title: input.title,
    query_terms: input.query_terms,
    mentions: input.mentions ?? [],
    include_news: input.include_news ?? true,
    cadence,
    topic: input.kind === "topic" ? input.topic : null,
    saved_report_id: input.kind === "saved_question" ? input.saved_report_id : null,
  };
  const { data, error } = await supabase
    .from("evidence_watches")
    .insert(row)
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return { ok: false, reason: "not_enabled" };
    if (/watch_limit_exceeded/i.test(error.message ?? "")) return { ok: false, reason: "limit" };
    return { ok: false, reason: "unknown" };
  }
  return data && typeof data.id === "string" ? { ok: true, id: data.id } : { ok: false, reason: "unknown" };
}

/** Delete a watch (cascades to its events + known-sources). RLS (ew_owner, FOR ALL) scopes to the owner. */
export async function deleteWatch(id: string): Promise<void> {
  if (isPreviewMode) return;
  const { error } = await supabase.from("evidence_watches").delete().eq("id", id);
  if (error) throw new Error(`delete watch failed: ${error.message}`);
}

/** Pause / resume a watch — the scheduler only checks 'active' watches. RLS scopes to the owner. */
export async function setWatchStatus(id: string, status: "active" | "paused"): Promise<void> {
  if (isPreviewMode) return;
  const { error } = await supabase.from("evidence_watches").update({ status }).eq("id", id);
  if (error) throw new Error(`update watch failed: ${error.message}`);
}

/** Download a saved report as .pdf/.docx/.pptx. Fetches the Node route WITH the user's bearer token
 *  (a plain <a download> can't set Authorization), then triggers a browser download of the blob. */
export async function downloadReportExport(
  reportId: string,
  format: "pdf" | "docx" | "pptx",
  style: "vancouver" | "ama",
): Promise<void> {
  if (isPreviewMode) throw new Error("Export needs a live connection (not available in preview).");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to export");

  const res = await fetch(`/api/reports/${reportId}/export/${format}?style=${style}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${reportId}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Projects (workspaces) — group a user's chats + reports + watches into one named space. Direct
//    PostgREST writes; RLS is the enforcement (projects is owner-scoped; the project_id columns inherit
//    each item table's existing owner policy). Pre-migration the table is absent (PGRST205) → empty.
export interface Project { id: string; name: string; description: string | null; created_at: string; }
export interface ProjectChat { id: string; title: string; }
export interface ProjectContents { chats: ProjectChat[]; reports: ResearchReportSummary[]; watches: WatchSummary[]; }
export type ProjectItemKind = "conversation" | "report" | "watch";

const PROJECT_ITEM_TABLE: Record<ProjectItemKind, string> = {
  conversation: "conversations",
  report: "saved_reports",
  watch: "evidence_watches",
};

function toReportSummary(r: Record<string, unknown>): ResearchReportSummary | null {
  return typeof r.id === "string" && typeof r.title === "string"
    ? {
      id: r.id,
      title: r.title,
      created_at: typeof r.created_at === "string" ? r.created_at : "",
      citation_count: typeof r.citation_count === "number" ? r.citation_count : 0,
      mode: typeof r.mode === "string" ? r.mode : "standard",
    } as ResearchReportSummary
    : null;
}
function toWatchSummaryRow(r: Record<string, unknown>): WatchSummary | null {
  return typeof r.id === "string" && typeof r.title === "string"
    ? {
      id: r.id,
      title: r.title,
      cadence: typeof r.cadence === "string" ? r.cadence : "weekly",
      status: typeof r.status === "string" ? r.status : "active",
      last_checked_at: typeof r.last_checked_at === "string" ? r.last_checked_at : null,
      baselined_at: typeof r.baselined_at === "string" ? r.baselined_at : null,
    } as WatchSummary
    : null;
}

export async function fetchProjects(): Promise<Project[]> {
  if (isPreviewMode) return [];
  const { data, error } = await supabase
    .from("projects").select("id,name,description,created_at").order("created_at", { ascending: false });
  if (error) { if (isMissingRelation(error)) return []; throw new Error(`projects failed: ${error.message}`); }
  return rows(data, (r) => (typeof r.id === "string" && typeof r.name === "string"
    ? ({ id: r.id, name: r.name, description: typeof r.description === "string" ? r.description : null, created_at: typeof r.created_at === "string" ? r.created_at : "" } as Project)
    : null));
}

export async function createProject(name: string): Promise<Project | null> {
  if (isPreviewMode) return null;
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("projects").insert({ user_id: userId, name: name.trim() }).select("id,name,description,created_at").maybeSingle();
  if (error || !data || typeof data.id !== "string") return null;
  return { id: data.id, name: data.name as string, description: (data.description as string) ?? null, created_at: (data.created_at as string) ?? "" };
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(`delete project failed: ${error.message}`);
}

/** A project's contents — the chats, reports, and watches assigned to it. */
export async function fetchProjectContents(projectId: string): Promise<ProjectContents> {
  const [c, r, w] = await Promise.all([
    supabase.from("conversations").select("id,title").eq("project_id", projectId).order("updated_at", { ascending: false }),
    supabase.from("saved_reports").select("id,title,created_at,citation_count,mode").eq("project_id", projectId).eq("kind", "deep_research").order("created_at", { ascending: false }),
    supabase.from("evidence_watches").select("id,title,cadence,status,last_checked_at,baselined_at").eq("project_id", projectId).order("created_at", { ascending: false }),
  ]);
  return {
    chats: rows(c.data, (x) => (typeof x.id === "string" ? ({ id: x.id, title: typeof x.title === "string" ? x.title : "Untitled" } as ProjectChat) : null)),
    reports: rows(r.data, toReportSummary),
    watches: rows(w.data, toWatchSummaryRow),
  };
}

/** The user's items NOT yet in any project — the pool the workspace "add" pickers draw from. */
export async function fetchUnassignedItems(): Promise<ProjectContents> {
  const [c, r, w] = await Promise.all([
    supabase.from("conversations").select("id,title").is("project_id", null).order("updated_at", { ascending: false }).limit(100),
    supabase.from("saved_reports").select("id,title,created_at,citation_count,mode").is("project_id", null).eq("kind", "deep_research").order("created_at", { ascending: false }).limit(100),
    supabase.from("evidence_watches").select("id,title,cadence,status,last_checked_at,baselined_at").is("project_id", null).order("created_at", { ascending: false }).limit(100),
  ]);
  return {
    chats: rows(c.data, (x) => (typeof x.id === "string" ? ({ id: x.id, title: typeof x.title === "string" ? x.title : "Untitled" } as ProjectChat) : null)),
    reports: rows(r.data, toReportSummary),
    watches: rows(w.data, toWatchSummaryRow),
  };
}

/** Assign an item to a project (or pass null to remove it). RLS scopes the update to the caller. */
export async function setItemProject(kind: ProjectItemKind, id: string, projectId: string | null): Promise<void> {
  const { error } = await supabase.from(PROJECT_ITEM_TABLE[kind]).update({ project_id: projectId }).eq("id", id);
  if (error) throw new Error(`assign to project failed: ${error.message}`);
}
