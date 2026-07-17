import { supabase } from "./supabase";
import { castSearchResults } from "./cast";
import type { SearchResult } from "@nemesis/shared";

/**
 * GET /search?q= (search_entities) — unions canonical_name + brand aliases via
 * trigram + FTS (AC1). Authenticated-only. A blank query short-circuits to [] so the
 * Explore screen renders its idle/empty state without a wasted round-trip.
 */
export async function searchEntities(q: string): Promise<SearchResult[]> {
  const query = q.trim();
  if (!query) return [];
  const { data, error } = await supabase.rpc("search_entities", { q: query });
  if (error) throw new Error(`search failed: ${error.message}`);
  return castSearchResults(data);
}
