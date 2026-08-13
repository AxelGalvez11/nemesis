// The durable knowledge behind one canvas's sources, and whether the policy runtime may own it.
//
// 🔴 THE SAME PATH IN EVERY CANVAS, AND THAT IS WHAT MAKES THE CROSS-SESSION CLAIM TRUE. There is
// deliberately no canvas → knowledge lookup table. A canvas resolves its knowledge by re-deriving
// it from the source and storing it, and storage converges on `(user_id, identity_key)`. So a
// second canvas over the same material does not "find" the first canvas's rows — it independently
// computes the same identity and lands on the same rows. Convergence is a property of the identity
// function rather than of a join, which is why it survives the first canvas being deleted.
//
// 🔴 AND THE EXTRACTION IS BEST-EFFORT, ALWAYS. Attaching material must never fail because the
// knowledge layer did. "The file is in and unreadable to this lane" and "the file did not upload"
// are opposite facts for the learner, and the second is the one that loses their work.
//
// 🔴 READ, THEN DECIDE, THEN WRITE — IN THAT ORDER. Reading a canvas's sources and extracting from
// them is pure and cheap; persisting knowledge is neither. What may be written is therefore decided
// from the extraction alone, and rows are written only for a canvas this lane could actually read.
// A canvas whose parse cannot be trusted costs a read and leaves nothing behind.
//
// 🔴 AND THE DECIDING SIGNAL IS TRUST, NOT COVERAGE — see the gate below. "Did we read this
// reliably?" gates; "did we account for all of it?" discloses. Fusing them is what refused every
// real document, and the two have separate homes now: `knowledge-production.ts` and
// `knowledge-coverage.ts`. Neither can see the other's input.

import { constructTerritory } from "./canvas-api";
import { loadCanonicalSource } from "./canvas-sources";
import type { LearningCanvas } from "./canvas-model";
import { extractKnowledgeObjects, type ExtractionOutcome } from "./knowledge-extraction";
import {
  coverageOfSource,
  emptyCoverage,
  policyOwnsCanvas,
  withSourceCoverage,
  type CanvasCoverage,
  type OwnershipDecision,
} from "./knowledge-coverage";
import { knowledgeProductionFor } from "./knowledge-production";
import type { KnowledgeObject } from "./knowledge-types";
import { saveKnowledge, type StoredObjective } from "./learner-store";
import type { ThinkingPhase } from "./thinking-phases";

/** One objective, with the knowledge it is a capability over. */
export interface ResolvedObjective {
  objective: StoredObjective;
  knowledge: KnowledgeObject;
}

export interface CanvasKnowledge {
  /** 🔴 EMPTY UNLESS THE EXTRACTION COULD BE TRUSTED — NOT UNLESS THE DOCUMENT WAS COVERED.
   *  Nothing is stored for a canvas whose sources this lane could not read reliably, so there are
   *  no objectives to resolve. `outcome` says which case that is.
   *
   *  🔴 A NON-EMPTY LIST IS NOT A CLAIM THAT THE DOCUMENT IS COVERED. These are objectives over the
   *  knowledge that was actually extracted; `coverage.unrepresented` says how much was not, and it
   *  stays true and reported beside them. Reading this array as "the canvas is accounted for" is the
   *  exact conflation that made a whole-document question decide a per-knowledge action. */
  objectives: ResolvedObjective[];
  /**
   * 🔴 STATED, NEVER INFERRED FROM `objectives.length`. Zero objectives is several different facts:
   * this material teaches no associations, its structure did not survive parsing, nothing was
   * readable at all, or the canvas simply is not owned. An empty array cannot tell them apart.
   */
  outcome: ExtractionOutcome | "no-durable-source";
  coverage: CanvasCoverage;
  /** Whether this runtime may take the surface, and why not when it may not. */
  ownership: OwnershipDecision;
}

/**
 * Every association objective this canvas's durable sources support — when the policy owns it.
 *
 * Idempotent: both upserts conflict on identity and do nothing, so calling this on every open of
 * every canvas converges on one set of rows rather than accumulating copies.
 */
