// Agentic iterative web research for Deep Research (DEEP_RESEARCH_AGENTIC=on, default OFF).
//
// Copies the canonical ChatGPT-style deep-research loop (dzhng/deep-research shape, adapted for a
// medical evidence product — see docs/research/deep-research-agentic-architecture-2026-07.md):
//
//   query -> generate SERP queries -> recon search -> extract {learning, url, text} PER SOURCE
//         -> collect follow-ups -> recurse to depth D (breadth halves each level) -> return learnings
//
// KEY MEDICAL-TOOL DEVIATION: learnings are extracted PER SINGLE SOURCE so every learning carries
// exactly ONE backing url + text. Each becomes a RetrievedChunk that flows into the EXISTING pool,
// where the reranker, the per-claim faithfulness judge, and the deterministic forbidden-phrase scan
// run unchanged. So this adds ChatGPT's web breadth WITHOUT lowering the citation bar: a web claim
// only survives if its cited source actually supports it.
//
// Fail-safe by contract: every network/LLM failure degrades to fewer learnings, never throws — a weak
// web round must never sink the report. Bounded concurrency + hard depth cap keep it inside the job's
// wall-clock budget. Web text is truncated before it ever reaches the LLM (token-blowup pitfall).
//
// LOAD-BEARING INVARIANT (see webLearningsToChunks): chunk_text is the source's REAL passage ONLY —
// the model's `learning` is never written into it, so a hallucinated learning cannot self-ground past
// the faithfulness judge. KNOWN RESIDUAL: the judge checks support-BY-TEXT, not truth — a web page
// that asserts something false in its own prose can be "faithfully" cited. Mitigated by dropping all
// low-trust domains (only trusted journals / guideline bodies / health authorities are citable), but
// not eliminated. This is inherent to grounding on live web content; keep the flag OFF until this
// tradeoff is acceptable for the deployment.

import { callTool, type Tool } from "../llm.ts";
import { modelFor } from "../model-router.ts";
import type { RetrievedChunk } from "../citation.ts";

export function agenticResearchEnabled(): boolean {
  return Deno.env.get("DEEP_RESEARCH_AGENTIC") === "on";
}

// Loop budget (env-tunable; defaults from the architecture research for a 4-6 min background job).
const num = (key: string, fallback: number): number => {
  const v = Number(Deno.env.get(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const ROOT_BREADTH = () => num("DEEP_AGENTIC_BREADTH", 4); // SERP queries at the root; halves each depth
const MAX_DEPTH = () => num("DEEP_AGENTIC_DEPTH", 2); // root + one follow-up round
const RESULTS_PER_QUERY = () => num("DEEP_AGENTIC_RESULTS", 5); // max_results per query
const CONCURRENCY = () => num("DEEP_AGENTIC_CONCURRENCY", 3); // parallel searches in flight
const PAGE_CHAR_CAP = 12000; // truncate each page before the LLM (token-blowup pitfall)
const SEARCH_TIMEOUT_MS = 12000;
const MAX_LEARNINGS_TOTAL = 60; // hard stop so a runaway tree can't blow the pool

export interface WebLearning {
  learning: string; // one atomic, entity/number-preserving fact
  url: string; // the single backing source
  title: string;
  text: string; // the source passage the faithfulness judge checks the claim against
  trust: WebTrust;
}

export type WebTrust = "high" | "medium" | "low";

/**
 * Trust rank for a research web source (broader than the /ask recon filter, which is .gov/wikipedia
 * only — a research report legitimately draws on journals, Cochrane, guideline bodies, .edu). Two
 * uses downstream: "low" (random blogs / SEO) is DROPPED entirely in webLearningsToChunks (never
 * citable in a medical report), and among the kept high/medium sources this orders the pool so
 * higher-trust wins ties. The faithfulness judge is still the per-claim gate on top. Pure.
 */
export function webTrust(url: string): WebTrust {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "low";
  }
  const HIGH = [
    ".gov", ".nih.gov", ".fda.gov", ".who.int", "cochrane.org", "nejm.org", "jamanetwork.com",
    "thelancet.com", "bmj.com", "nature.com", "sciencedirect.com", "cell.com", "ahajournals.org",
    "acc.org", "escardio.org", "uptodate.com", "ncbi.nlm.nih.gov", "europepmc.org", ".edu",
  ];
  const MEDIUM = [
    "wikipedia.org", "medlineplus.gov", "mayoclinic.org", "clevelandclinic.org", "healthline.com",
    "webmd.com", "drugs.com", "medscape.com", "examine.com", "consensus.app", "semanticscholar.org",
  ];
  if (HIGH.some((d) => hostMatchesDomain(host, d))) return "high";
  if (MEDIUM.some((d) => hostMatchesDomain(host, d))) return "medium";
  return "low";
}

/**
 * Strict domain-suffix match — the trust filter's load-bearing check. The old `host.includes(d)`
 * let a spoofed host ("nejm.org.evil-attacker.com") pass as trusted; this matches only the real
 * registrable domain or a subdomain of it. Two entry forms:
 *   - ".gov"/".edu"/".nih.gov" (leading dot) → TLD/suffix: host is exactly the label or ends with it.
 *   - "nejm.org" (no dot) → host is that domain exactly, or a subdomain ("www.nejm.org"), never a
 *     domain that merely CONTAINS it ("nejm.org.evil.com" and "evilnejm.org" both reject). Pure.
 */
export function hostMatchesDomain(host: string, domain: string): boolean {
  if (domain.startsWith(".")) return host === domain.slice(1) || host.endsWith(domain);
  return host === domain || host.endsWith("." + domain);
}

interface SerpQuery {
  query: string;
  goal: string;
}

const SERP_TOOL: Tool = {
  name: "submit_search_queries",
  description: "Submit distinct web search queries to research the question.",
  parameters: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            query: { type: "string", description: "A focused web search query (as you'd type into a search engine)." },
            goal: { type: "string", description: "What this query is trying to learn, and what follow-up directions to pursue." },
          },
          required: ["query", "goal"],
        },
      },
    },
    required: ["queries"],
  },
};

