// Which objective has to hold before another one can be produced.
//
// 🔴🔴 THE INVARIANT THIS EXISTS FOR IS I11, WHICH HAS BEEN WRITTEN DOWN AS UNENFORCEABLE SINCE THE
// LIST WAS MADE: *"a prerequisite failure must change what is presented next"*, with the note
// *"there are no prerequisites. Nothing in the knowledge model expresses that one objective depends
// on another, so 'move down, teach the prerequisite, return' has no edge to walk."* This is the
// edge. The owner's own phrasing of the behaviour is "identifies missing prerequisites" — a learner
// who cannot say what follows from a step should be taken to the step before it, not asked the same
// question louder.
//
// 🔴🔴 THE FAILURE ASYMMETRY IS THE OPPOSITE OF `vocabulary-lookup.ts`, AND MIXING THEM UP IS THE
// WHOLE RISK. There, refusing to define a real term denied the learner the feature, while a wasted
// lookup cost one call — so that file errs toward ALLOWING. Here a false edge invisibly reorders
// what a learner is taught, sending them "down" to material that was never underneath, while a
// MISSING edge costs nothing at all: the selector behaves exactly as it did before this file
// existed. So this errs toward REFUSING, and emits no edge whenever it is not certain.
//
// 🔴 WHICH IS WHY THERE IS NO PROSE SCANNING AND NO SUBSTRING MATCHING. The tempting implementation
// reads an objective's text looking for another objective's subject, and this repo has already
// measured what that costs: trigger-word causal extraction ran at 14% precision, and `Week 3` and
// `Boeing 747` are the same string shape. Edges are built ONLY from the role fields the extractor
// emitted with provenance — a causal relation's `cause`/`effect`, an association's `left`/`right` —
// and matched by exact normalised equality. "Increasing resistance" does not match "resistance",
// and that is the correct answer, not a gap to close with a looser comparison.
//
// 🔴 FIELD-AGNOSTIC BY CONSTRUCTION. The rule is "what one objective establishes is what another
// asks the learner to start from", which is as true of `consideration → binding contract →
// enforceable` in a contracts course as of a mechanism in a physiology lecture. Nothing here knows
// any subject.

// 🔴 THE REPO'S OWN JOIN KEY, NOT A SECOND NORMALISATION. `causalNodeKey` is documented as the key
// "shared by every edge that mentions the same node, which is what lets `A → B` and `B → C` be
// assembled into a mechanism later" — it was built for exactly this join. Minting a private
// normaliser here (`glossaryKey`, say, which folds punctuation differently) would produce edges that
// agree with nothing else in the system, and the disagreement would be invisible: a chain that fails
// to join looks identical to a document that has no chain in it.
import { causalNodeKey } from "./knowledge-identity";
import type { KnowledgeObject } from "./knowledge-types";

/**
 * What an objective assumes the learner already holds, and what answering it establishes.
 *
 * 🔴 THE CUE SIDE AND THE ANSWER SIDE, NEVER "ALL THE WORDS IN IT". An objective's cue is what the
 * learner is given; its answer is what they must produce. A dependency runs from the second to the
 * first — B needs A when B *starts* where A *ends* — and any wider reading (every noun mentioned,
 * every term in the qualifier) is the prose scan this file refuses.
 */
export interface ObjectiveTerms {
  /** Normalised terms the learner is handed and expected to already understand. */
  requires: readonly string[];
  /** Normalised terms answering this objective establishes. */
  establishes: readonly string[];
}

const NO_TERMS: ObjectiveTerms = { establishes: [], requires: [] };

/**
 * The role terms of one knowledge object.
 *
 * 🔴 READ FROM THE KNOWLEDGE, NOT FROM THE OBJECTIVE'S DISPLAY STRINGS. `LearningObjective.cue` and
 * `.answer` are built for a human to read — the answer already carries a qualifier in brackets, and
 * a label reads "Say what follows from …". Matching on those would make the edge depend on
 * presentation, so a copy change would silently rewire what is taught before what.
 *
 * 🔴 A TYPE WITH NO CASE HERE RETURNS NOTHING, WHICH IS THE REFUSING DIRECTION. When a new knowledge
 * type starts minting objectives it gets no prerequisites until someone states what its roles are —
 * that is a missing feature, and the alternative is inventing edges for a shape nobody has read.
 */
