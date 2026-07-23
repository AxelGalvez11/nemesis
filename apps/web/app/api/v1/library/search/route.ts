import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl, serviceRoleKey } from "@/lib/env";
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

async function embedQuery(query: string): Promise<number[] | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  const res = await fetch(`${supabaseUrl}/functions/v1/library-index/embed-query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { embedding?: unknown };
  return Array.isArray(json.embedding) ? (json.embedding as number[]) : null;
}

export async function POST(req: NextRequest) {
  const auth = await verifyBearer(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { query?: unknown; limit?: unknown };
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return NextResponse.json({ error: "empty query" }, { status: 400 });
  const limit = Math.min(Math.max(Number(body.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  // Any failure below returns 503, never 500: the caller degrades to substring
  // search, and an agent turn must not die because the index is unavailable.
  let embedding: number[] | null = null;
  try {
    embedding = await embedQuery(query);
  } catch {
    embedding = null;
  }
  if (!embedding) return NextResponse.json({ error: "semantic search unavailable" }, { status: 503 });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const scoped = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await scoped.rpc("match_library_chunks", {
    query_embedding: embedding,
    match_count: limit,
    match_threshold: MATCH_THRESHOLD,
  });
  if (error) return NextResponse.json({ error: "semantic search unavailable" }, { status: 503 });

  return NextResponse.json({ hits: data ?? [] });
}