export async function ensureKnowledgeForCanvas(
  userId: string | null,
  canvas: LearningCanvas,
  options: {
    /**
     * Called as each real step begins.
     *
     * 🔴 REPORTED, NOT SIMULATED. The caller shows this to the learner, so it must correspond to
     * work genuinely starting — never to a timer walking a list of plausible-sounding stages. If a
     * step is fast, its phase is emitted and superseded within milliseconds and the caller's own
     * threshold means nothing is ever shown for it. That is correct: the honest answer to "what
     * took so long?" is sometimes "nothing did".
     */
    onPhase?: (phase: ThinkingPhase) => void;
    /**
     * Store this canvas's knowledge even though the policy does not own it.
     *
     * 🔴 IT BYPASSES OWNERSHIP. IT DOES NOT — AND CANNOT — BYPASS TRUST. Ownership is a judgement
     * about presentation ("should the policy take this page?") and overriding it writes nothing
     * untrue. Whether the source was actually read is a FACT, and a flag that overrode it would
     * mint knowledge from a parse we know was flattened, into a real learner's tables, with no
     * marker distinguishing it from a true one ever after. See the gate below.
     *
     * 🔴 IT CHANGES WHAT IS WRITTEN, NEVER WHAT IS DECIDED. `ownership` in the result still says
     * `owns: false` and still names the refusal, so a caller running a forced session can — and
     * must — disclose it. A bypass that rewrote the verdict would delete the only record that this
     * was not the ordinary path, which is the flaw in the `?policy=1` opt-in it replaces.
     *
     * 🔴 AND THE EVIDENCE SEMANTICS ARE UNCHANGED. A demonstration made in a forced session is a
     * real demonstration of a real objective, so it is written exactly as any other. What is
     * bypassed is which runtime got the surface, not what counts as having learned something.
     */
    bypassOwnership?: boolean;
  } = {},
): Promise<CanvasKnowledge> {
  const { bypassOwnership = false, onPhase } = options;
  // 🔴 DURABLE SOURCES ONLY. An ephemeral source has no library row, so anchors minted from it
  // point at something no later canvas can resolve — knowledge that cannot outlive its session is
  // exactly what this layer exists to stop producing.
  const sourceIds = canvas.sources
    .map((source) => source.librarySourceId)
    .filter((id): id is string => Boolean(id));

  const nothingToRead = (): CanvasKnowledge => {
    const coverage = emptyCoverage(canvas.sources.length);
    return {
      coverage,
      objectives: [],
      outcome: "no-durable-source",
      ownership: policyOwnsCanvas({ coverage, outcome: "no-durable-source" }),
    };
  };

  // Nobody to store knowledge for. A bypass cannot help — it changes what is written, not whether
  // there is anyone to write it for.
  if (!userId) return nothingToRead();

  // 🔴 THE FRONT DOOR. This is the line that used to read `|| sourceIds.length === 0`, and it closed
  // the product's PRIMARY entrance: someone who typed a topic instead of uploading a file got
  // material with nothing to do, because a canvas with no durable source was refused here before
  // anything else ran.
  //
  // 🔴 THE CLAUSE CONFLATED IDENTITY WITH PROVENANCE. Its stated reason is sound and is not being
  // weakened — an anchor minted from an ephemeral source points at something no later canvas can
  // resolve. But that is an argument about ANCHORS, and it was being applied to KNOWLEDGE.
  // `knowledgeIdentityKey` hashes only type, relation kind and the pair: no source, no anchor. So a
  // topic-first fact is perfectly resolvable by a later canvas — it simply has no source, and the
  // refusal treated those as the same thing.
  //
  // So the refusal moves from "no source" to "no honest provenance". A topic has one: model
  // knowledge, stated as such, carrying no anchor and therefore no citation marker it cannot honour.
  //
  // 🔴 AND IT CONSTRUCTS KNOWLEDGE DIRECTLY, NEVER A LESSON TO EXTRACT FROM. Generating prose and
  // reading facts back out of it would launder model output into something shaped like source
  // material, which §M forbids. `parseTerritory` returns `KnowledgeObject[]` and cannot write a
  // block, so that pipeline is unrepresentable here rather than merely discouraged.
  if (sourceIds.length === 0) return topicTerritory(userId, canvas, onPhase);

  // 🔴 AND A CANVAS HOLDING ANY SOURCE THIS LAYER CANNOT READ IS ALREADY UNOWNABLE, so it is
  // answered before a single round trip. This is not only an optimisation: it is the check that
  // stops a durable glossary beside an ephemeral lecture reporting full coverage of the glossary
  // and taking the page, with the lecture nowhere.
  //
  // Skipped under a bypass, where the whole intent is to reach the durable material anyway.
  if (sourceIds.length !== canvas.sources.length && !bypassOwnership) return nothingToRead();

  const extracted: KnowledgeObject[] = [];
  let coverage = emptyCoverage(canvas.sources.length);
  let outcome: ExtractionOutcome = "complete";

  // 🔴 READ TOGETHER, NOT ONE AFTER ANOTHER, AND THAT IS NOW LOAD-BEARING. Every canvas runs this
  // on open — it is how ownership is decided — and the canvas paints nothing until it finishes, so
  // a four-source canvas used to wait for four round trips in a row before showing anything at all.
  // Reading them at once bounds the wait to the slowest single source.
  //
  // The two phases move out here with it, which is more honest rather than less: "reading your
  // sources" and "mapping what you know" are each one step that genuinely runs once, instead of a
  // pair flickering per source.
  onPhase?.("reading_source");
  const loaded = await Promise.all(sourceIds.map((sourceId) => loadCanonicalSource(sourceId)));
  onPhase?.("mapping_knowledge");

  for (const canonical of loaded) {
    if (!canonical.ok) {
      // Not counted as accounted for: what this source holds is now unknown, and unknown is not
      // empty. Ownership refuses on that alone.
      outcome = "failed";
      continue;
    }
    const extraction = extractKnowledgeObjects(canonical.context);
    // The worst outcome across the canvas's sources wins: one source read completely does not make
    // the canvas complete when another was flattened.
    if (extraction.outcome === "failed") outcome = "failed";
    else if (extraction.outcome === "degraded" && outcome !== "failed") outcome = "degraded";

    coverage = withSourceCoverage(
      coverage,
      coverageOfSource({ context: canonical.context, objects: extraction.objects }),
    );
    extracted.push(...extraction.objects);
  }

  // 🔴 STILL DECIDED, STILL REPORTED — IT JUST NO LONGER DECIDES WHETHER KNOWLEDGE IS MINTED.
  // Ownership is a whole-document question and it is the honest answer to "could this runtime
  // account for all of this?" It is carried out on the return value, the surface discloses it, and
  // a forced session is still told apart from an ordinary one by it. What changed is its JOB.
  const ownership = policyOwnsCanvas({ coverage, outcome });

  // 🔴 PRODUCTION IS GATED ON TRUST, NEVER ON COVERAGE — RUNTIME-005.
  //
  // The gate that used to stand here asked `!ownership.owns`, and that was right while the policy
  // REPLACED the page: taking a canvas it could only partly teach deleted the rest of the document
  // from the learner's reach. Under composition the task sits BESIDE the unsupported material, so
  // the whole-document question became a category error — it answered "no" for every real document
  // and refused 6 of 6 production canvases. `RUNTIME-001` removed the identical gate where a task
  // is CONSUMED; this one zeroed its input, so deleting that one alone changed nothing observable.
  //
  // The two facts the old gate fused are separate signals and always were:
  //   outcome                → did we read this reliably?      → GATE  (here)
  //   coverage.unrepresented → did we account for all of it?   → DISCLOSE (on the return value)
  //
  // 🔴 THE CONCERN IN THE OLD COMMENT SURVIVES AND IS SPLIT IN TWO. "Rows produced by opening a
  // document rather than by learning anything from it" was two worries wearing one gate. The first
  // — do not mint knowledge we cannot trust — is exactly what `outcome` answers, and better than
  // coverage did. The second — do not mint knowledge nobody will be asked about — turned out not to
  // be a real trade-off: extraction here is DETERMINISTIC AND MODEL-FREE (see the header of
  // `knowledge-extraction.ts`), so minting on open costs a database upsert and nothing more, and
  // both upserts ignore duplicates on identity, so re-opening the same canvas is free. Writing on
  // open is correct for v1; there is no "studied" concept to build and no spend to weigh.
  //
  // 🔴 AND THIS GATE IS NOT BYPASSABLE — DELIBERATELY, AND IT IS THE ONE GATE THAT IS NOT.
  //
  // `bypassOwnership` skips OWNERSHIP, which is a judgement about presentation: should the policy
  // take this page? Reasonable to override, and overriding it writes nothing untrue. Trust is a
  // different kind of claim — it is a FACT about whether the source was read — and overriding a
  // fact stores a falsehood.
  //
  // What makes it unrecoverable is durability and provenance. `saveKnowledge` upserts on
  // `(user_id, identity_key)`, so a knowledge object minted from a flattened parse under
  // `?policy=force` lands in a REAL learner's table, carries no forced marker, and converges with
  // genuine extractions of the same identity — indistinguishable from a true one forever. From
  // there a false knowledge object becomes a false objective becomes a question about something the
  // source never said, and the learner's wrong answer is recorded as THEIR gap. A source gap
  // becoming a learner gap, introduced by a query parameter.
  //
  // So the bypass's own contract — "it changes what is WRITTEN, never what is DECIDED" — is exactly
  // why it must stop here: this is the case where writing IS the decision.
  const production = knowledgeProductionFor({ outcome });
  if (!production.produce) return { coverage, objectives: [], outcome, ownership };

  const resolved: ResolvedObjective[] = [];
  for (const knowledge of extracted) {
    const stored = await saveKnowledge(userId, knowledge);
    for (const objective of stored) resolved.push({ knowledge, objective });
  }

  // 🔴 ORDERED BY IDENTITY, EXPLICITLY. The runtime acts on the first objective that is owed
  // something, so leaving the order to whatever PostgREST returned would make "which question did
  // Nemesis ask?" depend on row layout — the same canvas could ask a different thing on a reload
  // and nothing would look wrong. This is ARBITRATION, NOT A CURRICULUM: it decides ties, it does
  // not encode what should be learned first. A real ordering is a later, separate decision.
  resolved.sort((a, b) => a.objective.identityKey.localeCompare(b.objective.identityKey));
  return { coverage, objectives: resolved, outcome, ownership };
}

