import type { PaperAccess, PaperHit } from "./types";

const REUSABLE_LICENSE_RE = /\b(cc[-\s]?by|cc0|public domain)\b/i;
const RESTRICTED_LICENSE_RE = /\b(non[-\s]?commercial|cc[-\s]?by[-\s]?nc|cc[-\s]?by[-\s]?nd|closed|all rights reserved)\b/i;

export function isReusableFullTextLicense(license: string | null | undefined): boolean {
  if (!license) return false;
  return REUSABLE_LICENSE_RE.test(license) && !RESTRICTED_LICENSE_RE.test(license);
}

export function abstractOnlyAccess(source: PaperHit["source_rank"][number] | "none", hasAbstract: boolean): PaperAccess {
  return {
    status: hasAbstract ? "abstract_or_metadata_only" : "metadata_only",
    source,
    full_text_url: null,
    pdf_url: null,
    license: null,
    version: null,
    can_index: false,
    can_store_full_text: false,
    can_show_snippets: false,
    explanation: hasAbstract
      ? "No reusable legal full text was resolved; use abstract and metadata only."
      : "No reusable legal full text or abstract was resolved; use metadata only.",
  };
}

function accessPriority(access: PaperAccess): number {
  if (access.status === "legal_full_text" && access.can_index) return 100;
  if (access.status === "legal_full_text") return 90;
  if (access.status === "preprint" && access.can_index) return 80;
  if (access.status === "open_version") return 70;
  if (access.status === "abstract_or_metadata_only") return 20;
  return 10;
}

export function resolveBestAccess(paper: PaperHit): PaperAccess {
  const candidates = paper.access_candidates
    .map((candidate) => {
      const canReuse = isReusableFullTextLicense(candidate.license);
      if (
        candidate.status === "legal_full_text" &&
        (candidate.can_index || canReuse)
      ) {
        return {
          ...candidate,
          can_index: true,
          can_store_full_text: true,
          can_show_snippets: true,
        };
      }
      return candidate;
    })
    .sort((a, b) => accessPriority(b) - accessPriority(a));

  return (
    candidates[0] ??
    abstractOnlyAccess(paper.source_rank[0] ?? "none", Boolean(paper.abstract))
  );
}

export function legalFullTextAccess(input: {
  source: PaperAccess["source"];
  fullTextUrl?: string | null;
  pdfUrl?: string | null;
  license?: string | null;
  version?: string | null;
  explanation?: string;
}): PaperAccess {
  const reusable = isReusableFullTextLicense(input.license);
  return {
    status: "legal_full_text",
    source: input.source,
    full_text_url: input.fullTextUrl ?? null,
    pdf_url: input.pdfUrl ?? null,
    license: input.license ?? null,
    version: input.version ?? null,
    can_index: reusable,
    can_store_full_text: reusable,
    can_show_snippets: reusable,
    explanation:
      input.explanation ??
      (reusable
        ? "Resolved reusable legal full text."
        : "Resolved an open full-text location, but reuse permissions are unclear."),
  };
}

export function openVersionAccess(input: {
  source: PaperAccess["source"];
  fullTextUrl?: string | null;
  pdfUrl?: string | null;
  license?: string | null;
  version?: string | null;
  explanation?: string;
}): PaperAccess {
  return {
    status: "open_version",
    source: input.source,
    full_text_url: input.fullTextUrl ?? null,
    pdf_url: input.pdfUrl ?? null,
    license: input.license ?? null,
    version: input.version ?? null,
    can_index: false,
    can_store_full_text: false,
    can_show_snippets: false,
    explanation:
      input.explanation ??
      "Resolved an open version, but full-text indexing/storage permissions are not confirmed.",
  };
}
