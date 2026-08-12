// The durable knowledge behind one canvas's sources.
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

import { loadCanonicalSource } from "./canvas-sources";
import type { LearningCanvas } from "./canvas-model";
import { extractKnowledgeObjects, type ExtractionOutcome } from "./knowledge-extraction";
import type { KnowledgeObject } from "./knowledge-types";
import { saveKnowledge, type StoredObjective } from "./learner-store";
import type { ThinkingPhase } from "./thinking-phases";

/** One objective, with the knowledge it is a capability over. */
export interface ResolvedObjective {
  objective: StoredObjective;
  knowledge: KnowledgeObject;
}

export interface CanvasKnowledge {
  objectives: ResolvedObjective[];
  /**
   * 🔴 STATED, NEVER INFERRED FROM `objectives.length`. Zero objectives is three different facts:
   * this material teaches no associations, its structure did not survive parsing, or nothing was
   * readable at all. Only the last two are ours to fix, and an empty array cannot tell them apart.
   */
  outcome: ExtractionOutcome | "no-durable-source";
}

/**
 * Every association objective this canvas's durable sources support, stored and ready for evidence.
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
  if (!userId || sourceIds.length === 0) return { objectives: [], outcome: "no-durable-source" };

  const resolved: ResolvedObjective[] = [];
  let outcome: ExtractionOutcome = "complete";

  for (const sourceId of sourceIds) {
    onPhase?.("reading_source");
    const canonical = await loadCanonicalSource(sourceId);
    if (!canonical.ok) {
      outcome = "failed";
      continue;
    }
    onPhase?.("mapping_knowledge");
    const extraction = extractKnowledgeObjects(canonical.context);
    // The worst outcome across the canvas's sources wins: one source read completely does not make
    // the canvas complete when another was flattened.
    if (extraction.outcome === "failed") outcome = "failed";
    else if (extraction.outcome === "degraded" && outcome !== "failed") outcome = "degraded";

    for (const knowledge of extraction.objects) {
      const stored = await saveKnowledge(userId, knowledge);
      for (const objective of stored) resolved.push({ knowledge, objective });
    }
  }

  // 🔴 ORDERED BY IDENTITY, EXPLICITLY. The runtime acts on the first objective that is owed
  // something, so leaving the order to whatever PostgREST returned would make "which question did
  // Nemesis ask?" depend on row layout — the same canvas could ask a different thing on a reload
  // and nothing would look wrong. This is ARBITRATION, NOT A CURRICULUM: it decides ties, it does
  // not encode what should be learned first. A real ordering is a later, separate decision.
  resolved.sort((a, b) => a.objective.identityKey.localeCompare(b.objective.identityKey));
  return { objectives: resolved, outcome };
}