// ----------------------------------------------------------------- topic-first

/**
 * How many pairs to ask a topic for.
 *
 * Not tuned, and deliberately not derived from the topic. A ceiling on one request, never a quota to
 * fill: the prompt says fewer is better than padded and `parseTerritory` drops anything failing a
 * rule, so the number that survives is routinely lower and that is the intended shape.
 */
const TERRITORY_TARGET = 24;

/**
 * A topic-first canvas, turned into knowledge the policy can act on.
 *
 * 🔴 DEFINED BELOW `ensureKnowledgeForCanvas` ON PURPOSE, AND MOVING IT UP BREAKS A REAL GUARD.
 * `knowledge-coverage.test.ts` asserts the SOURCE path's ordering — read, then decide trust, then
 * gate, then write — by first occurrence in this file. This function names several of the same
 * calls, so defining it above would shift those positions and silently retarget an assertion that
 * has been protecting the write path since `RUNTIME-005`. Hoisting means the call site above still
 * works; the position is what matters.
 *
 * 🔴 EVERY OBJECT IT PRODUCES CARRIES `unanchoredProvenance: ["model"]` AND NO ANCHOR, so nothing
 * downstream can render a citation for it. The quiet marker promises an excerpt, and there is none.
 *
 * 🔴 AND ITS IDENTITY IS THE ORDINARY ONE, WHICH IS THE WHOLE PAYOFF. These objects are keyed by the
 * same content-derived `identityKey` as document-extracted ones, so a pair minted from a typed topic
 * and the same pair later extracted from an uploaded lecture are ONE object. Upload the lecture
 * afterwards and it lands on knowledge the topic already created, with the learner's demonstrations
 * still attached. Nothing special was done to get that; it falls out of identity not depending on
 * provenance.
 */
