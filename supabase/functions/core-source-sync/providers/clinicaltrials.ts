/**
 * Phase 7: ClinicalTrials.gov provider.
 *
 * API: https://clinicaltrials.gov/api/v2/studies (no auth required).
 * License: public_domain (NLM, US federal work).
 *
 * Pulls trial registration + structured outcome data. Useful for
 * evidence-based dosing and outcome citations on Ascend cards.
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../normalized-source.ts";

const BASE = "https://clinicaltrials.gov/api/v2/studies";
const REQUEST_DELAY_MS = 200;

export interface ClinicalTrialsFetchOpts {
  /** Search query (drug name, condition, NCT id). */
  query: string;
  /** Page size (default 20, hard cap 100). */
  pageSize?: number;
}

interface CTGovStudy {
  protocolSection?: {
    identificationModule?: {
      nctId?: string;
      briefTitle?: string;
      officialTitle?: string;
    };
    statusModule?: {
      overallStatus?: string;
      lastUpdatePostDateStruct?: { date?: string };
    };
    designModule?: {
      studyType?: string;
      phases?: string[];
    };
    armsInterventionsModule?: {
      interventions?: Array<{ type: string; name: string }>;
    };
    conditionsModule?: { conditions?: string[] };
    descriptionModule?: { briefSummary?: string; detailedDescription?: string };
    outcomesModule?: {
      primaryOutcomes?: Array<{ measure: string; description?: string }>;
      secondaryOutcomes?: Array<{ measure: string; description?: string }>;
    };
  };
  resultsSection?: {
    moreInfoModule?: { limitationsAndCaveats?: { description?: string } };
  };
}

export async function fetchClinicalTrials(
  opts: ClinicalTrialsFetchOpts,
): Promise<NormalizedSource[]> {
  const pageSize = Math.min(opts.pageSize ?? 20, 100);

  const params = new URLSearchParams({
    "query.term": opts.query,
    pageSize: String(pageSize),
    countTotal: "true",
    format: "json",
  });

  const res = await fetch(`${BASE}?${params.toString()}`, {
    headers: { "User-Agent": "AscendBot/1.0" },
  });
  if (!res.ok) {
    throw new Error(
      `ClinicalTrials.gov ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  const data = await res.json();
  const studies: CTGovStudy[] = data?.studies ?? [];

  await sleep(REQUEST_DELAY_MS);

  const sources: NormalizedSource[] = [];
  for (const s of studies) {
    const normalized = await normalize(s);
    if (normalized) sources.push(normalized);
  }
  return sources;
}

async function normalize(s: CTGovStudy): Promise<NormalizedSource | null> {
  const ident = s.protocolSection?.identificationModule;
  if (!ident?.nctId) return null;

  const conditions =
    s.protocolSection?.conditionsModule?.conditions?.join(", ") ?? "";
  const interventions =
    s.protocolSection?.armsInterventionsModule?.interventions
      ?.map((i) => `${i.type}: ${i.name}`)
      .join("; ") ?? "";
  const primary =
    s.protocolSection?.outcomesModule?.primaryOutcomes
      ?.map((o) => `${o.measure}${o.description ? ` — ${o.description}` : ""}`)
      .join("\n") ?? "";
  const secondary =
    s.protocolSection?.outcomesModule?.secondaryOutcomes
      ?.map((o) => `${o.measure}${o.description ? ` — ${o.description}` : ""}`)
      .join("\n") ?? "";

  const sections: string[] = [];
  sections.push(
    `TRIAL ${ident.nctId}\n\n${ident.officialTitle ?? ident.briefTitle}`,
  );
  if (conditions) sections.push(`CONDITIONS\n\n${conditions}`);
  if (interventions) sections.push(`INTERVENTIONS\n\n${interventions}`);
  if (s.protocolSection?.descriptionModule?.briefSummary) {
    sections.push(
      `BRIEF SUMMARY\n\n${s.protocolSection.descriptionModule.briefSummary}`,
    );
  }
  if (primary) sections.push(`PRIMARY OUTCOMES\n\n${primary}`);
  if (secondary) sections.push(`SECONDARY OUTCOMES\n\n${secondary}`);

  const content_text = sections.join("\n\n");
  if (!content_text.trim()) return null;

  return {
    provider: "clinicaltrials",
    provider_id: ident.nctId,
    title: ident.briefTitle ?? `Trial ${ident.nctId}`,
    subtitle: ident.officialTitle,
    source_url: `https://clinicaltrials.gov/study/${ident.nctId}`,
    license: "public_domain",
    content_text,
    content_hash: await sha256Hex(content_text),
    metadata: {
      nct_id: ident.nctId,
      status: s.protocolSection?.statusModule?.overallStatus ?? null,
      study_type: s.protocolSection?.designModule?.studyType ?? null,
      phases: s.protocolSection?.designModule?.phases ?? [],
      conditions: s.protocolSection?.conditionsModule?.conditions ?? [],
    },
    effective_at:
      s.protocolSection?.statusModule?.lastUpdatePostDateStruct?.date ??
      undefined,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
