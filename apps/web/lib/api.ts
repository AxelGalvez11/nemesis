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
import { supabaseAnonKey, supabaseUrl } from "./env";

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

export async function fetchEntitlements(): Promise<EntitlementSnapshot> {
  const { data, error } = await supabase.rpc("get_my_entitlements");
  if (error) throw new Error(`entitlements failed: ${error.message}`);
  return (isObj(data) ? data : { plan: "free", entitlements: {} }) as unknown as EntitlementSnapshot;
}

export async function fetchUsage(): Promise<UsageSnapshot> {
  const { data, error } = await supabase.rpc("get_my_usage");
  if (error) throw new Error(`usage failed: ${error.message}`);
  return (isObj(data) ? data : { plan: "free", counters: {} }) as unknown as UsageSnapshot;
}

export async function askQuestion(question: string): Promise<AskResponse> {
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
  const { data, error } = await supabase.rpc("search_entities", { q: query });
  if (error) throw new Error(`search failed: ${error.message}`);
  return rows(data, (r) => typeof r.id === "string" && typeof r.name === "string" ? r as unknown as SearchResult : null);
}

export async function fetchDrug(id: string): Promise<DrugOverview | null> {
  const { data, error } = await supabase.rpc("get_drug", { p_id: id });
  if (error) throw new Error(`get_drug failed: ${error.message}`);
  return isObj(data) && typeof data.id === "string" ? data as unknown as DrugOverview : null;
}

export async function fetchDrugLabel(id: string): Promise<LabelDoc[]> {
  const { data, error } = await supabase.rpc("get_drug_label", { p_id: id });
  if (error) throw new Error(`label failed: ${error.message}`);
  return rows(data, (r) => typeof r.label_id === "string"
    ? { ...r, extracted_sections: isObj(r.extracted_sections) ? r.extracted_sections : {} } as unknown as LabelDoc
    : null);
}

export async function fetchDrugTrials(id: string): Promise<DrugTrial[]> {
  const { data, error } = await supabase.rpc("get_drug_trials", { p_id: id, p_phase: null, p_status: null, max_results: 12 });
  if (error) throw new Error(`trials failed: ${error.message}`);
  return rows(data, (r) => typeof r.trial_id === "string" ? r as unknown as DrugTrial : null);
}

export async function fetchDrugPubmed(id: string): Promise<DrugPubmed[]> {
  const { data, error } = await supabase.rpc("get_drug_pubmed", { p_id: id, max_results: 12 });
  if (error) throw new Error(`pubmed failed: ${error.message}`);
  return rows(data, (r) => typeof r.article_id === "string" ? r as unknown as DrugPubmed : null);
}

export async function fetchSource(id: string): Promise<SourceDetail | null> {
  const { data, error } = await supabase.rpc("get_source", { p_id: id });
  if (error) throw new Error(`source failed: ${error.message}`);
  return isObj(data) && typeof data.source_id === "string" ? data as unknown as SourceDetail : null;
}

export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from("watchlist_items")
    .select("id,item_type,item_ref,alert_types,frequency,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`watchlist failed: ${error.message}`);
  return rows(data, (r) => typeof r.id === "string" ? r as unknown as WatchlistItem : null);
}

export async function followItem(itemType: WatchItemType, itemRef: string): Promise<void> {
  const { error } = await supabase.from("watchlist_items").insert({ item_type: itemType, item_ref: itemRef });
  if (error) throw new Error(error.message.includes("watchlist_limit_exceeded") ? "watchlist_limit_exceeded" : `follow failed: ${error.message}`);
}

export async function unfollowItem(id: string): Promise<void> {
  const { error } = await supabase.from("watchlist_items").delete().eq("id", id);
  if (error) throw new Error(`unfollow failed: ${error.message}`);
}

export async function fetchWatchlistUpdates(): Promise<WatchlistUpdate[]> {
  const { data, error } = await supabase.rpc("get_watchlist_updates", { max_results: 100 });
  if (error) throw new Error(`updates failed: ${error.message}`);
  return rows(data, (r) => typeof r.id === "string" ? r as unknown as WatchlistUpdate : null);
}

export async function fetchLatestDigest(): Promise<Digest | null> {
  const { data, error } = await supabase
    .from("digests")
    .select("id,period_start,period_end,items,update_count,generated_at")
    .order("generated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`digest failed: ${error.message}`);
  const first = Array.isArray(data) ? data[0] : null;
  return isObj(first) && typeof first.id === "string" ? { ...first, items: Array.isArray(first.items) ? first.items : [] } as unknown as Digest : null;
}
