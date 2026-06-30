import { isReusableFullTextLicense, legalFullTextAccess, openVersionAccess } from "../access";
import { normalizeDoi } from "../dedupe";
import type { PaperAccess, PaperSourceAdapter, SearchOptions } from "../types";

interface UnpaywallLocation {
  url_for_landing_page?: string | null;
  url_for_pdf?: string | null;
  license?: string | null;
  version?: string | null;
}

interface UnpaywallResponse {
  is_oa?: boolean;
  best_oa_location?: UnpaywallLocation | null;
}

export async function resolveUnpaywallAccess(
  doi: string,
  options: Pick<SearchOptions, "fetchImpl" | "signal"> = {},
): Promise<PaperAccess | null> {
  const normalized = normalizeDoi(doi);
  if (!normalized) return null;

  const fetchImpl = options.fetchImpl ?? fetch;
  const email = process.env.UNPAYWALL_EMAIL ?? "support@pharmaorb.app";
  const url = new URL(`https://api.unpaywall.org/v2/${encodeURIComponent(normalized)}`);
  url.searchParams.set("email", email);

  const response = await fetchImpl(url, { signal: options.signal });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Unpaywall lookup failed with ${response.status}`);
  }

  const json = (await response.json()) as UnpaywallResponse;
  const location = json.best_oa_location;
  const landingUrl = location?.url_for_landing_page ?? null;
  const pdfUrl = location?.url_for_pdf ?? null;
  if (!json.is_oa || (!landingUrl && !pdfUrl)) return null;

  const input = {
    source: "unpaywall" as const,
    fullTextUrl: landingUrl,
    pdfUrl,
    license: location?.license ?? null,
    version: location?.version ?? null,
    explanation: "Unpaywall resolved an open-access location for this DOI.",
  };

  return isReusableFullTextLicense(location?.license)
    ? legalFullTextAccess(input)
    : openVersionAccess(input);
}

export function createUnpaywallAdapter(): PaperSourceAdapter {
  return {
    name: "unpaywall",
    async search() {
      return [];
    },
    resolveByDoi: resolveUnpaywallAccess,
  };
}
