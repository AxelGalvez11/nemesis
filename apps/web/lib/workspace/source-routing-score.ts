// Scoring one turn's source plan against what the case says it was entitled to.
//
// Separate from both the case table and the engine so the numbers in a PR
// description mean the same thing every time, and so the metric maths can be
// unit-tested without routing anything.
//
// The four metrics here are the COUNTABLE ones (owner 2026-08-06: over-search,
// under-search, wrong-source, unnecessary tool calls). Query quality, source
// quality, citation correctness and answer quality need a model to judge and
// deliberately live elsewhere — mixing a flaky judge into a gate is how a gate
// stops being trusted.

import type { RoutingCase, SourceExpectation } from "./source-routing-cases";

/**
 * What a turn actually did.
 *
 * 🔴 `null` MEANS "NOT KNOWABLE HERE", AND IT IS NOT A CONVENIENCE. A harness
 * with no model in it can prove a private source was UNREACHABLE — its tools
 * never rode the turn, so no answer could have come from it — but it cannot
 * prove one went UNUSED: a tool that was offered and declined looks exactly
 * like a tool that was offered and called. Scoring `null` as `false` would
 * fail every "must not touch the Library" case for turns that never touched
 * it, and the resulting rate would libel the engine.
 *
 * So the scorer skips `null`, and the deterministic suite claims only what it
 * can see. Proving a private source went unused needs the model in the loop.
 */
export interface ObservedSources {
  /** The live web was consulted (a paid search ran). Always knowable: the
   *  fetch either happened before the turn or it did not. */
  web: boolean;
  /** The student's Library/sources. */
  library: boolean | null;
  /** Calendar/syllabus. */
  schedule: boolean | null;
}

export interface CaseVerdict {
  ask: string;
  hard: boolean;
  /** Searched the web when the case forbade it. */
  overSearched: boolean;
  /** Did not search when the case required it. */
  underSearched: boolean;
  /** Went to the wrong place: the private answer was required and missing,
   *  while the web was used instead. The defect the owner named — "prefer the
   *  correct source for the user's intent". */
  wrongSource: boolean;
  /** Every source touched that the case forbade. The owner's "unnecessary tool
   *  calls", counted rather than rated. */
  unnecessary: number;
  /** Every source the case required and the turn did not reach. */
  missing: number;
  passed: boolean;
  /** This case had something to say about private sources AND the harness
   *  could see it. Rates divide by this rather than by the table, so a metric
   *  never counts a case it was blind to as a silent pass. */
  privateScored: boolean;
}

function violates(expectation: SourceExpectation, used: boolean | null): "over" | "under" | null {
  if (used === null) return null;
  if (expectation === "forbidden" && used) return "over";
  if (expectation === "required" && !used) return "under";
  return null;
}

export function scoreCase(testCase: RoutingCase, observed: ObservedSources): CaseVerdict {
  const web = violates(testCase.web, observed.web);
  const library = violates(testCase.library, observed.library);
  const schedule = violates(testCase.schedule, observed.schedule);

  const unnecessary = [web, library, schedule].filter((verdict) => verdict === "over").length;
  const missing = [web, library, schedule].filter((verdict) => verdict === "under").length;
  // Wrong-source is deliberately NOT "any private miss". It is the specific
  // substitution the owner described: the student's own material was the right
  // place, the turn did not go there, and it went to the web instead. A turn
  // that simply answered from model knowledge is under-retrieval, not
  // mis-routing, and calling both the same number hides which one is happening.
  const privateRequired = testCase.library === "required" || testCase.schedule === "required";
  const privateMissed = library === "under" || schedule === "under";
  const wrongSource = privateRequired && privateMissed && observed.web;
  const privateScored = privateRequired
    && (testCase.library === "required" ? observed.library !== null : true)
    && (testCase.schedule === "required" ? observed.schedule !== null : true);

  return {
    ask: testCase.ask,
    hard: testCase.hard === true,
    missing,
    overSearched: web === "over",
    passed: unnecessary === 0 && missing === 0,
    privateScored,
    underSearched: web === "under",
    unnecessary,
    wrongSource,
  };
}

export interface RoutingReport {
  total: number;
  passed: number;
  /** Share of turns that searched when the case forbade it, over the turns that
   *  forbade it. A rate over the whole table would move whenever the table's
   *  mix changed, which makes two runs incomparable. */
  overSearchRate: number;
  underSearchRate: number;
  wrongSourceRate: number;
  /** Total forbidden sources touched across the table. */
  unnecessaryCalls: number;
  failures: CaseVerdict[];
}

const rate = (numerator: number, denominator: number): number => (denominator === 0 ? 0 : numerator / denominator);

export function scoreRouting(cases: RoutingCase[], observe: (testCase: RoutingCase) => ObservedSources): RoutingReport {
  const verdicts = cases.map((testCase) => scoreCase(testCase, observe(testCase)));
  const forbidsWeb = cases.filter((testCase) => testCase.web === "forbidden").length;
  const requiresWeb = cases.filter((testCase) => testCase.web === "required").length;
  // Divided by the cases the harness could actually SEE, not by the whole
  // table: counting a case the harness was blind to as a pass reports a
  // healthier number than anybody measured.
  const scoredPrivate = verdicts.filter((verdict) => verdict.privateScored).length;

  return {
    failures: verdicts.filter((verdict) => !verdict.passed),
    overSearchRate: rate(verdicts.filter((verdict) => verdict.overSearched).length, forbidsWeb),
    passed: verdicts.filter((verdict) => verdict.passed).length,
    total: verdicts.length,
    underSearchRate: rate(verdicts.filter((verdict) => verdict.underSearched).length, requiresWeb),
    unnecessaryCalls: verdicts.reduce((sum, verdict) => sum + verdict.unnecessary, 0),
    wrongSourceRate: rate(verdicts.filter((verdict) => verdict.wrongSource).length, scoredPrivate),
  };
}

/** One line per metric, for a PR description or a CI log. */
export function formatRoutingReport(label: string, report: RoutingReport): string {
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  return [
    `${label}: ${report.passed}/${report.total} cases pass`,
    `  over-search rate    ${percent(report.overSearchRate)}`,
    `  under-search rate   ${percent(report.underSearchRate)}`,
    `  wrong-source rate   ${percent(report.wrongSourceRate)}`,
    `  unnecessary calls   ${report.unnecessaryCalls}`,
  ].join("\n");
}
