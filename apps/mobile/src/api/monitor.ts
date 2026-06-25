import { supabase } from "./supabase";
import {
  type EntitlementSnapshot,
  resolveWatchCadence,
  type WatchEvent,
  watchEntitlement,
} from "@pharmabro/shared";

// Live Monitoring data layer (WS-D), ported from apps/web/lib/api.ts so mobile reads/writes the SAME
// evidence_watches / watch_events tables the web app uses. All calls go DIRECTLY to the tables via
// PostgREST; RLS is the enforcement (evidence_watches/watch_events are owner-scoped, watch_known_sources
// is service-role-only). supabase-js attaches the user JWT automatically. This REPLACES the legacy
// watchlist_items spine the mobile Follow button used to write (api/watchlist.ts).

export interface WatchSummary {
  id: string;
  title: string;
  cadence: string; // 'weekly' | 'daily'
  status: string; // 'active' | 'paused'
  last_checked_at: string | null;
  baselined_at: string | null;
}

// A missing table surfaces from PostgREST as PGRST205 (schema-cache miss), never Postgres 42P01. We
// treat it as "monitoring not deployed yet" and degrade to empty instead of throwing — harmless safety
// (the tables ARE live in prod) that keeps an older client from crashing if it ever points pre-deploy.
function isMissingRelation(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205";
}

/** The caller's watches, newest first. */
export async function fetchWatches(): Promise<WatchSummary[]> {
  const { data, error } = await supabase
    .from("evidence_watches")
    .select("id,title,cadence,status,last_checked_at,baselined_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(`watches failed: ${error.message}`);
  }
  return (data ?? []).map(toWatchSummary).filter((w): w is WatchSummary => w !== null);
}

/** A single watch by id (owner-scoped by RLS), or null. */
export async function fetchWatch(id: string): Promise<WatchSummary | null> {
  const { data, error } = await supabase
    .from("evidence_watches")
    .select("id,title,cadence,status,last_checked_at,baselined_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return null;
    throw new Error(`watch failed: ${error.message}`);
  }
  return toWatchSummary(data);
}

/** A watch's events (the Alerts / What's-new / In-the-news feed), newest first. */
export async function fetchWatchEvents(watchId: string): Promise<WatchEvent[]> {
  const { data, error } = await supabase
    .from("watch_events")
    .select(
      "id,channel,source_key,is_alert,alert_reason,title,url,provider,study_type,published_date,summary,detected_at,read_at",
    )
    .eq("watch_id", watchId)
    .order("detected_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw new Error(`watch events failed: ${error.message}`);
  }
  return (data ?? []).map(toWatchEvent).filter((e): e is WatchEvent => e !== null);
}

interface CreateWatchCommon {
  title: string;
  query_terms: string;
  mentions?: string[];
  include_news?: boolean;
  cadence?: "weekly" | "daily";
}
export type CreateWatchInput =
  | (CreateWatchCommon & { kind: "topic"; topic: string })
  | (CreateWatchCommon & { kind: "saved_question"; saved_report_id: string });

export type CreateWatchResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_enabled" | "limit" | "auth" | "unknown" };

/** Create a watch (the "Watch this" affordance). user_id is set from the session and validated by the
 *  evidence_watches RLS WITH CHECK, so a client can't insert for someone else. The per-plan limit is
 *  enforced by the enforce_watch_limit DB trigger, surfaced here as reason:"limit". The cadence is
 *  tier-gated client-side (free can't persist a daily watch); the scheduler is the real enforcement. */
export async function createWatch(input: CreateWatchInput): Promise<CreateWatchResult> {
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess.session?.user?.id;
  if (!userId) return { ok: false, reason: "auth" };
  const ent = watchEntitlement(await fetchEntitlements().catch(() => null));
  const cadence = resolveWatchCadence(input.cadence, ent.dailyEnabled);
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

/** Delete a watch (cascades to its events + known-sources). RLS scopes to the owner. */
export async function deleteWatch(id: string): Promise<void> {
  const { error } = await supabase.from("evidence_watches").delete().eq("id", id);
  if (error) throw new Error(`delete watch failed: ${error.message}`);
}

/** Pause / resume a watch — the scheduler only checks 'active' watches. RLS scopes to the owner. */
export async function setWatchStatus(id: string, status: "active" | "paused"): Promise<void> {
  const { error } = await supabase.from("evidence_watches").update({ status }).eq("id", id);
  if (error) throw new Error(`update watch failed: ${error.message}`);
}

/** Mark a watch's unread events as read (clears the unread-alert badge). Owner-scoped by RLS; the
 *  watch_events UPDATE policy allows the owner to set read_at. Best-effort: a failure is non-fatal. */
export async function markWatchRead(watchId: string): Promise<void> {
  const { error } = await supabase
    .from("watch_events")
    .update({ read_at: new Date().toISOString() })
    .eq("watch_id", watchId)
    .is("read_at", null);
  if (error && !isMissingRelation(error)) throw new Error(`mark read failed: ${error.message}`);
}

/** The caller's plan + entitlements (get_my_entitlements, auth.uid()-scoped). Falls back to the free
 *  floor on any failure so the cadence gate never accidentally grants more than free. */
export async function fetchEntitlements(): Promise<EntitlementSnapshot> {
  const { data, error } = await supabase.rpc("get_my_entitlements");
  if (error) throw new Error(`entitlements failed: ${error.message}`);
  const obj = data && typeof data === "object" && !Array.isArray(data) ? (data as EntitlementSnapshot) : null;
  return obj ?? { plan: "free", entitlements: {} };
}

// ── row mappers (defensive: a malformed row maps to null and is filtered out) ──────────────────────
function toWatchSummary(r: Record<string, unknown> | null): WatchSummary | null {
  if (!r || typeof r.id !== "string" || typeof r.title !== "string") return null;
  return {
    id: r.id,
    title: r.title,
    cadence: typeof r.cadence === "string" ? r.cadence : "weekly",
    status: typeof r.status === "string" ? r.status : "active",
    last_checked_at: typeof r.last_checked_at === "string" ? r.last_checked_at : null,
    baselined_at: typeof r.baselined_at === "string" ? r.baselined_at : null,
  };
}

function toWatchEvent(r: Record<string, unknown>): WatchEvent | null {
  if (typeof r.id !== "string") return null;
  return {
    id: r.id,
    channel: r.channel === "news" ? "news" : "evidence",
    source_key: typeof r.source_key === "string" ? r.source_key : "",
    is_alert: r.is_alert === true,
    alert_reason:
      r.alert_reason === "new_high_tier_study" || r.alert_reason === "retraction" ? r.alert_reason : null,
    title: typeof r.title === "string" ? r.title : "",
    url: typeof r.url === "string" ? r.url : null,
    provider: typeof r.provider === "string" ? r.provider : null,
    study_type: typeof r.study_type === "string" ? r.study_type : null,
    published_date: typeof r.published_date === "string" ? r.published_date : null,
    summary: typeof r.summary === "string" ? r.summary : null,
    detected_at: typeof r.detected_at === "string" ? r.detected_at : "",
    read_at: typeof r.read_at === "string" ? r.read_at : null,
  };
}

/** "3h ago" / "2d ago" — a tiny relative-time label for "last checked". Deterministic enough for UI. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "not yet";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
