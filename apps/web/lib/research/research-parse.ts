// Reading what the model sent back.
//
// 🔴 THIS IS THE BORDER, and it is the same border `deck-plan.ts` draws for slides: the model
// PROPOSES, and nothing it says becomes part of a report until this file has agreed to it. A
// research report's whole value is that its sentences are traceable, so the citation numbers are
// exactly the field a hallucination would be most damaging in and least visible in.
//
// Every reader here fails to a smaller answer rather than to an error. A malformed section is
// dropped and the rest of the report stands, because a report missing one section is worth having
// and a run that threw away twelve searches over a stray bracket is not.

import { RESEARCH_LIMITS, type ReportSection } from "./research-model";

/** The first balanced JSON object or array in the text, tolerating fences and stray prose. */
function jsonSlice(text: string): unknown {
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const start = text.indexOf(open);
    const end = text.lastIndexOf(close);
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // try the other bracket shape
    }
  }
  return null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Non-empty trimmed strings out of an unknown array, capped and length-limited. */
function stringList(value: unknown, cap: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, maxChars));
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * The plan.
 *
 * Returns null rather than a short list when the model gives fewer than the minimum: two
 * sub-questions is not a research plan, and running one anyway would produce a thin report that
 * looks like the evidence was thin.
 */
export function readSubQuestions(text: string): string[] | null {
  const parsed = jsonSlice(text);
  const raw = isObj(parsed) ? parsed.subQuestions : parsed;
  const list = stringList(raw, RESEARCH_LIMITS.maxSubQuestions, 300);
  return list.length >= RESEARCH_LIMITS.minSubQuestions ? list : null;
}

/** Search queries. Brave refuses anything over 400 characters or 50 words, so an over-long query
 *  would fall silently through to a slower provider; it is cheaper to trim here. */
export function readQueries(text: string, cap: number): string[] {
  const parsed = jsonSlice(text);
  const raw = isObj(parsed) ? parsed.queries : parsed;
  return stringList(raw, cap, 380).filter((q) => q.split(/\s+/).length <= 50);
}

/** Facts and follow-ups from one source. */
export function readExtraction(text: string): { facts: string[]; followUps: string[] } {
  const parsed = jsonSlice(text);
  if (!isObj(parsed)) return { facts: [], followUps: [] };
  return {
    facts: stringList(parsed.facts, RESEARCH_LIMITS.factsPerSource, 600),
    followUps: stringList(parsed.followUps, 2, 300),
  };
}

/**
 * The report body.
 *
 * 🔴 SUPPORT NUMBERS ARE RANGE-CHECKED AGAINST THE REAL POOL, and this is the load-bearing line in
 * the file. The model cites fact 7; if the pool has five facts, fact 7 is something it invented,
 * and rendering it would print a citation marker pointing at nothing. Out-of-range numbers are
 * dropped, and a point left with no support at all is dropped with them, because an uncited
 * sentence in a cited report is the one sentence a reader has no way to check.
 *
 * 1-BASED IN, 0-BASED OUT. The model counts from 1 because the prompt numbers the facts from 1;
 * everything downstream indexes an array. Getting this wrong would attach every sentence to the
 * wrong source while looking perfectly well-formed.
 */
export function readReportBody(
  text: string,
  poolSize: number,
): { summary: string; sections: ReportSection[]; gaps: string[] } | null {
  const parsed = jsonSlice(text);
  if (!isObj(parsed)) return null;
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 1500) : "";
  if (!summary) return null;

  const sections: ReportSection[] = [];
  if (Array.isArray(parsed.sections)) {
    for (const raw of parsed.sections) {
      if (!isObj(raw)) continue;
      const heading = typeof raw.heading === "string" ? raw.heading.trim().slice(0, 200) : "";
      if (!heading || !Array.isArray(raw.points)) continue;
      const points = [];
      for (const rawPoint of raw.points) {
        if (!isObj(rawPoint)) continue;
        const pointText = typeof rawPoint.text === "string" ? rawPoint.text.trim().slice(0, 1200) : "";
        if (!pointText) continue;
        const support = Array.isArray(rawPoint.support)
          ? [...new Set(rawPoint.support)]
            .filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= poolSize)
            .map((n) => n - 1)
          : [];
        if (!support.length) continue;
        points.push({ support, text: pointText });
      }
      if (points.length) sections.push({ heading, points });
    }
  }
  if (!sections.length) return null;
  return { gaps: stringList(parsed.gaps, 6, 400), sections, summary };
}

/** The verifier's answer. Anything unreadable counts as NOT supported: a check that fails open is
 *  not a check, and the cost of dropping one good sentence is far below the cost of keeping a
 *  fabricated one in a document the learner will quote. */
export function readVerdict(text: string): boolean {
  const parsed = jsonSlice(text);
  return isObj(parsed) && parsed.supported === true;
}
