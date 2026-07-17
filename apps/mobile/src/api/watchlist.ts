import { supabase } from "./supabase";
import { castWatchlistItems, castWatchlistUpdates, toDigest } from "./cast";
import type { Digest, WatchItemType, WatchlistItem, WatchlistUpdate } from "@nemesis/shared";

// Watchlist write-path + reads (§8/§10). These hit the tables DIRECTLY via PostgREST
// (not a SECURITY DEFINER RPC), so RLS is the enforcement: watchlist_items is
// owner-only (user_id = auth.uid(), default auth.uid()), digests is owner-read,
// get_watchlist_updates is auth.uid()-scoped. The authenticated role holds the table
// GRANTs (Phase-5 verified), so the signed-in app reads/writes its own rows with no
// backend change. supabase-js attaches the user JWT automatically.

/** GET /watchlist — the caller's follows, newest first. */
export async function fetchWatchlist(): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from("watchlist_items")
    .select("id,item_type,item_ref,alert_types,frequency,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`watchlist read failed: ${error.message}`);
  return castWatchlistItems(data);
}

/** POST /watchlist — follow an item. user_id defaults to auth.uid() (RLS WITH CHECK). */
export async function followItem(itemType: WatchItemType, itemRef: string): Promise<void> {
  const { error } = await supabase.from("watchlist_items").insert({ item_type: itemType, item_ref: itemRef });
  if (error) throw new Error(`follow failed: ${error.message}`);
}

/** DELETE /watchlist/{id} — unfollow. RLS scopes the delete to the caller's own row. */
export async function unfollowItem(id: string): Promise<void> {
  const { error } = await supabase.from("watchlist_items").delete().eq("id", id);
  if (error) throw new Error(`unfollow failed: ${error.message}`);
}

/** GET /watchlist/updates — the live "what's new for things you follow" feed. */
export async function fetchWatchlistUpdates(): Promise<WatchlistUpdate[]> {
  const { data, error } = await supabase.rpc("get_watchlist_updates", { max_results: 100 });
  if (error) throw new Error(`watchlist updates failed: ${error.message}`);
  return castWatchlistUpdates(data);
}

/** The latest weekly digest snapshot for the caller (owner-read), or null if none yet. */
export async function fetchLatestDigest(): Promise<Digest | null> {
  const { data, error } = await supabase
    .from("digests")
    .select("id,period_start,period_end,items,update_count,generated_at")
    .order("generated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`digest read failed: ${error.message}`);
  return toDigest(Array.isArray(data) ? data[0] : null);
}
