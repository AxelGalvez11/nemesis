import { NextRequest, NextResponse } from "next/server";

import { searchEvidence } from "@/lib/evidence/search";

export const runtime = "nodejs";

function parseLimit(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(parsed, 50));
}

export async function GET(req: NextRequest) {
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
