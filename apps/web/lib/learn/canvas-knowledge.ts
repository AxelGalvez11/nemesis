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
// them is pure and cheap; persisting knowledge is neither. Ownership is therefore decided from the
// extraction alone, and rows are written only for a canvas the policy will actually teach. A canvas
// that stays on the legacy runtime costs a read and leaves nothing behind.

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
import type { KnowledgeObject } from "./knowledge-types";
import { saveKnowledge, type StoredObjective } from "./learner-store";
import type { ThinkingPhase } from "./thinking-phases";

/** One objective, with the knowledge it is a capability over. */
export interface ResolvedObjective {
  objective: StoredObjective;
  knowledge: KnowledgeObject;
}

export interface CanvasKnowledge {
  /** 🔴 EMPTY UNLESS THE POLICY OWNS THIS CANVAS. Nothing is stored for a canvas the runtime will
   *  not teach from, so there are no objectives to resolve. `ownership` says which case this is. */
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
  /**
   * Called as each real step begins.
   *
   * 🔴 REPORTED, NOT SIMULATED. The caller shows this to the learner, so it must correspond to work
   * genuinely starting — never to a timer walking a list of plausible-sounding stages. If a step is
   * fast, its phase is emitted and superseded within milliseconds and the caller's own threshold
   * means nothing is ever shown for it. That is correct: the honest answer to "what took so long?"
   * is sometimes "nothing did".
   */
  onPhase?: (phase: ThinkingPhase) => void,
): Promise<CanvasKnowledge> {
  // 🔴 DURABLE SOURCES ONLY. An ephemeral source has no library row, so anchors minted from it
  // point at something no later canvas can resolve — knowledge that cannot outlive its session is
  // exactly what this layer exists to stop producing.
  const sourceIds = canvas.sources
    .map((source) => source.librarySourceId)
    .filter((id): id is string => Boolean(id));

  // 🔴 AND A CANVAS HOLDING ANY SOURCE THIS LAYER CANNOT READ IS ALREADY UNOWNABLE, so it is
  // answered before a single round trip. This is not only an optimisation: it is the check that
  // stops a durable glossary beside an ephemeral lecture reporting full coverage of the glossary
  // and taking the page, with the lecture nowhere.
  if (!userId || sourceIds.length !== canvas.sources.length || sourceIds.length === 0) {
    const coverage = emptyCoverage(canvas.sources.length);
    return {
      coverage,
      objectives: [],
      outcome: "no-durable-source",
      ownership: policyOwnsCanvas({ coverage, outcome: "no-durable-source" }),
    };
  }

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

  const ownership = policyOwnsCanvas({ coverage, outcome });
  // 🔴 NOTHING IS WRITTEN FOR A CANVAS THE POLICY WILL NOT TEACH. The knowledge would be correct
  // and completely unused, and it would make the learner's own tables fill up with rows produced by
  // opening a document rather than by learning anything from it.
  if (!ownership.owns) return { coverage, objectives: [], outcome, ownership };

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
