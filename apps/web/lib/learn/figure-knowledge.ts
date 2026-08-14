// A labelled diagram becoming knowledge (§46.6).
//
// 🔴 THE DIAGRAM BELONGS TO THE KNOWLEDGE SYSTEM, NOT TO A RENDERER. The owner's rule: "Diagrams
// are first-class cognitive objects, not decorative assets. They belong to the knowledge system,
// not the UI layer." So the picture and its labels are turned into a `KnowledgeObject` here, and
// the occlusion component is handed the result. Building it the other way round — a component that
// fetches a figure and invents questions about it — would put the teaching decision inside a
// renderer, where the selector cannot see it and evidence cannot attach to it.
//
// 🔴 AND THIS IS THE SECOND OF FIVE LINKS, NOT THE FEATURE. figure-labels.ts reads labels out of a
// vision reply; this turns them into knowledge; `objectivesForKnowledge` mints one `locate`
// objective per label; `FigureOcclusion` draws it; the existing composer and evaluator carry the
// answer to `LearnerEvidence` with no new path, because a spatial objective is an ordinary
// `LearningObjective` and everything downstream already speaks that.
//
// PURE.

import { isOccludable, type FigureLabel } from "./figure-labels";
import { knowledgeIdentityKey } from "./knowledge-identity";
import type { KnowledgeObject, UnanchoredProvenance } from "./knowledge-types";

export interface FigureSource {
  /** How the surface fetches the picture — the document model's own figure key. */
  readonly imageRef: string;
  /** What vision said the figure shows, with the machine-readable label line already stripped. */
  readonly caption: string;
  readonly labels: readonly FigureLabel[];
  /** Where this figure came from. Required, exactly as it is on every knowledge object. */
  readonly provenance: readonly UnanchoredProvenance[];
}

/**
 * One knowledge object per labelled diagram, or none.
 *
 * 🔴 NONE IS THE COMMON ANSWER AND IS NOT A FAILURE. Most figures in real material are photographs,
 * logos and charts without named parts. `isOccludable` refuses anything with fewer than two labels,
 * because a picture with a single caption is an illustration: occlude its only label and the
 * question collapses to "what is this picture called", which is an association and is already
 * served by that lane.
 *
 * 🔴 THE STATEMENT NAMES THE PARTS, AND THAT IS WHAT MAKES THE IDENTITY STABLE. `knowledgeIdentityKey`
 * hashes type + statement, so two decks containing the same diagram converge only if they describe
 * it the same way. Listing the labels in a fixed order means the same picture recognised twice is
 * the same knowledge, even when the two vision passes wrote different prose around it — which is
 * the whole point of a content-derived identity, and would fail if the caption alone carried it.
 */
export function figureKnowledge(source: FigureSource): KnowledgeObject | null {
  if (!isOccludable(source.labels)) return null;
  if (!source.imageRef.trim()) return null;
  if (source.provenance.length === 0) return null;

  const named = [...source.labels]
    .map((label) => label.text)
    .sort((a, b) => a.localeCompare(b))
    .join(", ");
  const subject = source.caption.trim() || "This diagram";
  const statement = `${subject} labels: ${named}.`;

  const base = {
    statement,
    type: "spatial" as const,
  };

  return {
    figure: {
      caption: source.caption.trim() || undefined,
      imageRef: source.imageRef,
      labels: source.labels,
    },
    id: knowledgeIdentityKey(base),
    identityKey: knowledgeIdentityKey(base),
    statement,
    type: "spatial",
    unanchoredProvenance: source.provenance,
  };
}
