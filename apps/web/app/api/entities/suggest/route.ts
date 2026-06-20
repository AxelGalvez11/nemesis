// GET /api/entities/suggest?q=… — the MeSH half of the universal picker (Slice A2). Returns ranked
// MeSH terms (conditions/devices/procedures + any drug PubMed indexes); the client merges these with
// the in-house drug catalog (searchEntities) so an NCBI failure never hides the drug results.
//
// Server-side so the NCBI key stays off the browser and there's no CORS to NCBI. Guards (the endpoint
// fans out to up to 3 NCBI calls per miss): q length-capped, a per-instance TTL cache so repeated
// keystrokes are free, and a per-instance rate cap that bounds NCBI fan-out under abuse. (Per-request
// auth is intentionally omitted — it would add a Supabase-auth roundtrip to every keystroke; gating is
// a documented hardening follow-up, and the blast radius here is NCBI throttling, not cost or data.)

import { fetchMeshSuggestions } from "@/lib/ncbi-suggest";
import type { MeshTerm } from "@/lib/mesh";

export const runtime = "nodejs";

const CACHE_TTL_MS = 5 * 60 * 1000;
const EMPTY_TTL_MS = 30 * 1000; // a no-match / transient-failure empty is cached only briefly so NCBI recovers fast
const CACHE_MAX = 300;
const RATE_WINDOW_MS = 1000;
// 3 misses/s × up to 3 NCBI calls = ≤9 NCBI req/s per instance — under the 10/s key budget SHARED with
// the live /ask PubMed path, so a typeahead burst can't 429 core retrieval.
const RATE_MAX_MISSES = 3;
const NCBI_DEADLINE_MS = 3500; // bound the whole espell→esearch→efetch chain so a hung NCBI never holds the function

const cache = new Map<string, { at: number; terms: MeshTerm[] }>();
let missTimestamps: number[] = [];

function rateLimited(now: number): boolean {
  missTimestamps = missTimestamps.filter((t) => now - t < RATE_WINDOW_MS);
  if (missTimestamps.length >= RATE_MAX_MISSES) return true;
  missTimestamps.push(now);
  return false;
}

export async function GET(req: Request): Promise<Response> {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 100) return Response.json({ terms: [] });

  const key = q.toLowerCase();
  const now = Date.now();
  const hit = cache.get(key);
  // Empty results expire fast (recover from a transient NCBI blip); real results get the full TTL.
  if (hit && now - hit.at < (hit.terms.length ? CACHE_TTL_MS : EMPTY_TTL_MS)) return Response.json({ terms: hit.terms });

  // Cache miss → would hit NCBI. Cap the fan-out; degrade to empty (drugs still come from the catalog).
  if (rateLimited(now)) return Response.json({ terms: [] });

  const terms = await fetchMeshSuggestions(q, { apiKey: process.env.NCBI_API_KEY, signal: AbortSignal.timeout(NCBI_DEADLINE_MS) });
  // Evict the oldest single entry (not a full wipe) so a full cache never causes a miss-stampede.
  if (cache.size >= CACHE_MAX) { const oldest = cache.keys().next().value; if (oldest !== undefined) cache.delete(oldest); }
  cache.set(key, { at: now, terms });
  return Response.json({ terms }, { headers: { "Cache-Control": `public, max-age=${terms.length ? 300 : 30}` } });
}
