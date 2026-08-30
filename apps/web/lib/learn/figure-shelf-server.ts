// The server's own door to the textbook shelf (§42, rung three's third provider).
//
// 🔴 ONE IMPLEMENTATION, TWO ROUTES. `/api/v1/figures/search` (the canvas asking by hand) and
// `/api/learn/reference-image` (a teaching turn resolving `figure` visuals) both need the same
// embed-then-match pass, and the first version of this code lived inline in the search route.
// Copied into the reference route it would have been two thresholds and two row-mappings drifting
// apart — a mismatched vector space "does not fail as an error, it fails as quietly bad results",
// as the search route's own header puts it. So the pass lives here and both routes call it.
//
// 🔴🔴 NO PRIVILEGED KEY IS HELD HERE, AND THAT IS THE LESSON OF 2026-08-30. The first version
// called `library-index/embed-query` with `SUPABASE_SERVICE_ROLE_KEY`, the way Library search
// always had — and measured live, EVERY such call returns 403, because the Vercel env still
// carries a legacy JWT key the gateway stopped honouring when the project moved to sb_secret
// keys. Library search had been quietly 503ing behind its substring fallback the whole time. The
// embed hop now runs inside Postgres (`embed_teaching_query`, security definer, key from Vault),
// and this module calls it with the LEARNER'S OWN session token — the one credential the app is
// known to hold and keep fresh. Rotating the Vercel env would also have fixed it; removing the
// dependency fixes it and removes the class of failure.
//
// EMBEDDING: `embed_teaching_query` posts to the SAME `library-index/embed-query` the stored
// caption vectors came through. Never call an embedding provider directly from here — two clients
// drift, and a mismatched vector space fails as quietly bad results.

import { createClient } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import type { FigureHit } from "./textbook-figures";

/** 🔴 HIGHER THAN LIBRARY SEARCH'S 0.35 BECAUSE A WRONG PICTURE IS WORSE THAN NO PICTURE. A weak
 *  text match returns a paragraph the learner can judge and dismiss; a weak figure match puts a
 *  diagram of the wrong thing on screen under a caption that sounds right. */
export const SHELF_MATCH_THRESHOLD = 0.45;

/**
 * Ask the shelf for figures about a concept, as the signed-in caller.
 *
 * 🔴 null MEANS THE SHELF COULD NOT BE ASKED, [] MEANS IT ANSWERED "NOTHING". The search route
 * turns null into a 503 so a monitoring eye can tell an outage from an empty subject; a teaching
 * turn treats both as "no picture", which is the honest degradation either way. Never a throw.
 *
 * 🔴 THE RPC IS WHERE THE SERVING-HOST GATE LIVES (`figure_serving_host_gate` migration): a row
 * whose pixels sit on a third-party host the book's licence does not cover never comes back, so
 * similarity ranking fills the result with rows that can actually be shown.
 *
 * `authorization` is the caller's own header, verbatim ("Bearer <jwt>"). Both callers sit behind
 * `verifyBearer`, so it is present and valid by the time this runs.
 */
export async function searchShelf(
  concept: string,
  limit: number,
  authorization: string | null,
): Promise<FigureHit[] | null> {
  const trimmed = concept.trim();
  if (!trimmed) return [];
  if (!supabaseUrl || !supabaseAnonKey || !authorization) return null;

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });

  // PostgREST serialises a vector as its "[0.1,0.2,…]" text form, which the match RPC's own
  // parameter parsing accepts back verbatim — the embedding never needs to exist as numbers here.
  const embedded = await client.rpc("embed_teaching_query", { q: trimmed });
  if (embedded.error) return null;
  const embedding = embedded.data;
  if (typeof embedding !== "string" || !embedding.startsWith("[")) return null;

  const { data, error } = await client.rpc("match_textbook_figures", {
    match_count: Math.min(Math.max(limit, 1), 12),
    match_threshold: SHELF_MATCH_THRESHOLD,
    query_embedding: embedding,
  });
  if (error) return null;

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    alt: String(row.alt ?? ""),
    attribution: String(row.attribution ?? ""),
    bookTitle: String(row.book_title ?? ""),
    bookUrl: String(row.book_url ?? ""),
    caption: String(row.caption ?? ""),
    chapterTitle: String(row.chapter_title ?? ""),
    id: String(row.id ?? ""),
    imageUrl: String(row.image_url ?? ""),
    licence: String(row.licence ?? ""),
    similarity: Number(row.similarity ?? 0),
  }));
}
