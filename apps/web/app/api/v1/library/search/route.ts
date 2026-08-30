import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

// Semantic Library search.
//
// EMBEDDING: delegated to the library-index edge function so questions go through
// the SAME embedCoreTexts path that produced the stored chunk vectors. Never call
// an embedding provider directly from here — two clients drift, and mismatched
// vector spaces fail as bad results, not as errors.
//
// SECURITY SHAPE: match_library_chunks is SECURITY INVOKER and is called through a
// Supabase client carrying the CALLER'S JWT, so RLS on library_chunks scopes the
// rows. This route never selects by user_id and cannot be tricked into a
// cross-account read. The service-role key is used ONLY to reach the embed
// endpoint — it is never used to query note content.
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const MATCH_THRESHOLD = 0.35; // tuned in Task 9 Step 2 against real notes

// 🔴 THE EMBEDDING COMES THROUGH THE DATABASE, NOT THROUGH A PRIVILEGED KEY. Measured live
// 2026-08-30: every direct `embed-query` call with SUPABASE_SERVICE_ROLE_KEY answers 403 — the
// Vercel env still holds a legacy JWT the gateway stopped honouring when the project moved to
// sb_secret keys, so this route had been quietly 503ing into its substring fallback.
// `embed_teaching_query` (security definer) holds the working key in Vault and is granted to
// authenticated callers only; the same client that runs the match runs the embed.
// It returns the vector's "[…]" text form, which the match RPCs accept back verbatim.
async function embedQuery(client: SupabaseClient, query: string): Promise<string | null> {
  const { data, error } = await client.rpc("embed_teaching_query", { q: query });
  if (error) return null;
  return typeof data === "string" && data.startsWith("[") ? data : null;
}

export async function POST(req: NextRequest) {
  const auth = await verifyBearer(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { query?: unknown; limit?: unknown };
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return NextResponse.json({ error: "empty query" }, { status: 400 });
  const limit = Math.min(Math.max(Number(body.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const scoped = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Any failure below returns 503, never 500: the caller degrades to substring
  // search, and an agent turn must not die because the index is unavailable.
  let embedding: string | null = null;
  try {
    embedding = await embedQuery(scoped, query);
  } catch {
    embedding = null;
  }
  if (!embedding) return NextResponse.json({ error: "semantic search unavailable" }, { status: 503 });

  // 🔴 SEARCHES THE ORIGINALS AND THE NOTES, PREFERRING THE ORIGINAL.
  // `match_library_chunks` filtered to `origin_type = 'note'` AND inner-joined
  // the notes table, so a stored, parsed lecture could never be a result — the
  // only way to find anything in it was through notes generated from it.
  const { data, error } = await scoped.rpc("match_document_chunks", {
    match_count: limit,
    match_threshold: MATCH_THRESHOLD,
    origin_filter: null,
    query_embedding: embedding,
  });
  if (error) {
    // A deployment whose database has not had the migration applied yet does not
    // lose search: it falls back to the notes-only function it has always had.
    // Silently returning nothing would look exactly like an empty library.
    console.warn("source-aware search unavailable, falling back to notes", error.message);
    const fallback = await scoped.rpc("match_library_chunks", {
      match_count: limit,
      match_threshold: MATCH_THRESHOLD,
      query_embedding: embedding,
    });
    if (fallback.error) return NextResponse.json({ error: "semantic search unavailable" }, { status: 503 });
    return NextResponse.json({ hits: fallback.data ?? [], sources: false });
  }

  return NextResponse.json({ hits: data ?? [], sources: true });
}
