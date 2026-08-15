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
import { causalNodeKey, knowledgeIdentityKey } from "./knowledge-identity";
import type { KnowledgeObject } from "./knowledge-types";
import type { ObjectiveParameters } from "./learning-objective";

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
 * 🔴 `parameters` IS OPTIONAL AND ONLY PROCEDURE READS IT, BECAUSE ONLY PROCEDURE NEEDS IT. A
 * causal edge or a pair is ONE dependency wholly described by the knowledge object itself; a
 * procedure mints ONE OBJECTIVE PER STEP from a SINGLE knowledge object, so "which dependency" also
 * needs "which step" — information that lives on the objective, not the knowledge. The one existing
 * caller that has no objective in hand (`policy-runtime.ts`'s terminology-friction check, which asks
 * "what vocabulary is this built from" rather than "what depends on what") calls this with no second
 * argument and gets exactly what it got before this parameter existed.
 *
 * 🔴 A TYPE WITH NO CASE HERE RETURNS NOTHING, WHICH IS THE REFUSING DIRECTION. `classification` is
 * deliberately absent, stated rather than left as an accidental gap: a class's members are SIBLINGS
 * on one axis, not a chain, so "*3/*3 requires *3/*6" would be inventing an order the source never
 * had. When a genuinely new type starts minting objectives it gets no prerequisites until someone
 * reads what its roles are — the alternative is inventing edges for a shape nobody has read.
 */
export function termsOf(knowledge: KnowledgeObject, parameters?: ObjectiveParameters): ObjectiveTerms {
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
  if (knowledge.type === "procedure" && knowledge.steps?.length && parameters?.stepKey) {
    // 🔴🔴 I11 FOR A PROCEDURE — THE SAME EDGE CAUSAL KNOWLEDGE ALREADY WALKS, ONE STEP OVER. A
    // learner who cannot say what comes after step 2 should be offered step 2, not step 3 asked
    // louder. The dependency is the source's OWN stated order, recovered the same way the causal
    // edge recovers cause→effect from the document's own sentence — nothing here guesses an order,
    // it reads the one `procedureObjectives` already minted the step at.
    //
    // 🔴 POSITIONAL, NOT VOCABULARY — AND THAT IS WHY THE KEY IS A SCOPED POSITION, NOT A NORMALISED
    // WORD. A step does not establish a TERM the way a causal edge or a pair does; it establishes
    // "this position in THIS procedure was reached". `wordsInTheWay`'s friction check reads this
    // same function for a vocabulary list — a synthetic scope key is not a word a learner could ever
    // look up, so it is inert there rather than wrong: no real lookup will ever match it.
    //
    // 🔴 SCOPED TO THE KNOWLEDGE OBJECT'S OWN IDENTITY, NEVER A BARE "step#2". Two unrelated
    // procedures both have a step 2, and an unscoped key would wire "file the motion" to "administer
    // the second dose" the moment both existed in the same canvas. Falls back to computing the
    // identity the same way every other minter does when the object arrived without one already set.
    const scope = knowledge.identityKey ?? knowledgeIdentityKey(knowledge);
    const stepKey = parameters.stepKey;
    return {
      establishes: [`${scope}#step#${stepKey}`],
      // The first step is cued by the PROCEDURE'S OWN NAME, not by a step before it — see
      // `procedureObjectives` — so it has nothing to require. Requiring one would invent a
      // dependency the source never stated.
      requires: stepKey > 1 ? [`${scope}#step#${stepKey - 1}`] : [],
    };
  }
  return NO_TERMS;
}

/** An objective, paired with the knowledge it was minted from. The shape the policy already holds. */
export interface PrerequisiteCandidate {
  identityKey: string;
  knowledge: KnowledgeObject;
  /** This objective's own parameters — absent is fine for causal and association, which do not read
   *  it, but a procedure candidate without its `stepKey` here can never join to its neighbours. */
  parameters?: ObjectiveParameters;
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
    for (const term of termsOf(candidate.knowledge, candidate.parameters).establishes) {
      if (!term) continue;
      const holders = establishedBy.get(term);
      if (holders) holders.push(candidate.identityKey);
      else establishedBy.set(term, [candidate.identityKey]);
    }
  }

  const map = new Map<string, readonly string[]>();
  for (const candidate of candidates) {
    const needed = new Set<string>();
    for (const term of termsOf(candidate.knowledge, candidate.parameters).requires) {
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
