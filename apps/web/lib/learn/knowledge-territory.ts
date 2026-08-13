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

import { quoteAnchor, type CanonicalSourceAnchor } from "@/lib/sources/source-context";

import type { CanvasSource, SourceExcerpt } from "./canvas-model";
import { knowledgeIdentityKey } from "./knowledge-identity";
import type { KnowledgeObject } from "./knowledge-types";

/** Bumped when the rules below change, so a territory built under old rules can be found. */
export const TERRITORY_VERSION = "territory/1";

/** Long enough for a real term or a short definition; short enough to reject a paragraph. */
const MAX_SIDE_CHARS = 120;

/** How much of an excerpt is quoted into a durable anchor.
 *
 *  Long enough to be distinctive inside its own unit, short enough that a reparse which reflows
 *  the paragraph still finds it. `resolveQuote` matches this back against the excerpt text. */
const ANCHOR_QUOTE_CHARS = 120;

/** Why a candidate was dropped. Named so a refusal can be counted and tested, never a bare skip. */
export type TerritoryRefusalReason =
  | "unreadable-response"
  | "missing-side"
  | "identical-sides"
  | "side-too-long"
  | "missing-roles"
  | "missing-relation-kind"
  | "restates-the-topic"
  | "duplicate"
  /** Grounded mode only: the candidate did not say which excerpt it was read from.
   *
   *  🔴 A REFUSAL RATHER THAN AN UNANCHORED OBJECT. When the model has been handed the learner's
   *  own material, a claim it cannot point at is a claim it did not read there — and storing it
   *  anyway would file model knowledge as though the lecture had said it. */
  | "missing-excerpt"
  /** Grounded mode only: the excerpt id names nothing in this canvas's material. A model naming
   *  an id we never showed it has invented the citation, and the pair with it. */
  | "unresolvable-excerpt"
  /** Grounded mode only: the excerpt resolved but carries no durable locator, so nothing later
   *  could find it again. Expected never to fire — every builder routes through
   *  `excerptsFromSourceContext`, which always records `unitId` — and kept because a field that
   *  quietly becomes absent is exactly how six structural fields have died at this codebase's
   *  boundaries. */
  | "unanchorable-excerpt";

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
  /** Grounded mode only: which excerpt of the learner's material this was read from. */
  excerptId?: unknown;
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Where a grounded pair sits, in both locator systems at once.
 *
 *  🔴 BOTH, NEVER ONE. `sourceRefs` is canvas-local (`s1:e7`) and is what a citation marker
 *  renders from; `sourceAnchors` is durable and quote-based and is what a SECOND canvas, or this
 *  one after a reparse, resolves against. Producing only the first would make the knowledge
 *  uncitable everywhere except the canvas that happened to mint it; producing only the second
 *  would leave the marker nothing to render today. */
interface Located {
  ref: { sourceId: string; excerptId: string };
  anchor: CanonicalSourceAnchor;
}

/**
 * Resolve an excerpt id the model named back to the material we actually showed it.
 *
 * 🔴 MATCHED ON THE CANVAS-LOCAL ID BECAUSE THAT IS WHAT THE MODEL WAS SHOWN. `groundingBlock`
 * prints `[s1:e7]`, so that is the only id a truthful answer can contain. The DURABLE id is then
 * read off the source it belongs to, which is the conversion `groundCanonicalAnchor` performs in
 * the opposite direction. Nothing here assumes the two strings are interchangeable.
 */
function locate(sources: readonly CanvasSource[], excerptId: string): Located | null | "unanchorable" {
  for (const source of sources) {
    const excerpt: SourceExcerpt | undefined = source.excerpts.find((candidate) => candidate.id === excerptId);
    if (!excerpt) continue;
    // A source with no library row cannot support a durable anchor, and an excerpt built before
    // units were recorded has nothing to anchor TO. Both are "we cannot honestly promise to find
    // this again", which is a refusal rather than a weaker object.
    if (!source.librarySourceId || !excerpt.unitId) return "unanchorable";
    return {
      anchor: {
        quote: quoteAnchor(excerpt.text, excerpt.text.slice(0, ANCHOR_QUOTE_CHARS)),
        sourceId: source.librarySourceId,
        unitId: excerpt.unitId,
      },
      ref: { excerptId: excerpt.id, sourceId: source.id },
    };
  }
  return null;
}

