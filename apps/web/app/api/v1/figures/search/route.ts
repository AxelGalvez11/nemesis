import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { supabaseAnonKey, supabaseUrl, serviceRoleKey } from "@/lib/env";
import { verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

// Find a real textbook figure for a concept.
//
// 🔴🔴 THIS ROUTE IS THE DOOR THE LAST CORPUS NEVER HAD. `core_sources` was built, licence-gated,
// embedded and filled, and then archived unread because nothing in the product ever asked it a
// question: measured 2026-08-21, 36 calls in 24 hours and zero successes. The shelf and its reader
// ship together for that reason, and this file is the reader.
//
// 🔴 UNVERIFIED FROM THIS CHECKOUT, AND SAYING SO IS THE POINT. The `library-index` function is
// deployed but its SOURCE IS NOT IN THIS REPOSITORY, so the `/embed-query` sub-path could not be
// read or called from here: it answers 403 to an invalid key BEFORE it routes, which makes a real
// path and a typo indistinguishable from outside. The Library search route calls the identical url
// and ships, which is good evidence and is not proof. The first run against a real session is the
// check. The failure is safe either way: a bad path returns no embedding, which is a 503 and an
// empty shelf, never a broken teaching turn.
//
// EMBEDDING: delegated to `library-index/embed-query`, exactly as the Library search route does,
// so a question goes through the SAME `embedCoreTexts` path that produced the stored caption
// vectors. Never call an embedding provider directly from here. Two clients drift, and a mismatched
// vector space does not fail as an error — it fails as quietly bad results, which is worse.
//
// SECURITY SHAPE, and it differs from Library search on purpose. `textbook_figures` holds published,
// openly licensed work that is identical for every learner, so its RLS policy is a plain
// `select … using (true)` for authenticated users and there is no per-user scoping to enforce. The
// caller is still required to be signed in: this is a paid product's shelf, not an open API.
const DEFAULT_LIMIT = 4;
const MAX_LIMIT = 12;

/** 🔴 HIGHER THAN LIBRARY SEARCH'S 0.35 BECAUSE A WRONG PICTURE IS WORSE THAN NO PICTURE. A weak
 *  text match returns a paragraph the learner can judge and dismiss; a weak figure match puts a
 *  diagram of the wrong thing on screen under a caption that sounds right. §42's whole argument is
 *  that no picture beats a misleading one, so this errs toward returning nothing. */
const MATCH_THRESHOLD = 0.45;

export interface FigureHit {
  id: string;
  imageUrl: string;
  caption: string;
  alt: string;
  bookTitle: string;
  bookUrl: string;
  /** Rendered under the image, verbatim. CC BY requires it wherever the picture appears. */
  attribution: string;
  licence: string;
  chapterTitle: string;
  similarity: number;
}

async function embedQuery(query: string): Promise<number[] | null> {
  if (!supabaseUrl || !serviceRoleKey) return null;
  const res = await fetch(`${supabaseUrl}/functions/v1/library-index/embed-query`, {
    body: JSON.stringify({ query }),
    headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    method: "POST",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { embedding?: unknown };
  return Array.isArray(json.embedding) ? (json.embedding as number[]) : null;
}

export async function POST(req: NextRequest) {
  const auth = await verifyBearer(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { concept?: unknown; limit?: unknown };
  const concept = typeof body.concept === "string" ? body.concept.trim() : "";
  if (!concept) return NextResponse.json({ error: "empty concept" }, { status: 400 });
  const limit = Math.min(Math.max(Number(body.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  // 🔴 EVERY FAILURE IS A 503 AND AN EMPTY SHELF, NEVER A 500. A canvas asking for a picture must
  // degrade to "no trustworthy figure exists" — which the ladder already renders honestly — rather
  // than taking a teaching turn down with it.
  let embedding: number[] | null = null;
  try {
    embedding = await embedQuery(concept);
  } catch {
    embedding = null;
  }
  if (!embedding) return NextResponse.json({ error: "figure search unavailable", figures: [] }, { status: 503 });

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: req.headers.get("authorization") ?? "" } },
  });

  const { data, error } = await client.rpc("match_textbook_figures", {
    match_count: limit,
    match_threshold: MATCH_THRESHOLD,
    query_embedding: embedding as unknown as string,
  });

  if (error) {
    return NextResponse.json({ error: "figure search unavailable", figures: [] }, { status: 503 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const figures: FigureHit[] = rows.map((row) => ({
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

  return NextResponse.json({ figures });
}
