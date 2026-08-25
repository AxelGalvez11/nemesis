// What a deep-research run is made of.
//
// A run is NOT a chat answer. It is a saved, cited REPORT: the question is broken into parts, each
// part is searched, every fact keeps the one passage it came from, and every sentence in the
// finished report is checked back against that passage before it is allowed to stand.
//
// 🔴 ONE FACT, ONE SOURCE, AND THE SOURCE'S OWN WORDS TRAVEL WITH IT. This is the invariant the
// whole design rests on. A learning carries `passage` — the text the search actually returned —
// and never the model's paraphrase of it, so a fabricated fact cannot ground itself: `verify.ts`
// reads the passage, not the claim. The PharmaOrb engine got this right and it is the one piece of
// it worth carrying over wholesale.
//
// 🔴 AND THE HONEST LIMIT, WRITTEN DOWN RATHER THAN GLOSSED. `passage` is the extract the search
// provider returned (Brave's llm/context gives up to ~1,200 characters of real page text), not the
// whole page. So a verified claim means "the retrieved passage says this", NOT "the page is true"
// and not "we read the whole page". Anything the report says about its own reliability has to be
// true at that strength and no stronger.

export interface ResearchLearning {
  /** One atomic fact. Numbers, names and dates preserved exactly as the passage gave them. */
  fact: string;
  /** The single page it came from. */
  url: string;
  title: string;
  /** 🔴 The source's OWN text, never the model's words. See the header. */
  passage: string;
  /** Which sub-question was being asked when this turned up. */
  subQuestion: string;
}

/**
 * A sentence in the finished report, with what backs it.
 *
 * 🔴 `support` MEANS TWO DIFFERENT THINGS AT TWO POINTS IN THE RUN, and the handover is deliberate.
 * While the report is being checked it indexes the FACT POOL, because verification needs the
 * passage behind each fact. In the finished report it indexes `sources`, because a reader needs the
 * numbered list at the bottom. `run-research.ts` converts it exactly once, at the end, and nothing
 * outside that file ever sees the first meaning.
 */
export interface ReportPoint {
  text: string;
  /** Indices into `ResearchReport.sources`. A point that ends up with none is never rendered. */
  support: number[];
}

export interface ReportSection {
  heading: string;
  points: ReportPoint[];
}

/** One source as the report lists it. */
export interface ReportSource {
  url: string;
  title: string;
  /** From `rankSource` — shown so a reader can weigh it themselves. */
  rank: string;
}

export interface ResearchReport {
  question: string;
  /** The plain answer, first, before any structure. */
  summary: string;
  /** What it actually went and asked, surfaced so the reader can see the shape of the search. */
  subQuestions: string[];
  sections: ReportSection[];
  /** Where the evidence ran out or disagreed. Never empty by convention: silence about gaps reads
   *  as confidence nobody earned. */
  gaps: string[];
  sources: ReportSource[];
  /** Counts, for the honest footer: how much was found, how much survived verification. */
  stats: { searched: number; found: number; kept: number; dropped: number };
}

/** Progress, for the strip the learner watches. Each step names work genuinely running — the same
 *  rule the canvas's thinking captions live under. */
export type ResearchStep =
  | { kind: "planning" }
  | { kind: "searching"; subQuestion: string; done: number; total: number }
  | { kind: "reading"; url: string }
  | { kind: "writing" }
  | { kind: "checking"; done: number; total: number };

export type OnResearchStep = (step: ResearchStep) => void;

/** How wide and how deep a run goes. Every number here costs money and wall-clock, so they live in
 *  one place with the reason attached rather than scattered as literals. */
export const RESEARCH_LIMITS = {
  /** Sub-questions the planner may produce. Below 3 a "report" is just an answer; above 6 the
   *  searches overlap so heavily that the extra breadth is spent re-reading the same pages. */
  maxSubQuestions: 5,
  minSubQuestions: 3,
  /** Search queries per sub-question. */
  queriesPerSubQuestion: 1,
  /**
   * 🔴 A HARD TOTAL, AND IT IS A COST CEILING RATHER THAN A QUALITY KNOB.
   *
   * Web search is metered by the valve in units, and the binding limit is MONTHLY, not daily: the
   * paid plan carries 150 units a month (checked against plan_entitlements, 2026-08-25) and every
   * search in a research run spends one of them. At two queries per sub-question a run cost ten,
   * so fifteen runs would have left a paying student with NO web search for the rest of the month,
   * including in ordinary chat, with nothing telling them why. That is not a thin report, it is a
   * broken product for three weeks.
   *
   * Six keeps a run at roughly a twenty-fifth of the month and leaves chat its share. Breadth is
   * barely touched, because each search returns up to `resultsPerQuery` pages: six searches can
   * still surface thirty-six distinct sources, and the real probe produced a usable report from
   * six pages.
   */
  maxSearches: 6,
  /** Results kept per query. The provider's own ceiling still applies above this. */
  resultsPerQuery: 6,
  /** Facts one source may contribute. More than this from a single page and the report is a
   *  summary of that page rather than a synthesis. */
  factsPerSource: 3,
  /** Total facts, hard stop, so a runaway search cannot blow the model's context. */
  maxLearnings: 60,
  /** Searches in flight at once. The valve meters per unit; this is about not hammering it. */
  concurrency: 3,
} as const;
