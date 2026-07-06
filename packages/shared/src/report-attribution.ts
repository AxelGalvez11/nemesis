// NotebookLM-style Source Attribution: every generated artifact states what it was built
// from and how — deterministic counts from the citations it actually carries.
import type { Citation } from "./answer.ts";

function family(t: string): string {
  const p = t.toLowerCase();
  if (p.includes("pubmed") || p.includes("europepmc") || p.includes("openalex")) return "PubMed";
  if (p.includes("trial") || p.includes("nct")) return "trials";
  if (p.includes("fda") || p.includes("dailymed") || p.includes("faers")) return "FDA";
  if (p.includes("medlineplus")) return "guidance";
  return "other";
}

export function buildAttribution(input: { citations: Citation[]; generatedAt: string; engineVersion?: string; mode: string }): { headline: string; lines: string[] } {
  const order = ["PubMed", "trials", "FDA", "guidance", "other"];
  const counts = new Map<string, number>();
  for (const c of input.citations) counts.set(family(c.source_type), (counts.get(family(c.source_type)) ?? 0) + 1);
  const breakdown = order.filter((f) => counts.has(f)).map((f) => `${counts.get(f)} ${f}`).join(" · ");
  const metaParts = [
    `Method: ${input.mode}`,
    input.engineVersion ? `engine ${input.engineVersion}` : null,
    input.generatedAt ? `generated ${input.generatedAt}` : null,
  ].filter((part): part is string => part !== null);
  const meta = metaParts.join(" · ");
  return { headline: `Built from ${input.citations.length} source${input.citations.length === 1 ? "" : "s"}`, lines: [breakdown, meta] };
}
