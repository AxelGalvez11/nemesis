/**
 * Starting learner conditions — Nemesis Lab §11.
 *
 * 🔴🔴 THERE IS NO SEPARATE FAKE LEARNER MODEL, AND THAT IS THE WHOLE DESIGN. Each condition below
 * is a list of `EvidenceToRecord` rows — the exact type `use-policy-runtime.ts` writes after a real
 * answer — sent through the real `recordEvidence` under the lab learner's own JWT, and read back by
 * the real `projectLearnerState`. "Partially known" is not a flag; it is two demonstrations, one of
 * them partial, because that is what partially known IS in this system.
 *
 * 🔴 THE ROWS SAY THEY ARE SEEDED, IN A FIELD THAT CANNOT BE MISTAKEN FOR A REAL ANSWER.
 * `responseText` carries a plain sentence saying the Lab wrote it, and `responseId` carries the
 * `lab-seed:` prefix. So a debug panel, a query or a future reader can always tell a condition the
 * owner chose from a demonstration a person actually made. Seeding evidence that claimed to be a
 * learner's own work would corrupt the one log the whole product treats as truth.
 *
 * 🔴 AND THE MISCONCEPTION IS THE ONE FIELD THAT MAY NOT BE INVENTED FREELY. `misconceptions` is
 * "competing beliefs a judge actually observed", and a controller must never teach against a
 * mistake nobody made. Here the owner is explicitly asking for that state, so it is legitimate —
 * but it is written as a seeded row, wearing its provenance, for exactly that reason.
 *
 * PURE. Building rows only; the write is the caller's.
 */

import type { EvidenceToRecord } from "@/lib/learn/learner-store";

export type LabCondition = "unknown" | "partial" | "established" | "misconception";

export const LAB_CONDITIONS: readonly { id: LabCondition; label: string; blurb: string }[] = [
  { blurb: "No evidence at all. Nemesis has never asked about this.", id: "unknown", label: "Unknown" },
  {
    blurb: "One partial answer, then one understood. Shown something, not shown it reliably.",
    id: "partial",
    label: "Partially known",
  },
  {
    blurb: "Three clean demonstrations over several days, the last two strong.",
    id: "established",
    label: "Established",
  },
  {
    blurb: "A wrong answer where the judge named a competing belief the learner holds.",
    id: "misconception",
    label: "Known misconception",
  },
];

/** The prefix every seeded response id carries, so seeded rows are always identifiable. */
export const LAB_SEED_PREFIX = "lab-seed:";

const SEEDED_TEXT = "Seeded by Nemesis Lab as a starting condition. Not a real answer.";

/**
 * The rows one condition is, for one objective.
 *
 * `now` is passed in rather than read from the clock so a caller can build a reproducible
 * regression case, and so this stays pure.
 */
export function conditionEvidence(input: {
  condition: LabCondition;
  objectiveRowId: string;
  canvasId: string | null;
  now: Date;
  /** The belief to record as competing, for the misconception condition. */
  misconception?: string;
}): EvidenceToRecord[] {
  const { canvasId, condition, now, objectiveRowId } = input;
  const at = (minutesAgo: number): string => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  const base = (suffix: string, minutesAgo: number) => ({
    canvasId,
    objectiveRowId,
    occurredAt: at(minutesAgo),
    // 🔴 STABLE PER (OBJECTIVE, CONDITION, SLOT). `recordEvidence` upserts on `response_id`, so
    // re-applying the same condition twice is a no-op rather than a doubled demonstration — which
    // is what makes the control idempotent instead of a way to inflate a learner's history.
    responseId: `${LAB_SEED_PREFIX}${condition}:${objectiveRowId}:${suffix}`,
    responseText: SEEDED_TEXT,
  });

  if (condition === "unknown") return [];

  if (condition === "partial") {
    return [
      { ...base("a", 90), confidence: 0.5, demonstrationObtained: true, verdict: "partial" as const },
      { ...base("b", 45), confidence: 0.8, demonstrationObtained: true, verdict: "understood" as const },
    ];
  }

  if (condition === "established") {
    return [
      { ...base("a", 60 * 24 * 3), confidence: 0.9, demonstrationObtained: true, verdict: "understood" as const },
      { ...base("b", 60 * 24 * 2), confidence: 0.9, demonstrationObtained: true, verdict: "strong" as const },
      { ...base("c", 60 * 12), confidence: 0.95, demonstrationObtained: true, verdict: "strong" as const },
    ];
  }

  return [
    {
      ...base("a", 30),
      confidence: 0.8,
      // 🔴 A WRONG ANSWER IS STILL A DEMONSTRATION OBTAINED: they produced something and it was
      // marked. `false` means the opportunity passed with nothing produced, which is a different
      // state and would seed the wrong condition entirely.
      demonstrationObtained: true,
      errorType: "conceptual" as const,
      misconceptions: [input.misconception ?? "holds a competing belief about this"],
      // 🔴 `misconception`, NOT `incorrect`. The evidence vocabulary distinguishes them, and the
      // controllers read the difference: incorrect is "fell short", misconception is "believes
      // something else instead", and only the second licenses teaching against a competing belief.
      verdict: "misconception" as const,
    },
  ];
}
