// Per-claim Evidence Meter — DETERMINISTIC and design-weighted, never vote-counted.
// score = max over the claim's sources of (design weight × support multiplier), plus a
// small corroboration bonus for each ADDITIONAL supporting source (capped) — so one meta-
// analysis beats any pile of mentions, and extra real support nudges, never dominates.
import type { Citation } from "./answer.ts";

// Local digit-only tag normalizer (mirrors the shape of apps/web/lib/cite.ts's normTag without
// importing web code into the shared package — this package must stay pure/web-free).
const normTag = (t: string): string => t.replace(/\D/g, "");

export interface ClaimMeter {
  score: number; // 0-100
  label: "strong" | "moderate" | "limited" | "contested";
  basis: string; // plain-English one-liner for the tooltip
}

const DESIGN_WEIGHT: Array<{ re: RegExp; w: number; name: string }> = [
  { re: /meta-analysis|systematic review/i, w: 95, name: "meta-analysis/systematic review" },
  { re: /randomized controlled trial/i, w: 85, name: "randomized trial" },
  { re: /clinical trial/i, w: 70, name: "clinical trial" },
  { re: /cohort|observational|case-control/i, w: 55, name: "observational study" },
  { re: /review/i, w: 50, name: "review" },
  { re: /case report/i, w: 30, name: "case report" },
];

const SUPPORT_MULT: Record<string, number> = { direct: 1, partial: 0.75, weak: 0.45, background: 0.35, reviewed: 0.3 };

function designOf(c: Citation): { w: number; name: string } {
  const types = (c.publication_types ?? []).join(" ");
  for (const d of DESIGN_WEIGHT) if (d.re.test(types)) return { w: d.w, name: d.name };
  if (c.evidence_role === "official_label") return { w: 80, name: "official label" };
  if (c.study_type) return { w: 60, name: "registered trial record" };
  return { w: 45, name: "research article" };
}

export function meterForPoint(citationIds: string[] | undefined, citations: Citation[]): ClaimMeter | null {
  if (!citationIds?.length) return null;
  const byTag = new Map(citations.map((c) => [normTag(c.chunk_tag), c]));
  const used = citationIds.map((id) => byTag.get(normTag(id))).filter((c): c is Citation => !!c);
  if (!used.length) return null;

  const scored = used.map((c) => {
    const d = designOf(c);
    const mult = SUPPORT_MULT[c.support_level ?? "partial"] ?? 0.6;
    return { c, d, s: d.w * mult };
  }).sort((a, b) => b.s - a.s);

  const top = scored[0]!;
  const extraSupport = scored.slice(1).filter((e) => (e.c.support_level === "direct" || e.c.support_level === "partial")).length;
  const score = Math.round(Math.min(100, top.s + Math.min(10, extraSupport * 4)));

  const label: ClaimMeter["label"] = score >= 70 ? "strong" : score >= 50 ? "moderate" : "limited";
  const basis = `${top.d.name}${top.c.support_level ? ` · ${top.c.support_level} support` : ""}${extraSupport ? ` · corroborated by ${extraSupport} more` : ""}`;
  return { score, label, basis };
}
