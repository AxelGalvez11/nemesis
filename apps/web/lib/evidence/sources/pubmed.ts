import { normalizeDoi } from "../dedupe";
import type { PaperHit, PaperSourceAdapter, SearchOptions } from "../types";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

function stripXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function firstTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripXml(match[1] ?? "") : null;
}

function allTags(block: string, tag: string): string[] {
  return Array.from(block.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi")))
    .map((match) => stripXml(match[1] ?? ""))
    .filter(Boolean);
}

function articleId(block: string, idType: string): string | null {
  const match = block.match(
    new RegExp(`<ArticleId\\s+IdType=["']${idType}["'][^>]*>([\\s\\S]*?)<\\/ArticleId>`, "i"),
  );
  return match ? stripXml(match[1] ?? "") : null;
}

function parseYear(block: string): number | null {
  const year = firstTag(block, "Year") ?? firstTag(block, "MedlineDate")?.match(/\b(19|20)\d{2}\b/)?.[0];
  const parsed = year ? Number.parseInt(year, 10) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAuthors(block: string): string[] {
  return Array.from(block.matchAll(/<Author\b[^>]*>([\s\S]*?)<\/Author>/gi))
    .map((match) => {
      const author = match[1] ?? "";
      const last = firstTag(author, "LastName");
      const initials = firstTag(author, "Initials");
      const collective = firstTag(author, "CollectiveName");
      return collective ?? [last, initials].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .slice(0, 12);
}

export function parsePubMedXml(xml: string): PaperHit[] {
  return Array.from(xml.matchAll(/<PubmedArticle\b[^>]*>([\s\S]*?)<\/PubmedArticle>/gi))
    .map((match): PaperHit | null => {
      const block = match[1] ?? "";
      const pmid = firstTag(block, "PMID");
      const title = firstTag(block, "ArticleTitle");
      if (!pmid || !title) return null;

      const abstractParts = allTags(block, "AbstractText");
      const doi = normalizeDoi(articleId(block, "doi"));
      const pmcid = articleId(block, "pmc");
      const publicationTypes = allTags(block, "PublicationType");

      return {
        id: `pubmed:${pmid}`,
        title,
        abstract: abstractParts.length ? abstractParts.join(" ") : null,
        doi,
        pmid,
        pmcid,
        arxiv_id: null,
        year: parseYear(block),
        journal: firstTag(block, "Title") ?? firstTag(block, "ISOAbbreviation"),
        authors: parseAuthors(block),
        publication_types: publicationTypes,
        source_rank: ["pubmed"],
        access_candidates: [],
        metadata: {
          source_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        },
      };
    })
    .filter((paper): paper is PaperHit => Boolean(paper));
}

function withNcbiKey(url: URL): URL {
  const key = process.env.NCBI_API_KEY;
  if (key) url.searchParams.set("api_key", key);
  return url;
}

export function createPubMedAdapter(): PaperSourceAdapter {
  return {
    name: "pubmed",
    async search(query: string, options: SearchOptions = {}) {
      const fetchImpl = options.fetchImpl ?? fetch;
      const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
      const searchUrl = withNcbiKey(new URL(`${EUTILS}/esearch.fcgi`));
      searchUrl.searchParams.set("db", "pubmed");
      searchUrl.searchParams.set("term", query);
      searchUrl.searchParams.set("retmode", "json");
      searchUrl.searchParams.set("retmax", String(limit));
      searchUrl.searchParams.set("sort", "relevance");

      const searchResponse = await fetchImpl(searchUrl, { signal: options.signal });
      if (!searchResponse.ok) {
        throw new Error(`PubMed search failed with ${searchResponse.status}`);
      }
      const searchJson = (await searchResponse.json()) as { esearchresult?: { idlist?: string[] } };
      const ids = searchJson.esearchresult?.idlist ?? [];
      if (!ids.length) return [];

      const fetchUrl = withNcbiKey(new URL(`${EUTILS}/efetch.fcgi`));
      fetchUrl.searchParams.set("db", "pubmed");
      fetchUrl.searchParams.set("id", ids.join(","));
      fetchUrl.searchParams.set("retmode", "xml");

      const articleResponse = await fetchImpl(fetchUrl, { signal: options.signal });
      if (!articleResponse.ok) {
        throw new Error(`PubMed fetch failed with ${articleResponse.status}`);
      }
      return parsePubMedXml(await articleResponse.text());
    },
  };
}