const EXTRACT_TOOL: Tool = {
  name: "submit_learnings",
  description: "Submit concise factual learnings and follow-up questions from a source.",
  parameters: {
    type: "object",
    properties: {
      learnings: {
        type: "array",
        items: { type: "string" },
        description: "Up to 3 concise, information-dense facts from THIS source. Preserve exact numbers, effect sizes, sample sizes, dates, drug/gene names. Empty if the source has nothing relevant.",
      },
      follow_ups: {
        type: "array",
        items: { type: "string" },
        description: "Up to 2 follow-up questions worth researching next.",
      },
    },
    required: ["learnings"],
  },
};

const SERP_SYSTEM =
  `You plan web searches for a rigorous biomedical evidence review. Given the research question and any
prior learnings, produce distinct, non-overlapping search queries that would surface clinical trials,
systematic reviews, meta-analyses, and authoritative guidance. Prefer precise terms (drug names,
outcomes, "randomized", "meta-analysis", "guideline") over vague phrasing. Do not repeat prior queries.`;

const EXTRACT_SYSTEM =
  `You extract atomic factual learnings from ONE web source for a biomedical evidence review. Rules:
- Each learning is a single, self-contained, information-dense fact grounded in THIS source's text.
- PRESERVE exact numbers: effect sizes, confidence intervals, sample sizes, p-values, doses, dates.
- Do not infer beyond the text. If the source is irrelevant or non-substantive, return no learnings.
- Never state a medical recommendation; report what the source found, not what a reader should do.`;

interface ReconResult {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
}

/**
 * One search against the configured reconnaissance endpoint (WEB_RECON_API_URL).
 *
 * 🔴 THE PROVIDER IS A SECRET, NOT A NAME IN THIS FILE, AND THAT IS DELIBERATE — it used
 * to be called `tavilySearch`, which said out loud what only the deployment knows. Owner,
 * 2026-09-01: *"make sure tavily is not plugged into nemesis, only brave for websearch
 * please."* Renaming does not unplug anything: if WEB_RECON_API_URL still points at
 * api.tavily.com, that is what runs. Check the secret, not the identifier.
 *
 * 🔴 THIS WHOLE LANE IS OFF UNLESS `DEEP_RESEARCH_AGENTIC=on`. It is not the chat's web
 * search — that is nemesis-search, which is Brave and nothing else.
 *
 * Returns [] on any failure (missing key, non-200, timeout).
 */
