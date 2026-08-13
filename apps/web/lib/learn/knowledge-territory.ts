// A topic, turned into knowledge Nemesis can teach from — the product's front door.
//
// 🔴 THIS EXISTS BECAUSE TYPING A TOPIC PRODUCED SOMETHING TO READ AND NOTHING TO DO. Uploading a
// document worked end to end; typing "teach me the top 35 drugs in pharmacy" — the primary way in —
// produced a generated lesson the policy could not own, so the learner got material and no task.
//
// 🔴 IT PRODUCES KNOWLEDGE OBJECTS, NEVER BLOCKS, AND THAT IS ENFORCED BY THE RETURN TYPE RATHER
// THAN BY A COMMENT. The failure being avoided is specific and was live: topic → generate a
// mini-textbook → extract knowledge back out of the text Nemesis just wrote. That pipeline
// launders a model's prose into something that looks like source material, and §M forbids it. This
// function cannot express it: it never sees `canvas.blocks` and cannot write one.
//
// 🔴 THE ABSTAIN BOUNDARY IS A SET OF NAMED VALIDATION RULES, NOT A CONFIDENCE SCORE. The model is
// never asked how sure it is. A self-reported confidence cannot be audited, cannot be reproduced,
// and produces a guard nothing can turn red — so it is not a guard. Every rule below is a structural
// property of the candidate, checkable without the model, and calibratable by constructing a
// violation and confirming the candidate is dropped.
//
// 🔴 AND A SMALLER CLEAN TERRITORY BEATS A FULL ONE. Returning nine solid pairs for a topic that
// named thirty-five is SUCCESS, not shortfall. Filling a quota by inventing attributes the model is
// unsure of puts false claims into a real learner's tables, where they become objectives, become
// questions, and become the learner's recorded gaps.

import { knowledgeIdentityKey } from "./knowledge-identity";
import type { KnowledgeObject } from "./knowledge-types";

/** Bumped when the rules below change, so a territory built under old rules can be found. */
export const TERRITORY_VERSION = "territory/1";

/** Long enough for a real term or a short definition; short enough to reject a paragraph. */
const MAX_SIDE_CHARS = 120;

/** Why a candidate was dropped. Named so a refusal can be counted and tested, never a bare skip. */
export type TerritoryRefusalReason =
  | "unreadable-response"
  | "missing-side"
  | "identical-sides"
  | "side-too-long"
  | "missing-roles"
  | "missing-relation-kind"
  | "restates-the-topic"
  | "duplicate";

export interface TerritoryRefusal {
  reason: TerritoryRefusalReason;
  detail: string;
}

export interface TerritoryResult {
  objects: KnowledgeObject[];
  refusals: TerritoryRefusal[];
}

const fold = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");

interface Candidate {
  left?: unknown;
  right?: unknown;
  leftRole?: unknown;
  rightRole?: unknown;
  relationKind?: unknown;
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Read a model's territory response into knowledge objects.
 *
 * 🔴 PURE, AND THAT IS WHAT MAKES THE RULES TESTABLE. No clock, no network, no model. Every
 * decision below is reproducible from the two strings handed in, so "would this candidate survive?"
 * is answerable in a unit test rather than by running a generation and hoping.
 */
export function parseTerritory(input: { text: string; topic: string }): TerritoryResult {
  const objects: KnowledgeObject[] = [];
  const refusals: TerritoryRefusal[] = [];

  let candidates: Candidate[];
  try {
    const parsed: unknown = JSON.parse(input.text);
    const list = Array.isArray(parsed)
      ? parsed
      : (parsed as { pairs?: unknown })?.pairs;
    if (!Array.isArray(list)) throw new Error("not a list");
    candidates = list as Candidate[];
  } catch {
    // 🔴 AN UNREADABLE RESPONSE PRODUCES NOTHING, NOT A SALVAGE ATTEMPT. Regex-scraping pairs out of
    // malformed JSON is how a half-parsed hallucination becomes a learner's objective.
    return {
      objects,
      refusals: [{
        detail: "The territory response was not a readable list of pairs, so nothing was taken from it.",
        reason: "unreadable-response",
      }],
    };
  }

  const topic = fold(input.topic);
  const seen = new Set<string>();

  for (const [index, candidate] of candidates.entries()) {
    const left = str(candidate.left);
    const right = str(candidate.right);
    const leftRole = str(candidate.leftRole);
    const rightRole = str(candidate.rightRole);
    const relationKind = str(candidate.relationKind);

    if (!left || !right) {
      refusals.push({ detail: `Candidate ${index + 1} was missing one side of the pair.`, reason: "missing-side" });
      continue;
    }
    if (fold(left) === fold(right)) {
      // Says nothing: asking someone to produce a term from itself measures nothing.
      refusals.push({ detail: `Candidate ${index + 1} had the same value on both sides.`, reason: "identical-sides" });
      continue;
    }
    if (left.length > MAX_SIDE_CHARS || right.length > MAX_SIDE_CHARS) {
      // A side this long is an explanation, and an explanation is not a retrievable pair.
      refusals.push({ detail: `Candidate ${index + 1} had a side longer than ${MAX_SIDE_CHARS} characters.`, reason: "side-too-long" });
      continue;
    }
    if (!leftRole || !rightRole) {
      // 🔴 ROLES ARE WHAT MAKE AN OBJECTIVE MEAN SOMETHING. Without them a capability can only say
      // "the left one", which is a property of how something was typeset rather than of the
      // knowledge — and the learner is asked to produce the BRAND, not the right-hand column.
      refusals.push({ detail: `Candidate ${index + 1} did not say what each side is.`, reason: "missing-roles" });
      continue;
    }
    if (!relationKind) {
      // 🔴 PART OF IDENTITY, NOT DECORATION. Identical strings can stand in different relationships,
      // and without this a term and its definition would converge with a term and its supplier.
      refusals.push({ detail: `Candidate ${index + 1} did not state how the two sides are related.`, reason: "missing-relation-kind" });
      continue;
    }
    if (fold(left) === topic || fold(right) === topic) {
      // 🔴 THE TOPIC IS NOT KNOWLEDGE ABOUT ITSELF. "top 35 drugs — losartan" is the request restated
      // as a fact, and a learner asked to produce it is being tested on what they just typed.
      refusals.push({ detail: `Candidate ${index + 1} restated the topic instead of naming something within it.`, reason: "restates-the-topic" });
      continue;
    }

    const id = `${TERRITORY_VERSION}:${index + 1}`;
    const object: KnowledgeObject = {
      extractionVersion: TERRITORY_VERSION,
      id,
      pair: { id, left, leftRole, right, rightRole },
      relationKind,
      // 🔴 NO `sourceAnchors`, AND NOT AN EMPTY ONE EITHER. Model knowledge has no excerpt, so it
      // gets no anchor — a dangling anchor would let a citation marker promise a source that does
      // not exist, which is worse than showing no marker at all.
      statement: `${left} — ${right}`,
      type: "association",
      // The one honest thing we can say about where this came from.
      unanchoredProvenance: ["model"],
    };

    const identityKey = knowledgeIdentityKey(object);
    if (seen.has(identityKey)) {
      // The same fact twice teaches nothing twice, and would make one objective look like two.
      refusals.push({ detail: `Candidate ${index + 1} repeated a pair already in this territory.`, reason: "duplicate" });
      continue;
    }
    seen.add(identityKey);
    objects.push({ ...object, identityKey });
  }

  return { objects, refusals };
}
