// Supabase Edge Function: core-source-sync
//
// Phase 2: ingests Layer 1 authoritative sources into core_sources +
// core_source_chunks. Provider-routed dispatch.
//
// Auth: Bearer service-role token only (admin-triggered or pg_cron).
// User-token requests are rejected — Layer 1 is global, not per-user.
//
// Deploy:  supabase functions deploy core-source-sync
// Env:     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          OPENAI_API_KEY (or COHERE_API_KEY) for 1536-dim embeddings,
//          OPENFDA_API_KEY (optional, raises rate limit),
//          NCBI_API_KEY (optional, raises PubMed rate limit)

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { captureEdgeException } from "../_shared/sentry.ts";

import { chunkClinicalText } from "./chunking.ts";
import { embedCoreTexts } from "./embeddings.ts";
import { insertChunks, upsertCoreSource } from "./persist.ts";
import type { NormalizedSource } from "./persist.ts";
import type { CoreSourceProvider } from "./license.ts";

import {
  fetchOpenFdaLabels,
  type OpenFdaFetchOpts,
} from "./providers/openfda.ts";
import {
  fetchDailyMedSPLs,
  type DailyMedFetchOpts,
} from "./providers/dailymed.ts";
import {
  fetchRxNormConcept,
  type RxNormFetchOpts,
} from "./providers/rxnorm.ts";
import { fetchPubMedOA, type PubMedFetchOpts } from "./providers/pubmed.ts";
import { fetchCdcPages, type CdcFetchOpts } from "./providers/cdc.ts";
import {
  ingestDrugBankOpenData,
  type DrugBankFetchOpts,
} from "./providers/drugbank.ts";
import {
  fetchClinicalTrials,
  type ClinicalTrialsFetchOpts,
} from "./providers/clinicaltrials.ts";
import { fetchLiverTox, type LiverToxFetchOpts } from "./providers/livertox.ts";
import {
  fetchPubChemCompounds,
  type PubChemFetchOpts,
} from "./providers/pubchem.ts";
import {
  fetchCuratedPages,
  type CuratedPagesFetchOpts,
} from "./providers/curated-pages.ts";
import {
  AHRQ_PAGES,
  CDC_MMWR_PAGES,
  DHHS_HIV_PAGES,
  FDA_ORANGE_PAGES,
  FDA_SAFETY_PAGES,
  LACTMED_PAGES,
  LIVERTOX_PAGES,
  NCBI_BOOKSHELF_PAGES,
  NCI_PDQ_PAGES,
  NHLBI_PAGES,
  OPENSTAX_PAGES,
  ORPHANET_PAGES,
  PHARMGKB_PAGES,
  USPSTF_PAGES,
  VA_DOD_PAGES,
} from "./providers/curated-whitelists.ts";
import {
  fetchOpenStaxBook,
  OPENSTAX_BOOK_CATALOG,
  type OpenStaxBookFetchOpts,
} from "./providers/openstax-book.ts";
import {
  fetchNcbiBook,
  NCBI_BOOK_CATALOG,
  type NcbiBookFetchOpts,
} from "./providers/ncbi-book.ts";
import {
  fetchDrugsFda,
  type DrugsFdaFetchOpts,
} from "./providers/drugs-fda.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SyncRequest {
  provider: CoreSourceProvider;
  opts?:
    | OpenFdaFetchOpts
    | DailyMedFetchOpts
    | RxNormFetchOpts
    | PubMedFetchOpts
    | CdcFetchOpts
    | DrugBankFetchOpts
    | ClinicalTrialsFetchOpts
    | LiverToxFetchOpts
    | PubChemFetchOpts
    | CuratedPagesFetchOpts
    | OpenStaxBookFetchOpts
    | NcbiBookFetchOpts
    | DrugsFdaFetchOpts
    | { bulk: true };
  /** Skip embedding step (useful for content_hash-only refresh). */
  skip_embed?: boolean;
}

interface SyncResult {
  provider: CoreSourceProvider;
  fetched: number;
  ingested: number;
  skipped_unchanged: number;
  chunk_count: number;
  errors: Array<{ provider_id: string; message: string }>;
}

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PROJECT_REF =
  Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ??
  "";

/**
 * Accept either: (a) exact match of SUPABASE_SERVICE_ROLE_KEY env (handles
 * both legacy JWT and new sb_secret_* formats), or (b) a structurally-valid
 * service-role JWT issued for this project (legacy fallback when env holds
 * the new format but caller has the legacy JWT).
 */
