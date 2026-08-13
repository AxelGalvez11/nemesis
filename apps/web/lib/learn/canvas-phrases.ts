// Typing "make this simpler" (contract §11, brief §15).
//
// > §11: *"Make this simpler · I still don't understand this · Explain this differently"* must not
// > append another explanation underneath — the existing passage rewrites itself in place.
// > §15: *"The learner can always interrupt… These are part of the adaptive loop, not side
// > features."*
//
// Until now only a text SELECTION could trigger a rewrite. Typing the phrase produced an ordinary
// answer appended below, which is the exact behaviour §11 exists to prevent.
//
// ── 🔴 THE REFERENT IS READ, NOT GUESSED ─────────────────────────────────────────────────────
//
// "Which passage did you mean?" has two wrong answers that both look reasonable: the most recent
// block, and the one nearest the viewport. Both are inventions — one is a guess about time, the
// other about gaze, and neither is anything the learner told us.
//
// The contract already requires the right answer to exist: §28 of the brief, *"at any given moment
// one region is the active cognitive region"*, and §29, *"the current cognitive task owns
// attention."* Since §12, that is a value rather than an aspiration — `unreadChunk` is derived
// entirely from Continue presses the learner made themselves.
//
// 🔴 AND WHERE IT IS NOT EXACTLY ONE, THIS REFUSES. An ambiguous referent gets a refusal, never a
// heuristic. The refusal is VISIBLE and says what to do instead: silence is indistinguishable from
// the feature being broken, which is the failure this whole area keeps producing.
//
// ── 🔴 WHAT THIS DELIBERATELY DOES NOT HANDLE ────────────────────────────────────────────────
//
//     active region is a READING PASSAGE   →  rewrite it simpler              here
//     active region is a RETRIEVAL TASK    →  a SCAFFOLDING request (§33)     NOT here
//
// "Make this simpler" while a question is live is not a request to reword a paragraph — it is the
// learner asking to move down the scaffolding ladder, which is `SCAFFOLD` in §34's action
// vocabulary and belongs to the policy. Rewriting the material under a live question would also
// hand them the answer. So this stands down and the text takes its ordinary path.

/** What the learner asked for, as far as this module can tell. */
export type ComposerRouting =
  /** Not a rewrite request. Take the ordinary path. */
  | { readonly kind: "ordinary" }
  /** A rewrite request with a determinate referent. */
  | { readonly kind: "rewrite"; readonly blockId: string }
  /**
   * A rewrite request the policy should answer instead — a demonstration is owed, so this is a
   * scaffolding request rather than an edit. Deliberately NOT a refusal: the learner still gets an
   * answer, it simply is not a rewrite.
   */
  | { readonly kind: "defer-to-policy" }
  /** A rewrite request with no determinate referent. `message` is shown to the learner. */
  | { readonly kind: "refused"; readonly message: string };

/**
 * Does this text ask for the material to be rewritten?
 *
 * 🔴 THIS IS A LIST OF INSTRUCTIONS TO THE SYSTEM, NOT OF SUBJECT MATTER, which is why a phrase
 * list is legitimate here where it would not be for content. "Make this simpler" means the same
 * thing in a statute, a proof and a weld procedure — the standing rule against keyword lists is
 * about heuristics that only generalise within one field, and this generalises across all of them.
 *
 * 🔴 IT FIRES ON "I DON'T UNDERSTAND THIS" TOO, AND I ARGUED THE OPPOSITE FIRST. My reasoning was
 * an asymmetry: a false positive silently rewrites material the learner may have been relying on,
 * a false negative merely gives them an ordinary answer. Two things defeat it, and the second is
 * the one I missed:
 *
 *   1. THE WORDING IS NOT DESTROYED. §11 keeps `previousContent` and offers restore, so the cost
 *      of a false positive is "the passage changed and I can put it back" — not "my wording is
 *      gone". Much smaller than the harm I was protecting against, and already built.
 *
 *   2. 🔴 THE "SAFE" FALLBACK IS THE PROHIBITED BEHAVIOUR. §11's core sentence is *"do not append
 *      another explanation underneath"*. Checked rather than assumed: the ordinary path's prompt
 *      permits `insert_before`, `insert_after` and `annotate_block`, so a confused learner falling
 *      through gets an explanation STACKED BELOW the passage — precisely the shape §11 exists to
 *      forbid. The conservative-looking option was the one the section was written to stop.
 *
 * So the owner's list is honoured as written. What still does NOT fire is a question with a
 * subject — "what does osmolarity mean" is a request for information about a term, not a request
 * to change the passage, and answering it in a popover disturbs nothing.
 */
export function asksForRewrite(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 120) return false;
  // An EXPLICIT instruction to change the text wins regardless of how politely it is phrased.
  // 🔴 THIS IS CHECKED FIRST BECAUSE THE QUESTION GUARD BELOW BROKE IT. "Can you rephrase that" is
  // an instruction wearing a question's clothes, and an opener-based guard read it as a question
  // and refused — a false negative on the least ambiguous phrasing in the whole set.
  const explicitlyAsksToChangeTheText =
    /\b(simpler|simplify|simplest)\b/.test(trimmed) ||
    /\b(rephrase|reword|rewrite)\b/.test(trimmed) ||
    /\bexplain (?:this|that|it) differently\b/.test(trimmed) ||
    /\b(?:in|use) (?:plain|simple) (?:english|language|terms|words)\b/.test(trimmed) ||
    /\bbreak (?:this|that|it) down\b/.test(trimmed);
  if (explicitlyAsksToChangeTheText) return true;

  // 🔴 A QUESTION WITH A SUBJECT IS NOT A REWRITE REQUEST, and this guard exists only to protect
  // the CONFUSION patterns below from swallowing one. "What does osmolarity mean" asks about a
  // term and is answered beside the passage, disturbing nothing; "I don't understand this" reports
  // that the material failed, which is §11's case. Without this, "how do I understand this" would
  // rewrite the page.
  if (/^(?:what|why|how|when|where|which|who|does|do|is|are)\b/.test(trimmed)) return false;

  // The owner's own phrasings, honoured as written (§11).
  return (
    /\b(?:do ?n[o']?t|don't|dont|can'?t|cannot|not) (?:really |quite |fully )?(?:understand|get|follow)\b/.test(trimmed) ||
    /\b(?:still |i'm |im |i am )?(?:lost|confused)\b/.test(trimmed)
  );
}

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

export function routeComposerText(text: string, context: RoutingContext): ComposerRouting {
  if (!asksForRewrite(text)) return { kind: "ordinary" };

  // 🔴 BEFORE EVERY OTHER BRANCH. While a demonstration is owed this is a scaffolding request, and
  // rewriting the material under a live question would hand the learner the answer to it.
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