async function reconSearch(query: string): Promise<ReconResult[]> {
  const apiUrl = Deno.env.get("WEB_RECON_API_URL");
  const apiKey = Deno.env.get("WEB_RECON_API_KEY");
  if (!apiUrl || !apiKey) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ query, max_results: RESULTS_PER_QUERY(), include_raw_content: true, search_depth: "basic" }),
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: ReconResult[] };
    return data.results ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Generate up to `breadth` SERP queries. Returns [] on failure (caller degrades to no web round). */
async function generateSerpQueries(question: string, priorLearnings: string[], breadth: number, apiKey: string): Promise<SerpQuery[]> {
  const learningsBlock = priorLearnings.length
    ? `\n\nPrior learnings so far:\n${priorLearnings.slice(0, 20).map((l) => `- ${l}`).join("\n")}`
    : "";
  try {
    const { input } = await callTool<{ queries?: SerpQuery[] }>(
      {
        model: modelFor("classify"),
        max_tokens: 700,
        temperature: 0.3,
        system: SERP_SYSTEM,
        tools: [SERP_TOOL],
        messages: [{ role: "user", content: `Research question: ${question}\n\nGenerate up to ${breadth} search queries.${learningsBlock}` }],
      },
      "submit_search_queries",
      apiKey,
    );
    return (input.queries ?? [])
      .filter((q) => q && typeof q.query === "string" && q.query.trim())
      .slice(0, breadth)
      .map((q) => ({ query: q.query.trim(), goal: String(q.goal ?? "").trim() }));
  } catch {
    return [];
  }
}

/** Extract learnings from ONE source (per-source so each learning has exactly one backing url). */
async function extractFromSource(researchGoal: string, result: ReconResult, apiKey: string): Promise<{ learnings: WebLearning[]; followUps: string[] }> {
  const url = String(result.url ?? "").trim();
  const title = String(result.title ?? "").trim();
  const text = String(result.raw_content ?? result.content ?? "").trim().slice(0, PAGE_CHAR_CAP);
  if (!url || !text) return { learnings: [], followUps: [] };
  try {
    const { input } = await callTool<{ learnings?: string[]; follow_ups?: string[] }>(
      {
        model: modelFor("classify"),
        max_tokens: 600,
        temperature: 0,
        system: EXTRACT_SYSTEM,
        tools: [EXTRACT_TOOL],
        messages: [{ role: "user", content: `Research goal: ${researchGoal}\n\nSource: ${title}\nURL: ${url}\n\nContent:\n${text}` }],
      },
      "submit_learnings",
      apiKey,
    );
    const trust = webTrust(url);
    const learnings: WebLearning[] = (input.learnings ?? [])
      .filter((l) => typeof l === "string" && l.trim().length > 10)
      .slice(0, 3)
      .map((l) => ({ learning: l.trim(), url, title, text, trust }));
    const followUps = (input.follow_ups ?? []).filter((f) => typeof f === "string" && f.trim()).slice(0, 2);
    return { learnings, followUps };
  } catch {
    return { learnings: [], followUps: [] };
  }
}

/** Run async workers over items with a bounded concurrency limit. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export interface AgenticProgress {
  onQueries?: (queries: string[], depth: number) => void;
  onSources?: (count: number) => void;
}

/**
 * Run the full agentic web-research loop. Returns deduped learnings (each with its single backing
 * source). Never throws — accumulates whatever it can within the depth/breadth/time budget.
 */
