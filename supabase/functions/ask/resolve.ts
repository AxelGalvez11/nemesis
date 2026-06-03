// Step 2: resolve entity mentions -> drug_entities via the Phase-2 search_entities
// RPC (brand->generic alias resolution). Dedupe by resolved id.

import type { DetectedEntity } from "../../../packages/shared/src/answer.ts";

interface SearchRow {
  type: string;
  id: string;
  name: string;
  score: number;
}

export async function resolveEntities(
  mentions: string[],
  sbUrl: string,
  serviceKey: string,
): Promise<DetectedEntity[]> {
  const out: DetectedEntity[] = [];
  const seen = new Set<string>();

  for (const mention of mentions) {
    const m = mention.trim();
    if (!m) continue;
    let top: SearchRow | undefined;
    try {
      const res = await fetch(`${sbUrl}/rest/v1/rpc/search_entities`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: m, max_results: 1 }),
      });
      if (res.ok) {
        const rows = await res.json() as SearchRow[];
        top = rows[0];
      }
    } catch {
      // resolution is best-effort; an unresolved mention still records the text
    }

    if (top) {
      if (seen.has(top.id)) continue;
      seen.add(top.id);
      out.push({ mention: m, entity_id: top.id, canonical_name: top.name });
    } else {
      out.push({ mention: m, entity_id: null, canonical_name: null });
    }
  }
  return out;
}