export function termsOf(knowledge: KnowledgeObject): ObjectiveTerms {
  if (knowledge.type === "causal" && knowledge.relation) {
    // Predicting what follows from a cause starts at the cause and lands on the effect. 🔴 The
    // node's OWN `key`, which the extractor already computed and stored — recomputing it from
    // `text` would work today and drift the first time the normaliser changes on one side only.
    return {
      establishes: [knowledge.relation.effect.key],
      requires: [knowledge.relation.cause.key],
    };
  }
  if (knowledge.type === "association" && knowledge.pair) {
    // 🔴 ONE DIRECTION, THOUGH THE PAIR IS SYMMETRIC AND THE OBJECTIVE IS CUED FROM THE LEFT. Adding
    // the reverse would make every pair both establish and require both of its terms, and two pairs
    // sharing a term would then be prerequisites OF EACH OTHER — a cycle the selector would walk
    // for ever. The minted objective goes left → right, so the edge does too.
    // 🔴 THE SAME NORMALISER AS THE CAUSAL SIDE, WHICH IS THE ONLY REASON THE TWO VOCABULARIES JOIN
    // AT ALL. A pair establishing "Cozaar" and an edge starting from "Cozaar" have to reduce to the
    // same string, or the one edge type that carries a definition into a mechanism never fires.
    return {
      establishes: [causalNodeKey(knowledge.pair.right)],
      requires: [causalNodeKey(knowledge.pair.left)],
    };
  }
  return NO_TERMS;
}

/** An objective, paired with the knowledge it was minted from. The shape the policy already holds. */
export interface PrerequisiteCandidate {
  identityKey: string;
  knowledge: KnowledgeObject;
}

/**
 * For each objective, the objectives it depends on.
 *
 * 🔴 KEYED BY IDENTITY, VALUED AS A SET OF IDENTITIES — no ordering, no depth, no transitive
 * closure. A closure would let one weak term at the bottom of a chain outrank everything above it
 * however far away, and "how far does influence travel" is a judgement nobody has evidence for yet.
 * One hop is what the behaviour needs: the learner missed B, so offer the thing B starts from.
 *
 * 🔴 SELF-EDGES AND EMPTY TERMS ARE DROPPED. An objective whose cause and effect normalise to the
 * same string would otherwise be its own prerequisite, and an empty term would match every other
 * empty term — turning every unparsed role into a dependency on every other one.
 */
export function prerequisiteMap(
  candidates: readonly PrerequisiteCandidate[],
): Map<string, readonly string[]> {
  const establishedBy = new Map<string, string[]>();
  for (const candidate of candidates) {
    for (const term of termsOf(candidate.knowledge).establishes) {
      if (!term) continue;
      const holders = establishedBy.get(term);
      if (holders) holders.push(candidate.identityKey);
      else establishedBy.set(term, [candidate.identityKey]);
    }
  }

  const map = new Map<string, readonly string[]>();
  for (const candidate of candidates) {
    const needed = new Set<string>();
    for (const term of termsOf(candidate.knowledge).requires) {
      if (!term) continue;
      for (const holder of establishedBy.get(term) ?? []) {
        if (holder !== candidate.identityKey) needed.add(holder);
      }
    }
    if (needed.size > 0) map.set(candidate.identityKey, [...needed]);
  }
  return map;
}

/**
 * Which objectives depend on each one — the map above, inverted.
 *
 * 🔴 THE DIRECTION THE SELECTOR ACTUALLY ASKS FOR. Scoring an action asks "is this worth doing
 * now?", and what makes a prerequisite worth doing is that something ELSE is stuck behind it.
 */
export function dependentsOf(
  prerequisites: ReadonlyMap<string, readonly string[]>,
): Map<string, readonly string[]> {
  const dependents = new Map<string, string[]>();
  for (const [dependent, needed] of prerequisites) {
    for (const prerequisite of needed) {
      const existing = dependents.get(prerequisite);
      if (existing) existing.push(dependent);
      else dependents.set(prerequisite, [dependent]);
    }
  }
  return dependents as Map<string, readonly string[]>;
}