async function topicTerritory(
  userId: string,
  canvas: LearningCanvas,
  onPhase?: (phase: ThinkingPhase) => void,
): Promise<CanvasKnowledge> {
  const coverage = emptyCoverage(0);
  const answer = (outcome: ExtractionOutcome | "no-durable-source", objectives: ResolvedObjective[] = []) => ({
    coverage,
    objectives,
    outcome,
    ownership: policyOwnsCanvas({ coverage, outcome }),
  });

  const topic = canvas.title.trim();
  // No material and no topic is genuinely nothing to work from — an empty canvas, not a refusal.
  if (!topic) return answer("no-durable-source");

  onPhase?.("mapping_knowledge");
  const { value } = await constructTerritory(userId, topic, TERRITORY_TARGET);

  // 🔴 THE TRUST DECISION FOR MODEL KNOWLEDGE HAPPENS BEFORE THIS LINE, AND NOTHING IS WRITTEN UNTIL
  // IT HAS. There is no source to have read reliably, so `knowledgeProductionFor` has nothing to
  // judge; what stands in its place is `parseTerritory`'s validation rules, which drop every
  // candidate that fails one. A territory where nothing survived writes NO rows — the same
  // protection as the source path, decided by rules rather than by a parse outcome.
  //
  // `failed`, not `no-durable-source`: a topic Nemesis could not turn into checkable facts is a
  // different thing from a canvas with nothing on it, and reporting them as one hides the case worth
  // knowing about — the surface can say "name it more narrowly" only if it can tell them apart.
  if (!value || value.objects.length === 0) return answer("failed");

  const resolved: ResolvedObjective[] = [];
  for (const knowledge of value.objects) {
    const stored = await saveKnowledge(userId, knowledge);
    for (const objective of stored) resolved.push({ knowledge, objective });
  }

  // Ordered by identity for the same reason the source path is: which question is asked first must
  // not depend on the order rows came back in.
  resolved.sort((a, b) => a.objective.identityKey.localeCompare(b.objective.identityKey));
  return answer("complete", resolved);
}
