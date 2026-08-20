// WHICH passage a rewrite lands on (contract §11, brief §15).
//
// > §11: *"Make this simpler · I still don't understand this · Explain this differently"* must not
// > append another explanation underneath — the existing passage rewrites itself in place.
// > §15: *"The learner can always interrupt… These are part of the adaptive loop, not side
// > features."*
//
// ── 🔴 WHAT THIS FILE STOPPED DOING ──────────────────────────────────────────────────────────
//
// It used to decide WHETHER a sentence was a rewrite request, with `asksForRewrite`: a list of
// instruction phrases (simpler, simplify, rephrase, reword, rewrite, explain this differently,
// plain english, break this down), a second list of confusion phrasings (don't understand, don't
// get, don't follow, lost, confused), and an interrogative guard wedged between them to stop the
// two colliding.
//
// 🔴 AND IT CARRIED AN ARGUMENT FOR WHY THAT WAS FINE, WHICH WAS HALF RIGHT. The argument: the
// standing rule against keyword lists is about heuristics that only generalise inside one field,
// and "make this simpler" means the same thing in a statute, a proof and a weld procedure. True.
// But generalising across fields was never the only thing wrong with a word list. It still has to
// enumerate every way a person says it, and this file's own comments record two phrasings it got
// wrong before anyone noticed: "can you rephrase that" is an instruction wearing a question's
// clothes and the guard refused it, and "how do I understand this" would have rewritten the page.
// The next one was always going to be found by a learner rather than by a test.
//
// So the reading moved to the model, which returns `then: "rewrite"` (lib/learn/turn-router.ts).
//
// ── 🔴 WHAT THIS FILE STILL DOES, AND WHY IT IS NOT THE SAME KIND OF THING ────────────────────
//
// "Which passage did you mean?" has two wrong answers that both look reasonable: the most recent
// block, and the one nearest the viewport. Both are inventions — one is a guess about time, the
// other about gaze, and neither is anything the learner told us.
//
// The contract already requires the right answer to exist: §28 of the brief, *"at any given moment
// one region is the active cognitive region"*, and §29, *"the current cognitive task owns
// attention."* Since §12, that is a value rather than an aspiration — `unreadChunk` is derived
// entirely from Continue presses the learner made themselves. That is application state, and no
// model should be asked to rediscover it.
//
// 🔴 AND WHERE IT IS NOT EXACTLY ONE, THIS REFUSES. An ambiguous referent gets a refusal, never a
// heuristic. The refusal is VISIBLE and says what to do instead: silence is indistinguishable from
// the feature being broken, which is the failure this whole area keeps producing.
//
// 🔴 THE POLICY GUARD ALSO STAYS IN CODE, AND IT OUTRANKS THE MODEL.
//
//     active region is a READING PASSAGE   →  rewrite it simpler              here
//     active region is a RETRIEVAL TASK    →  a SCAFFOLDING request (§33)     NOT here
//
// "Make this simpler" while a question is live is not a request to reword a paragraph — it is the
// learner asking to move down the scaffolding ladder, which is `SCAFFOLD` in §34's action
// vocabulary and belongs to the policy. Rewriting the material under a live question would also
// hand them the answer. Whether a demonstration is owed is a fact the runtime holds, so this stands
// the rewrite down even when the model asked for one.

/** What a rewrite request can resolve to. */
export type ComposerRouting =
  /** A rewrite request with a determinate referent. */
  | { readonly kind: "rewrite"; readonly blockId: string }
  /**
   * A rewrite the policy should answer instead — a demonstration is owed, so this is a scaffolding
   * request rather than an edit. Deliberately NOT a refusal: the learner still gets an answer, it
   * simply is not a rewrite.
   */
  | { readonly kind: "defer-to-policy" }
  /** A rewrite request with no determinate referent. `message` is shown to the learner. */
  | { readonly kind: "refused"; readonly message: string };

export interface RoutingContext {
  /** Blocks the learner has not marked as finished, in document order. */
  readonly unreadBlockIds: readonly string[];
  /** The learner has highlighted exactly one block — an explicit referent that outranks inference. */
  readonly selectedBlockId: string | null;
  /** A retrieval prompt is up and unanswered. */
  readonly awaitingDemonstration: boolean;
  /** The canvas holds no reading material at all. */
  readonly hasReadingMaterial: boolean;
}

/**
 * Where a rewrite lands, given that the model has already read the turn as one.
 *
 * Pure, and called only after `then === "rewrite"` — this function never asks what a sentence
 * meant, only what the canvas can do about it.
 */
export function routeRewrite(context: RoutingContext): ComposerRouting {
  // 🔴 BEFORE EVERY OTHER BRANCH, AND ABOVE THE MODEL'S OWN ANSWER. While a demonstration is owed
  // this is a scaffolding request, and rewriting the material under a live question would hand the
  // learner the answer to it.
  if (context.awaitingDemonstration) return { kind: "defer-to-policy" };

  // An explicit selection is the strongest possible referent: they pointed at it.
  if (context.selectedBlockId) return { blockId: context.selectedBlockId, kind: "rewrite" };

  if (!context.hasReadingMaterial) {
    return {
      kind: "refused",
      message: "There's nothing on the canvas to rewrite yet.",
    };
  }

  // Exactly one unread region — the active cognitive region, derived from the learner's own
  // Continue presses.
  const [first, ...rest] = context.unreadBlockIds;
  if (first !== undefined && rest.length === 0) return { blockId: first, kind: "rewrite" };

  // 🔴 EVERYTHING ELSE REFUSES, AND SAYS WHAT TO DO. Several unread passages, or none — either way
  // there is no single thing "this" refers to. The message names the action that resolves it
  // rather than reporting an internal state, because "ambiguous referent" is not the learner's
  // problem to understand.
  return {
    kind: "refused",
    message: "Highlight the part you'd like rewritten and ask again.",
  };
}
