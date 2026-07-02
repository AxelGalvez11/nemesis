import type { PaperHit } from "./types";

const TYPE_WEIGHTS: Array<[RegExp, number]> = [
  [/(systematic review|meta-analysis|meta analysis)/i, 50],
  [/(randomized controlled trial|randomised controlled trial|\brct\b)/i, 42],
  [/(clinical trial|controlled clinical trial)/i, 34],
  [/(cohort|prospective)/i, 28],
  [/(case-control|case control)/i, 22],
  [/(review)/i, 20],
  [/(case report)/i, 12],
  [/(preprint)/i, 5],
];

function publicationTypeScore(paper: PaperHit): number {
  const text = paper.publication_types.join(" ");
  for (const [pattern, score] of TYPE_WEIGHTS) {
    if (pattern.test(text)) return score;
  }
  return 10;
}

function queryMatchScore(paper: PaperHit, query: string): number {
  const haystack = `${paper.title} ${paper.abstract ?? ""}`.toLowerCase();
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter((term) => term.length > 2);
  if (!terms.length) return 0;
  const matched = terms.filter((term) => haystack.includes(term)).length;
  return Math.round((matched / terms.length) * 24);
}

function recencyScore(year: number | null): number {
  if (!year) return 0;
  const currentYear = new Date().getUTCFullYear();
  const age = Math.max(0, currentYear - year);
  return Math.max(0, 14 - Math.min(age, 14));
}

export function scorePaper(paper: PaperHit, query: string): number {
  const identifierScore =
    (paper.doi ? 8 : 0) +
    (paper.pmid ? 6 : 0) +
    (paper.pmcid ? 6 : 0) +
    (paper.abstract ? 6 : 0);
  const sourceDiversityScore = Math.min(paper.source_rank.length, 4) * 5;
  return (
    publicationTypeScore(paper) +
    queryMatchScore(paper, query) +
    recencyScore(paper.year) +
    identifierScore +
    sourceDiversityScore
  );
}

export function rankPapers(papers: PaperHit[], query: string): PaperHit[] {
  return [...papers]
    .map((paper) => ({ ...paper, score: scorePaper(paper, query) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
