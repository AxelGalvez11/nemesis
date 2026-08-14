// A model's causal reading of the learner's own material, turned into grounded knowledge objects.
//
// 🔴 THE MISSING CALLER, NOT A NEW LANE. `causal-extraction-contract.ts` has existed with a prompt,
// a validator that rejects fabrication five ways, and a constructor that records provenance — and
// `causalKnowledgeFrom` had ZERO production callers. Everything needed to read a mechanism out of a
// lecture was built, tested, and never invoked, so every real document reached the learner as word
// pairs or as nothing. This is the seam that runs it.
//
// 🔴 IT IS THE CAUSAL SIBLING OF `parseTerritory`, ON PURPOSE AND DOWN TO THE REFUSAL NAMES. That
// function already solved the same problem for association pairs: show the model the excerpts with
// ids, require every claim to name the excerpt it was read from, and refuse anything citing an id we
// never showed. Solving it a second way here would give one product two grounding standards, and the
// weaker one would win wherever it happened to run.
//
// 🔴 AND THE VALIDATION IS PER EXCERPT, WHICH IS THE WHOLE VALUE OF THE ID. `validateCausalEdges`
// checks that the quote appears in the passage — the single strongest fabrication signal there is.
// Handing it the concatenation of every excerpt would let a model assemble a sentence from two
// different slides and pass, so each edge is checked against the ONE excerpt it claims to come from.

import { quoteAnchor } from "@/lib/sources/source-context";

import type { CanvasSource, SourceExcerpt } from "./canvas-model";
import {
  causalKnowledgeFrom,
  validateCausalEdges,
  type RawCausalEdge,
} from "./causal-extraction-contract";
import { knowledgeIdentityKey } from "./knowledge-identity";
import type { KnowledgeObject } from "./knowledge-types";

/** Why a candidate edge produced nothing. Named so a refusal can be counted, never a bare skip. */
export type CausalRefusalReason =
  /** The response was not a readable list of edges. */
  | "unreadable-response"
  /** The edge did not say which excerpt it came from, so nothing supports it. */
  | "missing-excerpt"
  /** It named an excerpt id that is not part of this canvas's material — an invented citation. */
  | "unresolvable-excerpt"
  /** The excerpt resolved but carries no durable locator, so nothing could ever find it again. */
  | "unanchorable-excerpt"
  /** The contract's own validator rejected it. Its reason is carried in `detail`. */
  | "rejected-by-contract"
  /** The same edge, already taken from this response. */
  | "duplicate";

export interface CausalRefusal {
  reason: CausalRefusalReason;
  detail: string;
}

export interface CausalTerritoryResult {
  objects: KnowledgeObject[];
  refusals: CausalRefusal[];
}

/** An edge as the model returns it here: the contract's shape, plus where it was read. */
interface GroundedEdge extends RawCausalEdge {
  excerptId?: unknown;
}

/**
 * How much of an excerpt backs a durable anchor when the edge's own quote cannot.
 *
 * Long enough to be distinctive inside its own unit, short enough that a reparse which reflows the
 * paragraph still finds it — the same reasoning and the same number as the association lane.
 */
const ANCHOR_QUOTE_CHARS = 120;

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

interface Located {
  excerpt: SourceExcerpt;
  librarySourceId: string;
}

function locate(sources: readonly CanvasSource[], excerptId: string): Located | null | "unanchorable" {
  for (const source of sources) {
    const excerpt = source.excerpts.find((candidate) => candidate.id === excerptId);
    if (!excerpt) continue;
    // A source with no library row cannot support a durable anchor, and an excerpt recorded before
    // units existed has nothing to anchor TO. Both mean "we cannot honestly promise to find this
    // again", which is a refusal rather than a weaker object.
    if (!source.librarySourceId || !excerpt.unitId) return "unanchorable";
    return { excerpt, librarySourceId: source.librarySourceId };
  }
  return null;
}

/**
 * Read a grounded causal response into knowledge objects.
 *
 * 🔴 PURE, WHICH IS WHAT MAKES THE RULES TESTABLE. No clock, no network, no model. Every decision is
 * reproducible from the response text and the material handed in, so "would this edge survive?" is
 * answerable in a unit test rather than by running a generation and hoping.
 *
 * 🔴 AMBIGUITY EMITS LESS, NEVER A GUESS. Every branch below drops a candidate and records why. The
 * owner's rule for this whole layer is that a model may read widely and must claim narrowly, and the
 * only way to hold that is for the code between the model and the database to be able to say no.
 */
