"use client";

import type {
  AskResponse,
  Digest,
  DrugOverview,
  EntitlementSnapshot,
  QuotaExceededError,
  SearchResult,
  SourceDetail,
  UsageSnapshot,
  WatchlistItem,
  WatchlistUpdate,
  WatchItemType,
} from "@pharmabro/shared";
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

export async function askQuestion(question: string): Promise<AskResponse> {
  if (isPreviewMode) {
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
    body: JSON.stringify({ question, use_health_context: false }),
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
}

/** One reconstructed turn: the question + its cited answer (null if it errored when saved). */
export interface SavedTurn {
  q: string;
  a: AskResponse | null;
}

/** The user's saved chats, newest first — drives the rail history. */
export async function fetchConversations(): Promise<ConversationSummary[]> {
  if (isPreviewMode) return [];
  const { data, error } = await supabase
    .from("conversations")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`conversations failed: ${error.message}`);
  return rows(data, (r) => (typeof r.id === "string" && typeof r.title === "string" ? (r as unknown as ConversationSummary) : null));
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

/** Persist one turn (question + cited answer) at the given ordinal base, and bump the chat's
 *  updated_at so it sorts to the top of the history. */
export async function saveTurn(conversationId: string, ordinalBase: number, question: string, answer: AskResponse): Promise<void> {
  if (isPreviewMode) return;
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user.id;
  if (!userId) return;
  const { error } = await supabase.from("conversation_messages").insert([
    { conversation_id: conversationId, user_id: userId, role: "user", ordinal: ordinalBase, content: question },
    {
      conversation_id: conversationId,
      user_id: userId,
      role: "assistant",
      ordinal: ordinalBase + 1,
      content: answer.plain_english_summary ?? "",
      answer_id: answer.answer_id,
      payload: answer, // full structured answer → a reopened chat re-renders identically
      citations: answer.citations,
    },
  ]);
  if (error) throw new Error(`save chat failed: ${error.message}`);
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
      turns.push({ q: pendingQ ?? "", a: isObj(m.payload) ? (m.payload as unknown as AskResponse) : null });
      pendingQ = null;
    }
  }
  return turns;
}
