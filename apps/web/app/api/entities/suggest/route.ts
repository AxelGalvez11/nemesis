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
const CACHE_MAX = 300;
const RATE_WINDOW_MS = 1000;
const RATE_MAX_MISSES = 8; // bound NCBI-hitting requests per instance per second

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
  if (hit && now - hit.at < CACHE_TTL_MS) return Response.json({ terms: hit.terms });

  // Cache miss → would hit NCBI. Cap the fan-out; degrade to empty (drugs still come from the catalog).
  if (rateLimited(now)) return Response.json({ terms: [] });

  const terms = await fetchMeshSuggestions(q, { apiKey: process.env.NCBI_API_KEY });
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: now, terms });
  return Response.json({ terms }, { headers: { "Cache-Control": "public, max-age=300" } });
}