export function parseCausalTerritory(input: {
  text: string;
  sources: readonly CanvasSource[];
  /** Which model produced this, recorded on every object's provenance. */
  model: string;
}): CausalTerritoryResult {
  const objects: KnowledgeObject[] = [];
  const refusals: CausalRefusal[] = [];

  let candidates: GroundedEdge[];
  try {
    const parsed: unknown = JSON.parse(input.text);
    // 🔴 `relations`, BECAUSE THAT IS THE ENVELOPE THE CONTRACT'S PROMPT ASKS FOR. Reading a key the
    // instruction never named is how a perfectly good response is discarded as unreadable.
    const list = Array.isArray(parsed) ? parsed : (parsed as { relations?: unknown })?.relations;
    if (!Array.isArray(list)) throw new Error("not a list");
    candidates = list as GroundedEdge[];
  } catch {
    // 🔴 NOTHING, NOT A SALVAGE ATTEMPT. Regex-scraping edges out of malformed JSON is how a
    // half-parsed hallucination becomes a claim a learner is then drilled on.
    return {
      objects,
      refusals: [{
        detail: "The causal response was not a readable list of edges, so nothing was taken from it.",
        reason: "unreadable-response",
      }],
    };
  }

  const seen = new Set<string>();

  for (const [index, candidate] of candidates.entries()) {
    const excerptId = str(candidate.excerptId);
    if (!excerptId) {
      refusals.push({
        detail: `Edge ${index + 1} named no excerpt, so nothing in the material supports it.`,
        reason: "missing-excerpt",
      });
      continue;
    }
    const found = locate(input.sources, excerptId);
    if (found === null) {
      // 🔴 THE HALLUCINATED CITATION, CAUGHT AT THE ONLY PLACE IT CAN BE. The grounding block prints
      // every id we showed; an id that is not among them was invented, and so was the edge on it.
      refusals.push({
        detail: `Edge ${index + 1} cited "${excerptId}", which is not part of this canvas's material.`,
        reason: "unresolvable-excerpt",
      });
      continue;
    }
    if (found === "unanchorable") {
      refusals.push({
        detail: `Edge ${index + 1} cited "${excerptId}", which carries no durable locator.`,
        reason: "unanchorable-excerpt",
      });
      continue;
    }

    // 🔴 AGAINST THIS EXCERPT ALONE. The contract's quote check is the fabrication guard, and it is
    // only as strong as the passage it is given: validating against every excerpt at once would
    // accept a sentence stitched together from two different slides.
    const { rejected, relations } = validateCausalEdges({
      passage: found.excerpt.text,
      raw: [candidate],
    });
    const relation = relations[0];
    if (!relation) {
      refusals.push({
        detail: `Edge ${index + 1} was rejected by the extraction contract: ${rejected[0]?.reason ?? "unknown"}.`,
        reason: "rejected-by-contract",
      });
      continue;
    }

    const object = causalKnowledgeFrom({
      // 🔴 THE EDGE'S OWN ASSERTING SENTENCE, NOT THE HEAD OF THE EXCERPT. A causal claim's anchor
      // should land on the clause that makes it, so a correction can show the learner the exact
      // words. The excerpt head is the fallback for when the quote is not distinctive.
      anchors: [
        {
          quote: quoteAnchor(found.excerpt.text, relation.assertion || found.excerpt.text.slice(0, ANCHOR_QUOTE_CHARS)),
          sourceId: found.librarySourceId,
          unitId: found.excerpt.unitId!,
        },
      ],
      index,
      model: input.model,
      relation,
      unitId: found.excerpt.unitId!,
    });

    const identityKey = knowledgeIdentityKey(object);
    if (seen.has(identityKey)) {
      // The same claim twice is one piece of knowledge, and would otherwise look like two questions.
      refusals.push({ detail: `Edge ${index + 1} repeated one already taken.`, reason: "duplicate" });
      continue;
    }
    seen.add(identityKey);
    objects.push({ ...object, identityKey });
  }

  return { objects, refusals };
}
