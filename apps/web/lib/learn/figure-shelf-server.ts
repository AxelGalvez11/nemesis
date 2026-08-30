// The server's own door to the textbook shelf (§42, rung three's third provider).
//
// 🔴 ONE IMPLEMENTATION, TWO ROUTES. `/api/v1/figures/search` (the canvas asking by hand) and
// `/api/learn/reference-image` (a teaching turn resolving `figure` visuals) both need the same
// embed-then-match pass, and the first version of this code lived inline in the search route.
// Copied into the reference route it would have been two thresholds and two row-mappings drifting
// apart — a mismatched vector space "does not fail as an error, it fails as quietly bad results",
// as the search route's own header puts it. So the pass lives here and both routes call it.
//
// 🔴 SERVER ONLY. It reads the service-role key, which must never reach a client bundle. The
// browser's path to the shelf is `textbookFigures()` with its default search, which crosses an
// authenticated route rather than touching a key.
//
// EMBEDDING: delegated to `library-index/embed-query`, exactly as Library search does, so a
// question goes through the SAME `embedCoreTexts` path that produced the stored caption vectors.
// Never call an embedding provider directly from here — two clients drift.

import { createClient } from "@supabase/supabase-js";

import { serviceRoleKey, supabaseUrl } from "@/lib/env";
import type { FigureHit } from "./textbook-figures";

/** 🔴 HIGHER THAN LIBRARY SEARCH'S 0.35 BECAUSE A WRONG PICTURE IS WORSE THAN NO PICTURE. A weak
 *  text match returns a paragraph the learner can judge and dismiss; a weak figure match puts a
 *  diagram of the wrong thing on screen under a caption that sounds right. */
export const SHELF_MATCH_THRESHOLD = 0.45;

/** How long the embed hop gets. A slow embedding costs one picture, never the prose around it. */
const EMBED_TIMEOUT_MS = 8000;

async function embedConcept(concept: string): Promise<number[] | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  const res = await fetch(`${supabaseUrl}/functions/v1/library-index/embed-query`, {
    body: JSON.stringify({ query: concept }),
    headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { embedding?: unknown };
  return Array.isArray(json.embedding) ? (json.embedding as number[]) : null;
}

/**
 * Ask the shelf for figures about a concept.
 *
 * 🔴 null MEANS THE SHELF COULD NOT BE ASKED, [] MEANS IT ANSWERED "NOTHING". The search route
 * turns null into a 503 so a monitoring eye can tell an outage from an empty subject; a teaching
 * turn treats both as "no picture", which is the honest degradation either way. Never a throw.
 *
 * 🔴 THE RPC IS WHERE THE SERVING-HOST GATE LIVES (`figure_serving_host_gate` migration): a row
 * whose pixels sit on a third-party host the book's licence does not cover never comes back, so
 * similarity ranking fills the result with rows that can actually be shown.
 */
export async function searchShelf(concept: string, limit: number): Promise<FigureHit[] | null> {
  const trimmed = concept.trim();
  if (!trimmed) return [];
  if (!supabaseUrl || !serviceRoleKey) return null;

  let embedding: number[] | null = null;
  try {
    embedding = await embedConcept(trimmed);
  } catch {
    return null;
  }
  if (!embedding) return null;

  // The service role, because this runs on our server for published, licence-gated content that
  // is identical for every learner. The FUNCTION is security definer either way; what the key
  // buys is independence from any caller's session shape.
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await client.rpc("match_textbook_figures", {
    match_count: Math.min(Math.max(limit, 1), 12),
    match_threshold: SHELF_MATCH_THRESHOLD,
    query_embedding: embedding as unknown as string,
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
