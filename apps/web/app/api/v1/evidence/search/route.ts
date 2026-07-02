import { NextRequest, NextResponse } from "next/server";

import { searchEvidence } from "@/lib/evidence/search";
import { verifyBearer } from "@/lib/server";

export const runtime = "nodejs";

// HARDENING: this endpoint fans out to external paper APIs (PubMed + Europe PMC + OpenAlex, then up to
// ~50 Unpaywall lookups) per uncached query, so it must NOT be a public open door. Two guards:
//   1. Require a logged-in user (verifyBearer) — closes anonymous abuse. Nothing in the app auto-calls
//      this route, so adding auth breaks no existing flow.
//   2. A per-instance sliding-window rate cap that bounds the outbound fan-out under a token burst.
// Repeats are still absorbed by the CDN cache header on the response. (Per-USER limiting is a refinement.)
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 30; // searches per window per instance — a backstop, not the primary gate (auth is)
let hits: number[] = [];
function rateLimited(now: number): boolean {
  hits = hits.filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) return true;
  hits.push(now);
  return false;
}

function parseLimit(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(parsed, 50));
}

export async function GET(req: NextRequest) {
  // Require a signed-in user — the route reaches external APIs, so it is no longer public.
  const user = await verifyBearer(req);
  if (!user) {
    return NextResponse.json(
      { error: "unauthorized", message: "Sign in to use evidence search." },
      { status: 401 },
    );
  }

  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) {
    return NextResponse.json(
      { error: "missing_query", message: "Pass a query with ?q=..." },
      { status: 400 },
    );
  }

  if (query.length > 500) {
    return NextResponse.json(
      { error: "query_too_long", message: "Evidence search queries must be 500 characters or less." },
      { status: 400 },
    );
  }

  // Bound the outbound fan-out under abuse (CDN caching handles legitimate repeats).
  if (rateLimited(Date.now())) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many evidence searches right now — try again shortly." },
      { status: 429 },
    );
  }

  try {
    const response = await searchEvidence(query, {
      limit: parseLimit(req.nextUrl.searchParams.get("limit")),
    });

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Evidence search failed";
    return NextResponse.json(
      { error: "evidence_search_failed", message },
      { status: 500 },
    );
  }
}
