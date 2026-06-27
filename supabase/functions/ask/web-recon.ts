// Non-evidence web reconnaissance for ambiguous user language.
//
// This lane may help identify what a user means ("Celsius" => an energy drink), but it must never be
// treated as clinical proof. The biomedical answer still has to come from the retrieved source pool.

import { resolveKnownEntities } from "./entity-intelligence.ts";

export type ReconTrust = "entity_context" | "authoritative_context" | "untrusted";

export interface WebReconSource {
  title: string;
  url: string;
  snippet: string;
  trust: ReconTrust;
}

export interface WebReconResult {
  assumptions: string[];
  normalized_terms: string[];
  biomedical_terms: string[];
  sources: WebReconSource[];
}

const SEARCH_TIMEOUT_MS = 2500;
const TRUSTED_CONTEXT_HOSTS = [
  "mayoclinic.org",
  "hopkinsmedicine.org",
  "clevelandclinic.org",
  "mskcc.org",
];

export function reconEnabled(): boolean {
  return Deno.env.get("WEB_RECON") === "on";
}

export function trustUrl(url: string): ReconTrust {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith(".gov") || host.endsWith(".nih.gov") || host.endsWith(".fda.gov")) return "authoritative_context";
    if (TRUSTED_CONTEXT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "authoritative_context";
    if (host.includes("wikipedia.org") || host.includes("wikidata.org")) return "entity_context";
    return "untrusted";
  } catch {
    return "untrusted";
  }
}

export function inferRecon(question: string, sources: WebReconSource[]): WebReconResult {
  const entities = resolveKnownEntities(question, []);
  return {
    assumptions: entities.flatMap((e) => e.assumptions),
    normalized_terms: entities.map((e) => e.normalized),
    biomedical_terms: dedupe(entities.flatMap((e) => e.biomedical_terms)),
    sources,
  };
}

export async function runWebRecon(question: string): Promise<WebReconResult> {
  if (!reconEnabled()) return inferRecon(question, []);

  const apiUrl = Deno.env.get("WEB_RECON_API_URL");
  const apiKey = Deno.env.get("WEB_RECON_API_KEY");
  if (!apiUrl || !apiKey) return inferRecon(question, []);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ query: question, max_results: 5 }),
      signal: ctrl.signal,
    });
    if (!res.ok) return inferRecon(question, []);

    const data = await res.json() as { results?: Array<{ title?: string; url?: string; snippet?: string }> };
    const sources = (data.results ?? [])
      .map((r) => ({
        title: String(r.title ?? "").trim(),
        url: String(r.url ?? "").trim(),
        snippet: String(r.snippet ?? "").trim(),
        trust: trustUrl(String(r.url ?? "")),
      }))
      .filter((r) => r.title && r.url && r.trust !== "untrusted");

    return inferRecon(question, sources);
  } catch {
    return inferRecon(question, []);
  } finally {
    clearTimeout(timer);
  }
}

function dedupe(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
