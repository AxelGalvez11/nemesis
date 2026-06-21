/**
 * MedlinePlus provider. The U.S. National Library of Medicine's plain-language consumer-health
 * library — ~1,000 health-topic pages written as general patient guidance ("what it is, what helps,
 * when to see a clinician"). Used LIVE so benign/everyday health questions get an authoritative
 * mainstream-guidance answer that reads like a knowledgeable expert — while every claim stays cited.
 * It complements the research providers (PubMed/Europe PMC/OpenAlex), which answer in a
 * study-summary register; MedlinePlus answers in a general-guidance register.
 *
 * API: GET https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=<q>&retmax=N — free, no key,
 * returns XML. Each <document url="..."> is one topic page with a `title` and a `FullSummary` whose
 * HTML is itself XML-escaped (so &lt;p&gt; -> <p> on decode, then the tag is stripped; the qt0 spans
 * are search-term highlights, not content).
 *
 * License: nlm_public (NLM/NIH consumer-health terms, the existing default for this provider) ->
 * commercial_use_allowed -> STORABLE, so a surfaced page can be saved by read-through ingest.
 * source_url is the stable medlineplus.gov page.
 *
 * Dedupe: provider "medlineplus" + the topic slug (the page's last path segment, e.g. "heartburn"),
 * a stable per-topic id in its own namespace (no collision with the research providers).
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../normalized-source.ts";

const API = "https://wsearch.nlm.nih.gov/ws/query";

/** One parsed MedlinePlus health-topic document (post-decode, plain text). */
export interface MedlineTopic {
  url: string;
  title: string;
  summary: string;
  altTitles: string[];
  groups: string[];
}

/** Decode the XML/HTML entities MedlinePlus emits (&amp; first so double-escaped &amp;lt; resolves). */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/** Escaped-HTML field -> plain text: decode entities, strip the revealed tags, decode any residual. */
function cleanText(raw: string): string {
  const decoded = decodeEntities(raw); // &lt;p&gt; -> <p>
  const noTags = decoded.replace(/<[^>]+>/g, " "); // tags -> space (don't fuse words across <p>)
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

/** "https://medlineplus.gov/heartburn.html" -> "heartburn" (lowercased). Falls back to the url. */
export function topicSlug(url: string): string {
  const m = url.match(/\/([^/]+)\.html?$/i);
  return (m ? m[1] : url).toLowerCase().trim();
}

/** Parse the wsearch XML into topics. Regex-based to match the other providers (no DOM dep in Deno). */
export function parseMedlinePlusXml(xml: string): MedlineTopic[] {
  const topics: MedlineTopic[] = [];
  for (const docMatch of xml.matchAll(/<document\b[^>]*\burl="([^"]*)"[^>]*>([\s\S]*?)<\/document>/g)) {
    const url = docMatch[1];
    const block = docMatch[2];

    const first = (name: string): string => {
      const m = block.match(new RegExp(`<content name="${name}">([\\s\\S]*?)</content>`));
      return m ? cleanText(m[1]) : "";
    };
    const all = (name: string): string[] =>
      Array.from(
        block.matchAll(new RegExp(`<content name="${name}">([\\s\\S]*?)</content>`, "g")),
        (m) => cleanText(m[1]),
      ).filter((s) => s.length > 0);

    topics.push({
      url: url.trim(),
      title: first("title"),
      summary: first("FullSummary") || first("snippet"),
      altTitles: all("altTitle"),
      groups: all("groupName"),
    });
  }
  return topics;
}

/** Map one topic to a NormalizedSource. Pure (no network) so the parse is unit-testable. */
export async function normalizeMedlineTopic(topic: MedlineTopic): Promise<NormalizedSource | null> {
  const title = topic.title.trim();
  const summary = topic.summary.trim();
  if (!title || !summary) return null; // need both to rank + ground
  const slug = topicSlug(topic.url);
  if (!slug) return null;

  const content_text = `${title}\n\n${summary}`;
  return {
    provider: "medlineplus",
    provider_id: slug,
    title,
    subtitle: "MedlinePlus · National Library of Medicine",
    source_url: topic.url,
    license: "nlm_public",
    content_text,
    content_hash: await sha256Hex(content_text),
    metadata: {
      source: "medlineplus",
      slug,
      alt_titles: topic.altTitles,
      groups: topic.groups,
      organization: "National Library of Medicine",
    },
  };
}

export interface MedlinePlusFetchOpts {
  query: string;
  retmax?: number;
}

/**
 * Live fetch. Never throws upstream concerns: a non-OK response yields []. Capped modestly (consumer
 * topics are broad pages — a couple of authoritative hits, not a flood; the reranker orders them).
 */
export async function fetchMedlinePlus(opts: MedlinePlusFetchOpts): Promise<NormalizedSource[]> {
  const retmax = Math.min(opts.retmax ?? 4, 8);
  const params = new URLSearchParams({
    db: "healthTopics",
    term: opts.query,
    retmax: String(retmax),
  });
  const res = await fetch(`${API}?${params.toString()}`, {
    headers: { "User-Agent": "PharmaOrbBot/1.0 (mailto:support@pharmaorb.app)" },
  });
  if (!res.ok) return [];
  const xml = await res.text();

  const out: NormalizedSource[] = [];
  for (const topic of parseMedlinePlusXml(xml)) {
    const s = await normalizeMedlineTopic(topic);
    if (s) out.push(s);
  }
  return out;
}
