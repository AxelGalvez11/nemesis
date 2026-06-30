import { resolveBestAccess } from "./access";
import { dedupePapers } from "./dedupe";
import { rankPapers } from "./rank";
import { createEuropePmcAdapter } from "./sources/europepmc";
import { createOpenAlexAdapter } from "./sources/openalex";
import { createPubMedAdapter } from "./sources/pubmed";
import { createUnpaywallAdapter } from "./sources/unpaywall";
import type {
  EvidenceSearchResponse,
  EvidenceSearchWarning,
  PaperHit,
  PaperSourceAdapter,
  SearchOptions,
} from "./types";

interface EvidenceSearchOptions extends SearchOptions {
  adapters?: PaperSourceAdapter[];
  resolveExternalAccess?: boolean;
}

function defaultAdapters(): PaperSourceAdapter[] {
  return [createPubMedAdapter(), createEuropePmcAdapter(), createOpenAlexAdapter()];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function enrichAccess(
  paper: PaperHit,
  options: Pick<EvidenceSearchOptions, "fetchImpl" | "signal" | "resolveExternalAccess">,
): Promise<PaperHit> {
  if (options.resolveExternalAccess === false || !paper.doi) return paper;

  try {
    const access = await createUnpaywallAdapter().resolveByDoi?.(paper.doi, {
      fetchImpl: options.fetchImpl,
      signal: options.signal,
    });
    return access
      ? {
          ...paper,
          access_candidates: [...paper.access_candidates, access],
          source_rank: paper.source_rank.includes("unpaywall")
            ? paper.source_rank
            : [...paper.source_rank, "unpaywall"],
        }
      : paper;
  } catch {
    return paper;
  }
}

export async function searchEvidence(
  query: string,
  options: EvidenceSearchOptions = {},
): Promise<EvidenceSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Evidence search query is required");
  }

  const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
  const adapters = options.adapters ?? defaultAdapters();
  const settled = await Promise.allSettled(
    adapters.map(async (adapter) => ({
      adapter,
      results: await adapter.search(trimmed, {
        limit,
        fetchImpl: options.fetchImpl,
        signal: options.signal,
      }),
    })),
  );

  const warnings: EvidenceSearchWarning[] = [];
  const hits: PaperHit[] = [];

  for (const result of settled) {
    if (result.status === "fulfilled") {
      hits.push(...result.value.results);
    } else {
      const adapter = adapters[settled.indexOf(result)];
      warnings.push({
        source: adapter?.name ?? "pubmed",
        message: errorMessage(result.reason),
      });
    }
  }

  const ranked = rankPapers(dedupePapers(hits), trimmed).slice(0, limit);
  const enriched = await Promise.all(
    ranked.map((paper) =>
      enrichAccess(paper, {
        fetchImpl: options.fetchImpl,
        signal: options.signal,
        resolveExternalAccess: options.resolveExternalAccess,
      }),
    ),
  );

  const results = enriched.map((paper) => ({
    ...paper,
    access: resolveBestAccess(paper),
  }));

  return {
    query: trimmed,
    count: results.length,
    results,
    warnings,
    searched_sources: adapters.map((adapter) => adapter.name),
    generated_at: new Date().toISOString(),
  };
}
