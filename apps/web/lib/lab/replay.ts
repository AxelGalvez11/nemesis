/**
 * What changed since a case was saved — Nemesis Lab §14.
 *
 * 🔴🔴 A RERUN REPORTS DRIFT; IT DOES NOT PASS OR FAIL. A case is saved BECAUSE the behaviour is
 * wrong, so recording the observation as an expectation would build a guard that goes red the day
 * someone fixes the defect — the exact inversion this repo has already shipped once, where a guard
 * rejected a fix for succeeding. So the question a rerun answers is "is it still doing that?", and
 * the answer is a list of differences plus the owner's own note about which way is better.
 *
 * 🔴 AND "NO DIFFERENCE" IS ONLY MEANINGFUL IF THE RERUN ACTUALLY RAN. `ran: false` exists for the
 * same reason it exists in `compare.ts`: an empty difference list from a rerun that never happened
 * is indistinguishable from a rerun that found everything unchanged.
 *
 * PURE. No React, no I/O.
 */

export interface Drift {
  field: string;
  before: string;
  after: string;
}

export interface ReplayResult {
  ran: boolean;
  note: string | null;
  drift: Drift[];
}

const NOTHING = "(not recorded when this case was saved)";

function show(value: unknown): string {
  if (value === null || value === undefined) return "none";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Compare two flat fact maps, reporting only fields that differ.
 *
 * A field present now and absent in the baseline is reported as new rather than skipped — a case
 * saved before a measurement existed must not make that measurement invisible for ever.
 */
export function driftBetween(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown>,
): Drift[] {
  const drift: Drift[] = [];
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  for (const field of [...fields].sort()) {
    const was = before && field in before ? show(before[field]) : NOTHING;
    const now = field in after ? show(after[field]) : "none";
    if (was !== now) drift.push({ after: now, before: was, field });
  }
  return drift;
}

/** The facts a parser case is compared on. Structure first; characters last and never alone. */
export function parserFacts(input: {
  counts: Record<string, unknown> | null;
  coverageState: string | null;
  routeReason: string | null;
  readBy: string | null;
  characters: number | null;
  outcome: string;
}): Record<string, unknown> {
  return {
    blocks: input.counts?.blocks ?? null,
    characters: input.characters,
    coverageState: input.coverageState,
    equations: input.counts?.equations ?? null,
    figures: input.counts?.figures ?? null,
    figuresUnexamined: input.counts?.figuresUnexamined ?? null,
    headings: input.counts?.headings ?? null,
    outcome: input.outcome,
    readBy: input.readBy,
    routeReason: input.routeReason,
    tableCells: input.counts?.tableCells ?? null,
    tables: input.counts?.tables ?? null,
    units: input.counts?.units ?? null,
  };
}

/** The facts a tutor case is compared on. */
export function tutorFacts(input: {
  strategy: string | null;
  action: string | null;
  objective: string | null;
  refusal: string | null;
  verdict: string | null;
  errorType: string | null;
}): Record<string, unknown> {
  return {
    action: input.action,
    errorType: input.errorType,
    objective: input.objective,
    refusal: input.refusal,
    strategy: input.strategy,
    verdict: input.verdict,
  };
}
