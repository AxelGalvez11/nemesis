/**
 * Phase 2: RxNorm provider (NLM normalized drug nomenclature).
 *
 * API: https://rxnav.nlm.nih.gov/REST/
 * License: nlm_public (UMLS license required for commercial use; we
 * report annual usage to NLM each January per source-strategy.md ops
 * checklist).
 * Auth: none required. Rate limit: 20 req/sec.
 *
 * RxNorm is critical for query expansion in hybrid RAG: when a student
 * asks about "lisinopril", we expand to all related concepts (RxCUI,
 * brand names, ingredient form, dose form) before retrieval. Stored
 * here as Layer 1 nomenclature reference (not clinical narrative).
 */

import { sha256Hex } from "../embeddings.ts";
import type { NormalizedSource } from "../persist.ts";

const RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST";
const REQUEST_DELAY_MS = 100;

export interface RxNormFetchOpts {
  /** Drug name to look up (e.g. "lisinopril"). */
  name: string;
}

export async function fetchRxNormConcept(
  opts: RxNormFetchOpts,
): Promise<NormalizedSource[]> {
  const name = opts.name?.trim();
  if (!name) return [];

  // 1. Resolve name to RxCUI
  const rxcuiRes = await fetch(
    `${RXNORM_BASE}/rxcui.json?name=${encodeURIComponent(name)}&search=2`,
    { headers: { "User-Agent": "AscendBot/1.0" } },
  );
  if (!rxcuiRes.ok) return [];
  const rxcuiData = await rxcuiRes.json();
  const rxcuis: string[] = rxcuiData?.idGroup?.rxnormId ?? [];
  if (!rxcuis.length) return [];

  await sleep(REQUEST_DELAY_MS);

  const sources: NormalizedSource[] = [];
  for (const rxcui of rxcuis.slice(0, 5)) {
    // 2. Fetch all related concepts (ingredients, brands, dose forms)
    const allRes = await fetch(
      `${RXNORM_BASE}/rxcui/${rxcui}/allrelated.json`,
      {
        headers: { "User-Agent": "AscendBot/1.0" },
      },
    );
    if (!allRes.ok) continue;
    const allData = await allRes.json();
    const concepts = allData?.allRelatedGroup?.conceptGroup ?? [];

    const expansions: string[] = [];
    for (const group of concepts) {
      const tty = group.tty;
      const props = group.conceptProperties ?? [];
      for (const p of props) {
        expansions.push(`${tty}: ${p.name} [RxCUI ${p.rxcui}]`);
      }
    }
    if (!expansions.length) continue;

    const content_text = `RxNorm concept: ${name} (RxCUI ${rxcui})\n\n${expansions.join(
      "\n",
    )}`;

    sources.push({
      provider: "rxnorm",
      provider_id: rxcui,
      title: `RxNorm: ${name}`,
      subtitle: `RxCUI ${rxcui}`,
      source_url: `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/allrelated.json`,
      license: "nlm_public",
      content_text,
      content_hash: await sha256Hex(content_text),
      metadata: {
        rxcui,
        name,
        related_concept_count: expansions.length,
        related_ttys: Array.from(
          new Set(concepts.map((g: { tty: string }) => g.tty)),
        ),
      },
    });
    await sleep(REQUEST_DELAY_MS);
  }
  return sources;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
