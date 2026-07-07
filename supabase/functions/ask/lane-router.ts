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

// ---------------------------------------------------------------------------
// Lane 0.6 — general-assistant lane (gated GENERAL_ASSISTANT_LANE=on, DEFAULT OFF)
// ---------------------------------------------------------------------------
// A reasonable-but-off-topic request ("help me write a cover letter", "translate this to Spanish")
// is neither small talk, an emergency, a fresh-info lookup, nor a medical evidence question — today
// it gets force-fit into clinical retrieval and comes back as a stilted cited non-answer. This lane
// detects a clearly-general TASK and hands it a natural, helpful reply (finalizeGeneralAssistant),
// no medical framing, no citations. Runs after small-talk + fresh-info, after the quota consume
// (it does spend one cheap LLM call), before classify.
//
// SAFETY PROPERTY — positive signal required: this fires ONLY on an explicit general-task pattern
// (a make/write verb on a clearly non-health object, or an unambiguous general-knowledge shape).
// The mere ABSENCE of medical words is never enough. So a medical question that happens to slip
// past BIOMEDICAL_MARKERS still carries no general-task verb → never fires here → stays in the
// evidence pipeline with the full safety scan. Over-firing (answering a medical question without
// the scan) is the failure mode we design against; every guard errs toward NOT firing.

export function generalAssistantEnabled(): boolean {
  return Deno.env.get("GENERAL_ASSISTANT_LANE") === "on";
}

export interface GeneralAssistantDecision {
  fires: boolean;
  reason: "general_task" | null;
}

const NO_GENERAL: GeneralAssistantDecision = { fires: false, reason: null };

// A make/write/edit verb applied to a clearly NON-health object. Health-adjacent objects (meal plan,
// workout, diet, supplement routine) are deliberately EXCLUDED — those may carry real health content
// and belong in the evidence pipeline, not this lane.
const GENERAL_TASK =
  /\b(write|draft|compose|create|make|generate|build|design|plan|outline|summari[sz]e|translate|rewrite|reword|edit|proofread|brainstorm|help me (?:write|draft|make|create|build|plan|come up with))\b[\s\S]{0,40}\b(cover letter|resume|r[ée]sum[ée]|cv|curriculum vitae|e-?mail|essay|cover note|letter of intent|poem|short story|story|song|lyrics|screenplay|script|blog post|article|code|function|program|app|website|landing page|business plan|marketing plan|itinerary|travel plan|speech|toast|presentation|slide deck|pitch deck|tweet|thread|caption|instagram bio|headline|joke|spreadsheet|formula|regex|sql query)\b/i;

// Unambiguously general knowledge / utility requests with no plausible medical reading.
const GENERAL_KNOWLEDGE =
  /^\s*(?:what(?:'?s| is) the capital of\b|how do (?:i|you) say\b|translate\b|what does .{1,40} mean in (?:spanish|french|german|italian|japanese|chinese|korean|portuguese)|convert \d|what(?:'?s| is) \d[\d\s+\-*/.^%()]*\??$)/i;

export function detectGeneralAssistant(question: string): GeneralAssistantDecision {
  const q = question.trim();
  if (!q || q.length > 500) return NO_GENERAL;
  if (BIOMEDICAL_MARKERS.test(q)) return NO_GENERAL;
  if (mentionsKnownEntity(q)) return NO_GENERAL;
  if (CURRENT_EVENTS.test(q) || PERSON_QUESTION.test(q)) return NO_GENERAL; // fresh-info lane owns these
  if (GENERAL_TASK.test(q) || GENERAL_KNOWLEDGE.test(q)) return { fires: true, reason: "general_task" };
  return NO_GENERAL;
}
