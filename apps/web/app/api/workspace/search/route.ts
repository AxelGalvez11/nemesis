import type { NextRequest } from "next/server";

import { supabaseUrl } from "@/lib/env";

const SEARCH_URL = `${supabaseUrl}/functions/v1/nemesis-search/v2/search`;

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer nmk_")) {
    return Response.json({ success: false, error: "A Nemesis device key is required." }, { status: 401 });
  }

  const body = await request.text();
  try {
    const upstream = await fetch(SEARCH_URL, {
      body,
      cache: "no-store",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(12_000),
    });
    return new Response(await upstream.text(), {
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
      status: upstream.status,
    });
  } catch {
    return Response.json({ success: false, error: "Web search is temporarily unavailable." }, { status: 502 });
  }
}
