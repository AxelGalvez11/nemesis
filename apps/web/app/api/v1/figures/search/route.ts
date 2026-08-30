import { NextRequest, NextResponse } from "next/server";

import { searchShelf } from "@/lib/learn/figure-shelf-server";
import type { FigureHit } from "@/lib/learn/textbook-figures";
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

export type { FigureHit };

export async function POST(req: NextRequest) {
  const auth = await verifyBearer(req);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { concept?: unknown; limit?: unknown };
  const concept = typeof body.concept === "string" ? body.concept.trim() : "";
  if (!concept) return NextResponse.json({ error: "empty concept" }, { status: 400 });
  const limit = Math.min(Math.max(Number(body.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  // 🔴 EVERY FAILURE IS A 503 AND AN EMPTY SHELF, NEVER A 500. A canvas asking for a picture must
  // degrade to "no trustworthy figure exists" — which the ladder already renders honestly — rather
  // than taking a teaching turn down with it. The embed-then-match pass lives in
  // `figure-shelf-server.ts`, shared with the reference-image route so two thresholds and two row
  // mappings cannot drift apart; null from it means the shelf could not be asked, which is the 503.
  const figures = await searchShelf(concept, limit);
  if (figures === null) {
    return NextResponse.json({ error: "figure search unavailable", figures: [] }, { status: 503 });
  }

  return NextResponse.json({ figures });
}
