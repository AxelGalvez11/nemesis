// Lane router — the fresh-info lane (lane 0.5 of the 4-lane router, gated LANE_ROUTER=on).
//
// The rigid-engine fix (docs/research/chatgpt-openevidence-routing-2026-07.md §5): a question like
// "who is Matt Turner" or "what are the World Cup times" is neither small talk nor answerable from
// the medical evidence corpus — force-fitting it into clinical retrieval produces a nonsense cited
// answer. This lane detects such questions DETERMINISTICALLY and returns an honest "this needs live
// web info" reply instead (finalizeFreshInfo in index.ts), with no LLM call and no quota spend.
//
// Ordering contract: runs AFTER preScreen (emergencies already hard-routed) and AFTER the
// small-talk short-circuit, BEFORE quota + classify. Fail-safe by construction: any biomedical
// marker or any known drug/supplement/condition entity in the question keeps it in the normal
// evidence pipeline — under-firing costs nothing (today's behavior), over-firing would eat a real
// medical question, so every guard errs toward NOT firing.

import { isKnownEntityMention } from "./entity-intelligence.ts";

export function laneRouterEnabled(): boolean {
  return Deno.env.get("LANE_ROUTER") === "on";
}

export interface FreshInfoDecision {
  fires: boolean;
  /** Which detector matched — stored in the trace for observability. */
  reason: "current_events" | "person_lookup" | null;
}

const NO_FIRE: FreshInfoDecision = { fires: false, reason: null };

// Any of these keeps the question in the evidence pipeline. Deliberately broad: one marker word is
// enough to disqualify the fresh-info lane, because a false fire (refusing a real medical question)
// is far worse than a false pass (today's over-eager retrieval).
const BIOMEDICAL_MARKERS =
  /\b(drugs?|medications?|medicines?|pills?|doses?|dosage|dosing|mg|mcg|iu|supplements?|vitamins?|peptides?|side effects?|interactions?|contraindicat\w*|safe to take|taking|pregnan\w*|breastfeed\w*|symptoms?|diagnos\w*|treatments?|therapy|diseases?|conditions?|cancer|diabetes|blood pressure|cholesterol|heart|liver|kidney|fda|label|pubmed|clinical trials?|study|studies|evidence|health|medical|doctor|pharmacist|prescri\w*)\b/i;

// Live-info question shapes our corpus can never answer: sports schedules/results, elections,
// markets, entertainment releases, weather, breaking news.
const CURRENT_EVENTS =
  /\b(world cup|super bowl|olympics|playoffs?|kick-?off|final score|who won|game (?:time|times|schedule)|match (?:time|times|schedule)|fixtures?|standings|tournament|election|president(?:ial)? (?:race|debate|poll)|prime minister|stock (?:price|market)|share price|crypto(?:currency)?|bitcoin|net worth|box office|movie (?:release|premiere)|album (?:release|drop)|tour dates?|concert tickets?|weather (?:today|tomorrow|forecast)|(?:latest|breaking|today'?s) news)\b/i;

// "who is <Name>" / "who was <Name>" with a 2-4 word name and nothing else. The entity guard below
// still runs on every token, so "who is semaglutide" never reaches the fire path via this shape.
const PERSON_QUESTION = /^\s*who\s+(?:is|was|are)\s+[a-z][a-z.'-]*(?:\s+[a-z][a-z.'-]*){1,3}\s*\??\s*$/i;

/** True when any word of the question resolves in the authoritative entity table (drug/supplement/
 *  peptide/condition/consumer product). One known entity = it belongs in the evidence pipeline. */
function mentionsKnownEntity(question: string): boolean {
  const words = question.toLowerCase().split(/[^a-z0-9'-]+/).filter((w) => w.length > 2);
  return words.some((w) => isKnownEntityMention(w));
}

export function detectFreshInfo(question: string): FreshInfoDecision {
  const q = question.trim();
  if (!q || q.length > 400) return NO_FIRE; // long messages carry too much context to snap-judge
  if (BIOMEDICAL_MARKERS.test(q)) return NO_FIRE;
  if (mentionsKnownEntity(q)) return NO_FIRE;
  if (CURRENT_EVENTS.test(q)) return { fires: true, reason: "current_events" };
  if (PERSON_QUESTION.test(q)) return { fires: true, reason: "person_lookup" };
  return NO_FIRE;
}
