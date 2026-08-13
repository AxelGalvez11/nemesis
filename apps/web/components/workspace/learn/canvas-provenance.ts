// Where a canvas's knowledge came from, as a question the Sources panel can answer truthfully.
//
// 🔴 THIS EXISTS BECAUSE "NOTHING ATTACHED YET" WAS A CLAIM, NOT AN ABSENCE. A canvas started by
// typing a topic holds no files and a great deal of knowledge. The Sources panel reported the
// files and stayed silent about the knowledge, so the one surface a learner opens to ask "where
// did this come from?" answered "nothing" about material that has a real, statable origin.
//
// The global invariant: every claim the UI makes about the source must trace back to source
// capability. Silence about a known origin is a claim.
//
// 🔴 AND THE QUESTION IS PER CLAIM, NOT PER SESSION — THE OWNER'S WORD FOR THE FAILURE IS
// *LAUNDERING*. "This canvas has at least one source" does not mean every claim on it became
// source-grounded. A canvas legitimately holds both at once:
//
//     Block A  →  grounded in Source 1
//     Block B  →  model-derived, unsupported by anything attached
//     Block C  →  grounded in Source 1 and Source 2
//
// The earlier version of this file asked `sources.every(source => !source.librarySourceId)`, so the
// disclosure vanished the instant ANY durable source arrived — while the model-written material
// stayed on screen underneath it. A learner who attached a spreadsheet to a canvas holding
// twenty-four model-written facts was shown their spreadsheet, and only their spreadsheet, as the
// origin of all of it.

import { hasGroundableAnchor } from "@/lib/learn/knowledge-provenance";
import type { KnowledgeObject } from "@/lib/learn/knowledge-types";

/** Just enough of a claim to say where it came from. */
type Claim = Pick<KnowledgeObject, "sourceAnchors" | "unanchoredProvenance">;

/**
 * Does this canvas hold any claim that came from the model and from nothing else?
 *
 * 🔴 IT READS THE CLAIMS, NOT THE ATTACHMENTS, AND THAT IS THE WHOLE CHANGE. The previous version
 * documented its own blind spot honestly — *"deliberately conservative about the mixed case …
 * nothing available on the client can tell those apart"* — and at the time that was true: every
 * claim a topic canvas held was model-written, and attaching a lecture never altered one, so the
 * client had nothing per-claim to read. It is no longer true. `groundClaims` writes a real anchor
 * onto the claims a source actually states, so `hasGroundableAnchor` now answers the mixed case
 * exactly, one claim at a time, and the conservative reading has become the misleading one.
 *
 * 🔴 UNANCHORED IS NOT THE SAME AS UNSOURCED, WHICH IS WHY BOTH HALVES ARE TESTED. A claim needs a
 * stated way of knowing before its origin can be disclosed at all; an object carrying neither an
 * anchor nor a provenance is one nobody can say anything true about, and announcing it as model
 * knowledge would be inventing an origin rather than reporting one.
 */
export function modelKnowledgeDisclosed(claims: readonly Claim[]): boolean {
  return claims.some(
    (claim) => (claim.unanchoredProvenance ?? []).length > 0 && !hasGroundableAnchor(claim),
  );
}
