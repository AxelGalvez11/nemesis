// Trusted-web live source for NORMAL chat (WEB_IN_CHAT=on, default OFF).
//
// WHY: normal chat only searches the medical databases + a hidden .gov/Wikipedia disambiguation
// pass — it never searches the trusted scholarly web for answer content the way ChatGPT does. This
// adds a real web search (via the already-configured Tavily key) as ONE MORE live source, hard-
// filtered to journals / .gov / guideline bodies / .edu (blogs & SEO dropped by webTrust). Its hits
// become provider:"web_trusted" candidates that flow through the SAME rerank + citation-enforcement +
// deterministic safety scan (detectViolations) as PubMed/FDA hits already do in the chat answer path.
//
// SAFETY POSTURE: unlike Deep Research, the fast chat path has no per-claim faithfulness judge — but
// it never had one for PubMed abstracts either. Web hits get the identical treatment to every other
// live chat source, PLUS the trust filter (only reputable domains). Restricted license → surfaces
// live/citable but is never stored. Fail-safe: any failure (no key, non-200, timeout) returns [].

import type { NormalizedSource } from "../core-source-sync/normalized-source.ts";
import { sha256Hex } from "../core-source-sync/embeddings.ts";
import { webTrust } from "./research/web-research.ts";

export function webInChatEnabled(): boolean {
  return Deno.env.get("WEB_IN_CHAT") === "on";
}

const TIMEOUT_MS = 4000;
const PASSAGE_CAP = 3000; // per-hit text fed to the reranker/generator

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
}

/**
 * Search the trusted web and return citable NormalizedSources. Filtered to webTrust high/medium
 * (journals, .gov, guideline bodies, .edu, reputable consumer-health) — low-trust blogs/SEO dropped.
 * Never throws; returns [] on any failure. Signature matches a live-source fetch(query, max, ...).
 */
export async function fetchTrustedWeb(query: string, max: number): Promise<NormalizedSource[]> {
  const apiUrl = Deno.env.get("WEB_RECON_API_URL");
  const apiKey = Deno.env.get("WEB_RECON_API_KEY");
  const q = query.trim();
  if (!apiUrl || !apiKey || !q) return [];

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let results: TavilyResult[] = [];
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ query: q, max_results: Math.min(max, 8), include_raw_content: true, search_depth: "basic" }),
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    results = ((await res.json()) as { results?: TavilyResult[] }).results ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }

  const out: NormalizedSource[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    const url = String(r.url ?? "").trim();
    const title = String(r.title ?? "").trim();
    const text = String(r.raw_content ?? r.content ?? "").trim();
    if (!url || !title || !text) continue;
    if (webTrust(url) === "low") continue; // journals / .gov / guidelines / .edu only — no blogs/SEO
    if (seen.has(url)) continue;
    seen.add(url);
    const passage = text.slice(0, PASSAGE_CAP);
    out.push({
      provider: "web_trusted",
      provider_id: url, // dedupe key in live-sources fan-out is (provider, provider_id)
      title,
      source_url: url,
      license: "cc_by_nc", // restricted: surfaces live/citable, never stored
      content_text: passage,
      content_hash: await sha256Hex(passage),
      metadata: { trust: webTrust(url) },
    });
  }
  return out;
}
