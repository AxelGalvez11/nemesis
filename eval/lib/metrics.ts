// eval/lib/metrics.ts
// Pure retrieval metrics over a ranked list of ids vs a gold id set. Binary relevance.

export function recallAtK(ranked: string[], gold: Set<string>, k: number): number {
  if (gold.size === 0) return 0;
  let hits = 0;
  for (const id of ranked.slice(0, k)) if (gold.has(id)) hits++;
  return hits / gold.size;
}

export function dcgAtK(ranked: string[], gold: Set<string>, k: number): number {
  let dcg = 0;
  ranked.slice(0, k).forEach((id, i) => {
    if (gold.has(id)) dcg += 1 / Math.log2(i + 2); // position i+1 (1-indexed)
  });
  return dcg;
}

export function ndcgAtK(ranked: string[], gold: Set<string>, k: number): number {
  const dcg = dcgAtK(ranked, gold, k);
  const ideal = Math.min(gold.size, k);
  let idcg = 0;
  for (let i = 0; i < ideal; i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

export function mrr(ranked: string[], gold: Set<string>): number {
  for (let i = 0; i < ranked.length; i++) if (gold.has(ranked[i])) return 1 / (i + 1);
  return 0;
}

/** Mean of a numeric list; 0 for empty (so aggregates never NaN). */
export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
