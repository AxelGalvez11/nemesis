import type { NextRequest } from "next/server";

import { supabaseUrl } from "@/lib/env";

// ── the scholarly lane: seven literature indexes, behind the same door as everything else ─────
//
// Owner 2026-08-24: *"Plug the literature seven."* This proxies to the `nemesis-literature` edge
// function, which fans out across OpenAlex, Crossref, Semantic Scholar, Europe PMC, PubMed, arXiv
// and bioRxiv and merges what answers.
//
// 🔴 THAT FUNCTION IMPORTS THE SEVEN AND NOTHING ELSE. It began as an action inside
// `science-search`, which pulls in the whole 42-connector registry and keeps the other 35 dark
// behind a runtime flag. Not deploying them at all is the stronger guarantee: the code for those
// egress paths is not present in the deployed function, so no future edit to a gate can expose
// them. `science-search` is untouched and stays undeployed.
//
// 🔴 A PROXY RATHER THAN A DIRECT CALL FROM THE BROWSER, for the same reason /api/workspace/search
// is one: the function's CORS allow-list names the production origin, so a direct call works in
// production and fails on every preview and local port. Going through our own origin means there
// is no allow-list to keep in step with wherever the app happens to be running.
//
// 🔴 NO UNIT IS SPENT HERE, AND THAT IS A FACT ABOUT THE UPSTREAMS, NOT A GENEROSITY. All seven
// are public, key-free APIs. The metered path (/api/workspace/search → Brave → Tavily → …) bills
// because those providers bill us; these do not, so putting them on the same meter would charge a
// student for something that cost nothing.

const LITERATURE_URL = `${supabaseUrl}/functions/v1/nemesis-literature`;

export async function POST(request: NextRequest) {
  // The learner's own Supabase session, which is what science-search verifies. Unlike the search
  // proxy next door this is not a device key: the two functions were written against different
  // identities, and inventing a third here would be worse than carrying both.
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return Response.json({ error: "Sign in to search the literature." }, { status: 401 });
  }

  const body = await request.text();
  try {
    const upstream = await fetch(LITERATURE_URL, {
      body,
      cache: "no-store",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      method: "POST",
      // Longer than the search proxy's 12s: this fans out to seven indexes, and the function
      // already bounds each one at 8s, so the ceiling that matters is the slowest single index
      // plus the merge — not the sum.
      signal: AbortSignal.timeout(15_000),
    });
    return new Response(await upstream.text(), {
      headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
      status: upstream.status,
    });
  } catch {
    // 🔴 A SHAPE THE CALLER CAN IGNORE, NOT AN ERROR IT MUST HANDLE. Papers are an ADDITION to an
    // answer; if the literature is unreachable the turn should still answer from the web and the
    // learner's material, so this returns an empty result rather than something that reads as a
    // failure of the whole turn.
    return Response.json({ hits: [] }, { status: 200 });
  }
}
