import type { EvidenceSourceName, PaperAccess, PaperHit } from "./types";

const DOI_PREFIX_RE = /^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i;
const NON_TITLE_WORD_RE = /[^\p{L}\p{N}\s]+/gu;

export function normalizeDoi(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(DOI_PREFIX_RE, "").toLowerCase();
  return normalized || null;
}

export function normalizeIdentifier(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export function normalizeTitle(value: string | null | undefined): string | null {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(NON_TITLE_WORD_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

function candidateKeys(paper: PaperHit): string[] {
  const keys: string[] = [];
  const doi = normalizeDoi(paper.doi);
  if (doi) keys.push(`doi:${doi}`);

  const pmid = normalizeIdentifier(paper.pmid);
  if (pmid) keys.push(`pmid:${pmid}`);

  const pmcid = normalizeIdentifier(paper.pmcid);
  if (pmcid) keys.push(`pmcid:${pmcid.toUpperCase()}`);

  const arxivId = normalizeIdentifier(paper.arxiv_id);
  if (arxivId) keys.push(`arxiv:${arxivId.toLowerCase()}`);

  const title = normalizeTitle(paper.title);
  if (title) keys.push(`title:${title}`);

  return keys;
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function mergeAccessCandidates(left: PaperAccess[], right: PaperAccess[]): PaperAccess[] {
  const seen = new Set<string>();
  const merged: PaperAccess[] = [];
  for (const candidate of [...left, ...right]) {
    const key = [
      candidate.status,
      candidate.source,
      candidate.full_text_url,
      candidate.pdf_url,
      candidate.license,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }
  return merged;
}

function mergePapers(left: PaperHit, right: PaperHit): PaperHit {
  const doi = normalizeDoi(left.doi) ?? normalizeDoi(right.doi);
  const sourceRank = unique<EvidenceSourceName>([
    ...left.source_rank,
    ...right.source_rank,
  ]);

  return {
    ...left,
    title: left.title || right.title,
    abstract: left.abstract ?? right.abstract,
    doi,
    pmid: left.pmid ?? right.pmid,
    pmcid: left.pmcid ?? right.pmcid,
    arxiv_id: left.arxiv_id ?? right.arxiv_id,
    year: left.year ?? right.year,
    journal: left.journal ?? right.journal,
    authors: unique([...left.authors, ...right.authors]),
    publication_types: unique([
      ...left.publication_types,
      ...right.publication_types,
    ]),
    source_rank: sourceRank,
    access_candidates: mergeAccessCandidates(
      left.access_candidates,
      right.access_candidates,
    ),
    metadata: {
      ...right.metadata,
      ...left.metadata,
    },
  };
}

export function dedupePapers(papers: PaperHit[]): PaperHit[] {
  const byKey = new Map<string, PaperHit>();
  const result: PaperHit[] = [];

  for (const paper of papers) {
    const normalized: PaperHit = {
      ...paper,
      doi: normalizeDoi(paper.doi),
    };
    const keys = candidateKeys(normalized);
    if (!keys.length) {
      result.push(normalized);
      continue;
    }

    const existing = keys.map((key) => byKey.get(key)).find(Boolean);
    if (existing) {
      const merged = mergePapers(existing, normalized);
      for (const key of candidateKeys(merged)) {
        byKey.set(key, merged);
      }
    } else {
      for (const key of keys) {
        byKey.set(key, normalized);
      }
      result.push(normalized);
    }
  }

  return result.map((paper) => {
    const keys = candidateKeys(paper);
    return keys.map((key) => byKey.get(key)).find(Boolean) ?? paper;
  });
}