export async function runAgenticWebResearch(
  question: string,
  apiKey: string,
  progress?: AgenticProgress,
): Promise<WebLearning[]> {
  const all: WebLearning[] = [];
  const seenLearning = new Set<string>();
  const seenUrlGoal = new Set<string>();

  const recurse = async (query: string, breadth: number, depth: number, prior: string[]): Promise<void> => {
    if (depth <= 0 || all.length >= MAX_LEARNINGS_TOTAL) return;
    const serp = await generateSerpQueries(query, prior, breadth, apiKey);
    if (serp.length === 0) return;
    progress?.onQueries?.(serp.map((q) => q.query), depth);

    await mapLimit(serp, CONCURRENCY(), async (sq) => {
      if (all.length >= MAX_LEARNINGS_TOTAL) return;
      const results = await reconSearch(sq.query);
      const fresh = results.filter((r) => {
        const key = `${sq.goal}::${r.url ?? ""}`;
        if (!r.url || seenUrlGoal.has(key)) return false;
        seenUrlGoal.add(key);
        return true;
      });
      const extracted = await mapLimit(fresh, CONCURRENCY(), (r) => extractFromSource(sq.goal || sq.query, r, apiKey));
      const followUps: string[] = [];
      for (const { learnings, followUps: f } of extracted) {
        for (const l of learnings) {
          const dedupeKey = l.learning.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
          if (seenLearning.has(dedupeKey) || all.length >= MAX_LEARNINGS_TOTAL) continue;
          seenLearning.add(dedupeKey);
          all.push(l);
        }
        followUps.push(...f);
      }
      progress?.onSources?.(all.length);
      if (depth - 1 > 0 && followUps.length && all.length < MAX_LEARNINGS_TOTAL) {
        const nextQuery = `${sq.goal}\nFollow-ups: ${followUps.slice(0, 3).join("; ")}`;
        await recurse(nextQuery, Math.ceil(breadth / 2), depth - 1, all.map((l) => l.learning));
      }
    });
  };

  try {
    await recurse(question, ROOT_BREADTH(), MAX_DEPTH(), []);
  } catch (e) {
    console.error("agentic web research loop failed; using partial learnings:", (e as Error).message);
  }
  return all;
}

/**
 * Adapt web learnings to RetrievedChunks so they rank + ground + cite alongside library/live chunks.
 * Synthetic ids ("web:<hash>") like liveToChunk. chunk_text is the SOURCE passage (what the
 * faithfulness judge verifies the claim against), NOT the learning — so a fabricated learning whose
 * text doesn't support it gets dropped by the same gate that guards every other source. One chunk per
 * distinct source URL (learnings from the same page collapse to that page's chunk). Pure.
 */
export function webLearningsToChunks(learnings: readonly WebLearning[], startTag: number): RetrievedChunk[] {
  // Drop LOW-trust sources (random blogs / SEO pages) entirely — they are never citable in a medical
  // evidence report. This is the real mitigation for "a web page can assert something false in its own
  // prose and pass the support-check judge": the pool is restricted to trusted journals, guideline
  // bodies, and health authorities (webTrust high/medium), so the residual shrinks to a trusted source
  // being wrong, not an SEO farm. DEEP_AGENTIC_ALLOW_LOW_TRUST=on lifts this if ever needed.
  const allowLow = Deno.env.get("DEEP_AGENTIC_ALLOW_LOW_TRUST") === "on";
  const kept = allowLow ? learnings : learnings.filter((l) => l.trust !== "low");
  const byUrl = new Map<string, WebLearning[]>();
  for (const l of kept) {
    const arr = byUrl.get(l.url) ?? [];
    arr.push(l);
    byUrl.set(l.url, arr);
  }
  const order: WebTrust[] = ["high", "medium", "low"];
  const entries = [...byUrl.entries()].sort((a, b) => order.indexOf(a[1][0].trust) - order.indexOf(b[1][0].trust));
  return entries.map(([url, ls], i) => {
    const syntheticId = `web:${simpleHash(url)}`;
    // chunk_text = the source's REAL passage ONLY — the grounding target the faithfulness judge
    // checks every claim against. The model-generated `learning` is DELIBERATELY excluded: prepending
    // it would let a hallucinated learning "support itself" (the judge would see model output in the
    // grounding target and pass a claim the real source never backs) — the one way to defeat the whole
    // safety argument. So a web claim survives ONLY if the actual fetched source text supports it;
    // if the fact lived outside the kept passage, the claim is conservatively dropped (safe: a real
    // source lost, never a fabrication admitted). Learnings still earn their keep upstream — they
    // filter irrelevant sources (no learnings -> no chunk) and seed the loop's follow-up queries.
    const passage = ls[0].text.slice(0, 4000);
    return {
      tag: String(startTag + i),
      chunk_id: syntheticId,
      chunk_text: passage,
      source_id: syntheticId,
      provider: "web",
      title: ls[0].title || url,
      section: null,
      url,
      license: "web",
      published_date: null,
      retrieved_at: new Date().toISOString(),
      similarity: 0,
    } as RetrievedChunk;
  });
}

/** Small deterministic string hash for synthetic ids (no crypto import needed). */
function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
