// Semantic Library search from the phone.
//
// The index this reads is the one the web app has been filling all along: the
// library-index edge function embeds every note with Voyage (1024-dim) every two
// minutes, and public.match_library_chunks does the nearest-neighbour lookup. Both
// already work for notes created on THIS device — the phone writes to the same
// readable_library_documents table, so the indexer picks its notes up like any
// other. What was missing was a way to READ that index from here.
//
// WHY IT GOES THROUGH THE WEB APP. The lookup needs two things: an embedding of
// the question, and the ANN query. Only the second can be done from a client —
// match_library_chunks is SECURITY INVOKER and granted to `authenticated`, so a
// phone with the student's JWT could call it directly. The embedding cannot: it
// runs through library-index/embed-query, which is gated on the service-role key
// and must stay that way. /api/v1/library/search does both behind one
// JWT-authenticated call, which is exactly this shape, so it is reused rather
// than duplicated. Sending the question to two different embedders would be worse
// than slower — a Voyage query vector and any other 1024-dim vector are not
// comparable, and the mismatch shows up as bad results, never as an error.
//
// WHY THE HOST IS A LITERAL. EXPO_PUBLIC_* values are inlined at build time, so a
// new one means a new binary — and app.json is part of the runtime fingerprint,
// so editing it orphans the OTA update (memory: nemesis-ios-testflight-ship-ops).
// A constant in a .ts file is plain JavaScript and ships over the air. This is the
// same origin apps/web/lib/env.ts already hardcodes as its own default.
import { supabase } from "./supabase";

import type { LibraryHit } from "@/lib/library-context";

const WEB_BASE = "https://app.enternemesis.com";
const SEARCH_URL = `${WEB_BASE}/api/v1/library/search`;

/** Enough to survive the per-note cap in selectHits() and still fill a prompt. */
const DEFAULT_LIMIT = 12;
/** A chat turn should not stall on this. The answer is worth waiting a moment for,
 *  a hung network is not — on timeout the turn proceeds without the notes. */
const TIMEOUT_MS = 6_000;

function toHit(raw: unknown): LibraryHit | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const path = typeof row.path === "string" ? row.path : "";
  const content = typeof row.content === "string" ? row.content : "";
  if (!path || !content.trim()) return null;
  return {
    chunk_index: typeof row.chunk_index === "number" ? row.chunk_index : 0,
    content,
    path,
    similarity: typeof row.similarity === "number" ? row.similarity : 0,
    title: typeof row.title === "string" ? row.title : "",
  };
}

/**
 * Passages from the student's own notes that match `query` by meaning.
 *
 * Never throws and never rejects: a signed-out session, an unreachable app, a 503
 * because the embedder is down, or a malformed row all come back as an empty list.
 * Every caller treats "no notes" as a normal outcome — the chat turn answers
 * without them and the Library screen falls back to its own text filter — so an
 * exception here would only turn a degraded feature into a broken screen.
 */
export async function searchLibrarySemantic(
  query: string,
  limit: number = DEFAULT_LIMIT,
): Promise<LibraryHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(SEARCH_URL, {
      body: JSON.stringify({ limit, query: trimmed }),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { hits?: unknown };
    if (!Array.isArray(body.hits)) return [];
    return body.hits.flatMap((row) => {
      const hit = toHit(row);
      return hit ? [hit] : [];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