/**
 * Read a model's territory response into knowledge objects.
 *
 * 🔴 PURE, AND THAT IS WHAT MAKES THE RULES TESTABLE. No clock, no network, no model. Every
 * decision below is reproducible from the two strings handed in, so "would this candidate survive?"
 * is answerable in a unit test rather than by running a generation and hoping.
 */
export function parseTerritory(input: {
  text: string;
  topic: string;
  /**
   * The learner's own material, exactly as `groundingBlock` showed it to the model.
   *
   * 🔴 ITS PRESENCE IS WHAT SWITCHES THE LANE, AND THE TWO LANES HAVE DIFFERENT STANDARDS.
   * Absent, this is the topic constructor: no material exists, so no pair can carry an anchor and
   * `unanchoredProvenance: ["model"]` is the whole honest answer. Present, every surviving pair
   * MUST name an excerpt that resolves — because the model was holding the document, so a claim it
   * cannot point at is one it did not read there.
   *
   * 🔴 AND NEITHER LANE CHANGES IDENTITY. `knowledgeIdentityKey` hashes type, relation kind and the
   * pair, so the same fact met as a topic and later met in a lecture is ONE object that gains an
   * anchor, with the learner's demonstrations still attached. Enrich, never duplicate.
   */
  sources?: readonly CanvasSource[];
}): TerritoryResult {
  const objects: KnowledgeObject[] = [];
  const refusals: TerritoryRefusal[] = [];
  const grounded = (input.sources?.length ?? 0) > 0;

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

    // 🔴 GROUNDING IS CHECKED LAST, AFTER EVERY RULE THAT DOES NOT NEED THE MATERIAL. A pair that
    // fails on its own terms should be refused for THAT reason — reporting "unresolvable excerpt"
    // for a candidate whose sides were empty would misdescribe what the model actually did.
    let located: Located | null = null;
    if (grounded) {
      const excerptId = str(candidate.excerptId);
      if (!excerptId) {
        refusals.push({
          detail: `Candidate ${index + 1} named no excerpt, so nothing in the material supports it.`,
          reason: "missing-excerpt",
        });
        continue;
      }
      const found = locate(input.sources ?? [], excerptId);
      if (found === null) {
        // 🔴 THE HALLUCINATED CITATION, CAUGHT AT THE ONLY PLACE IT CAN BE. `groundingBlock`
        // prints every id we showed; an id that is not among them was invented, and a pair
        // resting on an invented citation is not evidence of anything in the learner's document.
        refusals.push({
          detail: `Candidate ${index + 1} cited "${excerptId}", which is not part of this canvas's material.`,
          reason: "unresolvable-excerpt",
        });
        continue;
      }
      if (found === "unanchorable") {
        refusals.push({
          detail: `Candidate ${index + 1} cited "${excerptId}", which carries no durable locator, so nothing could find it again.`,
          reason: "unanchorable-excerpt",
        });
        continue;
      }
      located = found;
    }

    const id = `${TERRITORY_VERSION}:${index + 1}`;
    const object: KnowledgeObject = {
      // 🔴 THE LANE IS RECORDED, AND IT IS NOT THE GRID LANE. A model read this out of the
      // learner's prose under an abstain-first contract; `table-row` would claim a deterministic
      // derivation that could be re-checked by reading the document, and this one cannot.
      ...(located ? { derivation: "model-prose" as const } : {}),
      extractionVersion: TERRITORY_VERSION,
      id,
      pair: { id, left, leftRole, right, rightRole },
      ...(located
        ? { provenance: { extractor: TERRITORY_VERSION, lane: "model-prose" as const } }
        : {}),
      relationKind,
      // 🔴 ANCHORED ONLY WHEN THERE IS SOMETHING REAL TO POINT AT, AND NEVER AN EMPTY ONE. Model
      // knowledge with no material behind it gets no anchor — a dangling anchor would let a
      // citation marker promise a source that does not exist, which is worse than no marker.
      ...(located ? { sourceAnchors: [located.anchor], sourceRefs: [located.ref] } : {}),
      statement: `${left} — ${right}`,
      type: "association",
      // 🔴 EMPTY WHEN ANCHORED, AND THAT IS THE CONTRACT RATHER THAN AN OMISSION. This field holds
      // only the ways of knowing that CANNOT carry an anchor; `sourceAnchors` is the single
      // authority for everything that can. Listing "model" beside a real anchor would put one fact
      // in two collections that are free to disagree.
      unanchoredProvenance: located ? [] : ["model"],
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
