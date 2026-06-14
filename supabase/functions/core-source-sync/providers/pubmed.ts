/**
 * Phase 2: PubMed Open Access subset provider.
 *
 * API: NCBI E-utilities (esearch + efetch).
 * License: per-record (CC BY most common; some CC0). Per-record license
 * stored in metadata + reflected in core_sources.license enum mapping.
 * Auth: api_key recommended (NCBI_API_KEY) — unlocks 10 req/sec instead
 * of 3 req/sec.
 *
 * Phase 2 scope: stub. PMID-by-PMID fetch implemented; full PMC OA
 * dataset bulk download deferred to Phase 6 (marketplace + ops).
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../normalized-source.ts";
import type { CoreSourceLicense } from "../license.ts";

const ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const EFETCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";
const REQUEST_DELAY_MS = 350;

export interface PubMedFetchOpts {
  /** Query (e.g. "metformin AND lactic acidosis"). */
  query: string;
  /** Max records (default 5, hard cap 25). */
  retmax?: number;
  /**
   * Restrict to free-full-text papers ("free full text[sb]"). Default false: PubMed indexes the
   * ABSTRACT of paywalled papers too, and those abstracts are perfectly citable — and this provider
   * only ever fetches the abstract anyway, so the old OA-only filter dropped citable papers for no
   * gain. Opt in (oaOnly: true) only when a caller specifically wants free full text.
   */
  oaOnly?: boolean;
}

/**
 * Build the esearch term. Broad by default (includes paywalled-but-indexed abstracts); the
 * free-full-text subset filter is opt-in. PURE — unit-tested. (The historical name fetchPubMedOA and
 * the "pubmed_oa" provider tag are kept to avoid churning stored data; this is no longer OA-only.)
 */
export function buildPubMedTerm(query: string, oaOnly: boolean): string {
  return oaOnly ? `${query} AND free full text[sb]` : query;
}

export async function fetchPubMedOA(
  opts: PubMedFetchOpts,
): Promise<NormalizedSource[]> {
  const apiKey = Deno.env.get("NCBI_API_KEY") ?? "";
  const retmax = Math.min(opts.retmax ?? 5, 25);

  const searchParams = new URLSearchParams({
    db: "pubmed",
    term: buildPubMedTerm(opts.query, opts.oaOnly ?? false),
    retmax: String(retmax),
    retmode: "json",
  });
  if (apiKey) searchParams.set("api_key", apiKey);

  const searchRes = await fetch(`${ESEARCH}?${searchParams.toString()}`, {
    headers: { "User-Agent": "AscendBot/1.0 (axel@ascend.app)" },
  });
  // Make the silent drop observable: a 429 here (shared-IP throttle when NCBI_API_KEY is unset)
  // is exactly why live PubMed used to vanish from answers with no error in the logs. Distinguish
  // an API error (throttle/outage) from a legitimately empty result so the two are diagnosable.
  if (!searchRes.ok) {
    console.warn(`pubmed esearch HTTP ${searchRes.status} (api_key ${apiKey ? "set" : "MISSING"}) — dropping live PubMed for "${opts.query.slice(0, 60)}"`);
    return [];
  }
  const searchData = await searchRes.json();
  const pmids: string[] = searchData?.esearchresult?.idlist ?? [];
  if (!pmids.length) {
    console.warn(`pubmed esearch 0 results for "${opts.query.slice(0, 60)}"`);
    return [];
  }

  await sleep(REQUEST_DELAY_MS);

  const fetchParams = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    rettype: "abstract",
    retmode: "xml",
  });
  if (apiKey) fetchParams.set("api_key", apiKey);

  const fetchRes = await fetch(`${EFETCH}?${fetchParams.toString()}`, {
    headers: { "User-Agent": "AscendBot/1.0 (axel@ascend.app)" },
  });
  if (!fetchRes.ok) {
    console.warn(`pubmed efetch HTTP ${fetchRes.status} (api_key ${apiKey ? "set" : "MISSING"}) for ${pmids.length} pmids`);
    return [];
  }
  const xml = await fetchRes.text();

  const articles = parsePubMedXml(xml);
  const sources: NormalizedSource[] = [];

  for (const a of articles) {
    if (!a.abstract) continue;
    const content_text = `${a.title}\n\nABSTRACT\n\n${a.abstract}${
      a.mesh.length ? `\n\nMESH TERMS\n\n${a.mesh.join(", ")}` : ""
    }`;
    sources.push({
      provider: "pubmed_oa",
      provider_id: a.pmid,
      title: a.title || `PubMed ${a.pmid}`,
      subtitle: a.journal,
      source_url: `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`,
      license: a.license,
      content_text,
      content_hash: await sha256Hex(content_text),
      metadata: {
        pmid: a.pmid,
        journal: a.journal,
        journal_iso: a.journal_iso,
        issn: a.issn,
        volume: a.volume,
        issue: a.issue,
        pages: a.pages,
        year: a.year,
        authors: a.authors,
        publication_types: a.publication_types,
        mesh: a.mesh,
      },
    });
  }

  return sources;
}

