// Where a canvas's knowledge came from, as a question the Sources panel can answer truthfully.
//
// 🔴 THIS EXISTS BECAUSE "NOTHING ATTACHED YET" WAS A CLAIM, NOT AN ABSENCE. A canvas started by
// typing a topic holds no files and a great deal of knowledge. The Sources panel reported the
// files and stayed silent about the knowledge, so the one surface a learner opens to ask "where
// did this come from?" answered "nothing" about material that has a real, statable origin.
//
// The global invariant: every claim the UI makes about the source must trace back to source
// capability. Silence about a known origin is a claim.

/**
 * Does this canvas hold knowledge that PROVABLY came from the model rather than from attached
 * material?
 *
 * 🔴 THE DURABILITY TEST IS THE RUNTIME'S OWN, NOT AN APPROXIMATION OF IT. `canvas-knowledge.ts`
 * branches to the topic path on `sourceIds.length === 0`, where `sourceIds` are the sources
 * carrying a `librarySourceId` — a source with no library row is ephemeral, contributes nothing to
 * extraction, and does not stop the model path from running. Keying this on `sources.length`
 * instead would go quiet on a canvas that has an ephemeral attachment listed beside knowledge the
 * model produced, which is precisely the canvas most likely to mislead.
 *
 * 🔴 IT IS DELIBERATELY CONSERVATIVE ABOUT THE MIXED CASE. When a durable source is present this
 * returns `false` even though some knowledge may still be model-minted — identity does not depend
 * on provenance, so a topic canvas that later receives the matching lecture merges into one object.
 * Nothing available on the client can tell those apart, and inventing the distinction would be the
 * same failure in the opposite direction. We disclose what we can prove and stay silent otherwise.
 *
 * @param sources        the canvas's attached sources
 * @param knowledgeCount how many supported knowledge items the policy resolved for this canvas
 */
export function modelKnowledgeDisclosed(
  sources: readonly { librarySourceId?: string | null }[],
  knowledgeCount: number,
): boolean {
  // 🔴 KNOWLEDGE FIRST, AND THAT ORDER IS THE POINT. The line appears because model-sourced
  // knowledge EXISTS — not because the canvas happens to be sourceless. A brand-new empty canvas
  // has nothing behind it, and "Nothing attached yet" is the honest sentence there.
  if (knowledgeCount <= 0) return false;
  return sources.every((source) => !source.librarySourceId);
}
