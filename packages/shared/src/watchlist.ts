// Watchlist + digest shapes (§8). Mirrors the Phase-5 tables/RPCs — watchlist_items
// (0109), get_watchlist_updates + digests (0116) — so the app and backend share one
// set of names, like search.ts / evidence.ts. The item_ref invariant: a drug/class/
// trial/company follow stores the entity id (uuid as text); a keyword follow stores
// the keyword string. detect-updates emits `updates` on the SAME (item_type,item_ref)
// key, which is how get_watchlist_updates joins a follow to its updates.

/** updates.item_type / watchlist_items.item_type (0109 CHECK). */
export type WatchItemType = "drug" | "class" | "trial" | "company" | "keyword";

/** updates.update_type (0109 CHECK). */
export type UpdateType =
  | "pubmed_new"
  | "label_update"
  | "trial_status"
  | "trial_results"
  | "fda_safety"
  | "new_comparison";

/**
 * Digest cadence (watchlist_items.frequency CHECK). Phase 5 ships `weekly`;
 * `instant`/`daily` are documented carry-forward (need pg_cron + push delivery).
 */
export type WatchFrequency = "instant" | "daily" | "weekly";

/** A watchlist row (POST/GET /watchlist). */
export interface WatchlistItem {
  id: string;
  item_type: WatchItemType;
  item_ref: string;
  alert_types: string[];
  frequency: WatchFrequency;
  created_at: string | null;
}

/** A matched update (GET /watchlist/updates → get_watchlist_updates RPC, 0116). */
export interface WatchlistUpdate {
  id: string;
  item_type: WatchItemType;
  item_ref: string;
  update_type: UpdateType;
  title: string;
  summary: string | null;
  source_id: string | null;
  source_url: string | null;
  importance_score: number | null;
  detected_at: string;
}

/**
 * A ranked entry in a weekly digest snapshot (digests.items[], 0116). It is a
 * matched update plus the §9 evidence tier rank captured at generation time, so
 * the snapshot the user was sent stays reproducible as the corpus moves on.
 */
export interface DigestEntry extends WatchlistUpdate {
  evidence_rank: number; // -1 unknown … 4 very_strong
}

/** A per-user weekly digest (digests table, 0116). */
export interface Digest {
  id: string;
  period_start: string;
  period_end: string;
  items: DigestEntry[];
  update_count: number;
  generated_at: string;
}