function authorize(token: string): boolean {
  if (!token) return false;
  if (SERVICE_KEY && token === SERVICE_KEY) return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
    const payload = JSON.parse(
      atob(padded.replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (payload.role !== "service_role") return false;
    if (payload.iss !== "supabase") return false;
    if (PROJECT_REF && payload.ref && payload.ref !== PROJECT_REF) return false;
    if (payload.exp && payload.exp * 1000 < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!authorize(token)) return json({ error: "service-role required" }, 401);

  let body: SyncRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  if (!body.provider) {
    return json({ error: "provider required" }, 400);
  }

  try {
    const result = await runSync(body);
    return json(result);
  } catch (e) {
    const err = e as Error;
    captureEdgeException?.(err, {
      functionName: "core-source-sync",
      extra: { provider: body.provider },
    });
    return json({ error: err.message ?? "sync failed" }, 500);
  }
});

async function runSync(req: SyncRequest): Promise<SyncResult> {
  const sources = await dispatchFetch(req);

  const result: SyncResult = {
    provider: req.provider,
    fetched: sources.length,
    ingested: 0,
    skipped_unchanged: 0,
    chunk_count: 0,
    errors: [],
  };

  for (const src of sources) {
    try {
      const { source_id, skipped_unchanged } = await upsertCoreSource(src);
      if (skipped_unchanged) {
        result.skipped_unchanged += 1;
        continue;
      }
      if (req.skip_embed) {
        result.ingested += 1;
        continue;
      }

      const chunks = chunkClinicalText(src.content_text);
      if (!chunks.length) {
        result.ingested += 1;
        continue;
      }

      const embeddings = await embedCoreTexts(chunks.map((c) => c.content));
      const inserted = await insertChunks(source_id, chunks, embeddings);
      result.ingested += 1;
      result.chunk_count += inserted;
    } catch (e) {
      result.errors.push({
        provider_id: src.provider_id,
        message: (e as Error).message,
      });
    }
  }

  return result;
}

async function dispatchFetch(req: SyncRequest): Promise<NormalizedSource[]> {
  switch (req.provider) {
    // Phase 2 providers (drug labels + nomenclature + literature)
    case "openfda":
      return fetchOpenFdaLabels(req.opts as OpenFdaFetchOpts);
    case "dailymed":
      return fetchDailyMedSPLs(req.opts as DailyMedFetchOpts);
    case "rxnorm":
      return fetchRxNormConcept(req.opts as RxNormFetchOpts);
    case "pubmed_oa":
      return fetchPubMedOA(req.opts as PubMedFetchOpts);
    case "cdc":
      return fetchCdcPages(req.opts as CdcFetchOpts);
    case "drugbank_open":
      return ingestDrugBankOpenData(req.opts as DrugBankFetchOpts);
    // Phase 7 providers (guidelines + evidence syntheses)
    case "clinicaltrials":
      return fetchClinicalTrials(req.opts as ClinicalTrialsFetchOpts);
    case "livertox": {
      // Bulk path: opts.book_id → full book ingest via NCBI Bookshelf walker.
      // Default path: per-page list (LIVERTOX_PAGES seed).
      const opts = (req.opts ?? {}) as Record<string, unknown>;
      if (opts.book_id) {
        return fetchNcbiBook(opts as NcbiBookFetchOpts);
      }
      if (opts.bulk === true) {
        const liverTox = NCBI_BOOK_CATALOG.find(
          (b) => b.provider === "livertox",
        );
        if (liverTox) return fetchNcbiBook(liverTox);
      }
      return fetchLiverTox(
        (req.opts as LiverToxFetchOpts) ?? { pages: LIVERTOX_PAGES },
      );
    }
    case "pubchem":
      return fetchPubChemCompounds(req.opts as PubChemFetchOpts);
    case "ahrq":
      return fetchCuratedPages(
        curatedDefault(req.opts, "ahrq", "public_domain", AHRQ_PAGES),
      );
    case "uspstf":
      return fetchCuratedPages(
        curatedDefault(req.opts, "uspstf", "public_domain", USPSTF_PAGES),
      );
    case "nih_nhlbi":
      return fetchCuratedPages(
        curatedDefault(req.opts, "nih_nhlbi", "public_domain", NHLBI_PAGES),
      );
    case "va_dod":
      return fetchCuratedPages(
        curatedDefault(req.opts, "va_dod", "public_domain", VA_DOD_PAGES),
      );
    case "fda_safety":
      return fetchCuratedPages(
        curatedDefault(req.opts, "fda_safety", "fda_public", FDA_SAFETY_PAGES),
      );
    case "cdc_mmwr":
      return fetchCuratedPages(
        curatedDefault(req.opts, "cdc_mmwr", "public_domain", CDC_MMWR_PAGES),
      );
    case "fda_orange_book":
      return fetchCuratedPages(
        curatedDefault(
          req.opts,
          "fda_orange_book",
          "fda_public",
          FDA_ORANGE_PAGES,
        ),
      );
    case "lactmed": {
      const opts = (req.opts ?? {}) as Record<string, unknown>;
      if (opts.book_id) {
        return fetchNcbiBook(opts as NcbiBookFetchOpts);
      }
      if (opts.bulk === true) {
        const lactMed = NCBI_BOOK_CATALOG.find((b) => b.provider === "lactmed");
        if (lactMed) return fetchNcbiBook(lactMed);
      }
      return fetchCuratedPages(
        curatedDefault(req.opts, "lactmed", "public_domain", LACTMED_PAGES),
      );
    }
    case "openstax": {
      // Bulk path: opts.book → full book ingest via OpenStax JSON archive.
      // opts.bulk=true → iterate all OPENSTAX_BOOK_CATALOG entries.
      // Default path: curated page list.
      const opts = (req.opts ?? {}) as Record<string, unknown>;
      if (opts.book) {
        return fetchOpenStaxBook(opts as OpenStaxBookFetchOpts);
      }
      if (opts.bulk === true) {
        const all: NormalizedSource[] = [];
        for (const book of OPENSTAX_BOOK_CATALOG) {
          try {
            const sources = await fetchOpenStaxBook({ book });
            all.push(...sources);
          } catch (e) {
            console.warn(
              `OpenStax bulk ${book.slug} failed: ${(e as Error).message}`,
            );
          }
        }
        return all;
      }
      return fetchCuratedPages(
        curatedDefault(req.opts, "openstax", "cc_by", OPENSTAX_PAGES),
      );
    }
    case "pharmgkb":
      return fetchCuratedPages(
        curatedDefault(req.opts, "pharmgkb", "cc_by_sa", PHARMGKB_PAGES),
      );
    case "ncbi_bookshelf":
      return fetchCuratedPages(
        curatedDefault(
          req.opts,
          "ncbi_bookshelf",
          "cc_by",
          NCBI_BOOKSHELF_PAGES,
        ),
      );
    // Phase A (Cycle 1) — DiPiro-equivalent coverage gap closers
    case "dhhs_hiv":
      return fetchCuratedPages(
        curatedDefault(req.opts, "dhhs_hiv", "public_domain", DHHS_HIV_PAGES),
      );
    case "nci_pdq":
      return fetchCuratedPages(
        curatedDefault(req.opts, "nci_pdq", "public_domain", NCI_PDQ_PAGES),
      );
    case "orphanet":
      return fetchCuratedPages(
        curatedDefault(req.opts, "orphanet", "cc_by", ORPHANET_PAGES),
      );
    case "drugs_fda":
      return fetchDrugsFda((req.opts as DrugsFdaFetchOpts) ?? {});
    // Stubbed
    case "nih":
    case "medlineplus":
    case "oer":
    case "ascend_original":
      throw new Error(
        `provider=${req.provider} not yet implemented (Phase 6 backlog)`,
      );
    default:
      throw new Error(`unknown provider: ${req.provider}`);
  }
}

/**
 * Build CuratedPagesFetchOpts. If caller provided opts (with custom URL list),
 * pass through. Otherwise use the curated whitelist for the provider.
 */
function curatedDefault(
  opts: SyncRequest["opts"],
  provider: CoreSourceProvider,
  license: "public_domain" | "cc_by" | "cc_by_sa" | "fda_public" | "nlm_public",
  defaultPages: ReadonlyArray<{ url: string; title: string; topic?: string }>,
): CuratedPagesFetchOpts {
  if (opts && (opts as CuratedPagesFetchOpts).pages) {
    return {
      provider,
      license,
      pages: (opts as CuratedPagesFetchOpts).pages,
    };
  }
  return { provider, license, pages: defaultPages };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}