interface ParsedArticle {
  pmid: string;
  title: string;
  abstract: string;
  journal: string;
  journal_iso: string;
  issn: string[];
  volume: string;
  issue: string;
  pages: string;
  year: number | null;
  authors: string[];
  publication_types: string[];
  mesh: string[];
  license: CoreSourceLicense;
}

export function parsePubMedXml(xml: string): ParsedArticle[] {
  const articleBlocks = xml.split(/<PubmedArticle[^>]*>/).slice(1);
  const out: ParsedArticle[] = [];

  for (const block of articleBlocks) {
    const pmid = extract(block, /<PMID[^>]*>([\s\S]*?)<\/PMID>/);
    const title = decode(extract(block, /<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/));
    const abstractText = decode(
      Array.from(block.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g), (m) => m[1]).join("\n\n"),
    );
    const journal = decode(extract(block, /<Title[^>]*>([\s\S]*?)<\/Title>/));
    const journal_iso = decode(extract(block, /<ISOAbbreviation[^>]*>([\s\S]*?)<\/ISOAbbreviation>/));
    // Journal ISSN(s) — <ISSN IssnType="Print|Electronic">. Used for the DOAJ vetted-journal check.
    const issn = Array.from(block.matchAll(/<ISSN\b[^>]*>([\s\S]*?)<\/ISSN>/g), (m) => decode(m[1]).trim()).filter(Boolean);
    const volume = decode(extract(block, /<Volume>([\s\S]*?)<\/Volume>/));
    const issue = decode(extract(block, /<Issue>([\s\S]*?)<\/Issue>/));
    const pages = decode(extract(block, /<MedlinePgn>([\s\S]*?)<\/MedlinePgn>/));
    const yearStr = extract(block, /<Year>(\d{4})<\/Year>/);

    // Authors as "LastName Initials" (Vancouver/AMA form). Each <Author> block parsed
    // individually so a missing initials field degrades to last-name-only, not a mis-pair.
    const authors = Array.from(block.matchAll(/<Author\b[^>]*>([\s\S]*?)<\/Author>/g), (m) => {
      const a = m[1];
      const last = decode(extract(a, /<LastName>([^<]+)<\/LastName>/));
      const initials = decode(extract(a, /<Initials>([^<]+)<\/Initials>/));
      if (!last) return "";
      return initials ? `${last} ${initials}` : last;
    }).filter(Boolean);

    const publication_types = Array.from(
      block.matchAll(/<PublicationType[^>]*>([^<]+)<\/PublicationType>/g),
      (m) => decode(m[1]),
    );
    const mesh = Array.from(
      block.matchAll(/<DescriptorName[^>]*>([^<]+)<\/DescriptorName>/g),
      (m) => m[1],
    );
    // PubMed doesn't publish license in XML reliably. Default cc_by for
    // PMC OA subset; per-record audit deferred.
    const license: CoreSourceLicense = "cc_by";

    if (pmid) {
      out.push({
        pmid, title, abstract: abstractText, journal, journal_iso, issn, volume, issue, pages,
        year: yearStr ? Number(yearStr) : null, authors, publication_types, mesh, license,
      });
    }
  }
  return out;
}

function extract(haystack: string, re: RegExp): string {
  const m = haystack.match(re);
  return m?.[1]?.trim() ?? "";
}

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
