// The first speakable sentence of a spoken reply, read out of the completion WHILE IT STREAMS.
//
// 🔴🔴 THIS EXISTS BECAUSE THE VOICE WAITED FOR THE WHOLE TURN AND THE NUMBERS SAY MOST OF THAT
// WAIT WAS AVOIDABLE. Measured 2026-08-31 against the live model with the product's own packet
// (spoken conversation, two turns of history): the first sentence of the answer is complete
// 1.6–2.2 seconds in, and the full completion lands at 2.7–4.7 seconds — the envelope's decision
// block streams FIRST, then the prose. The shipped client waited for the last byte, then ran the
// prepare passes, then made the first synthesis request. Feeding the first sentence to the
// synthesiser the moment it exists starts the voice while the model is still writing the rest,
// and the remaining audio is appended into the same timeline behind it (see `prime` in
// `use-response-audio.ts`) — the tail of the completion is MASKED by the opener being spoken.
//
// 🔴 IT FIRES ONLY WHEN WHAT IT WOULD SPEAK IS PROVABLY WHAT THE FINISHED PIPELINE WOULD SPEAK
// FIRST. The finished path is `decisionOrReply` → `stripScreenPositions` → `replySpeechPlan`
// (`sayableProse`, then the opener split). A streamed prefix can only promise the same first
// utterance when nothing later in the turn can rewrite it, so this watcher stands down — silently,
// costing only the head start — whenever:
//
//   · the decision fence has not CLOSED, or its JSON does not parse (`spoken-opener.test.ts`
//     holds the fence regex identical to `turn-router.ts`'s DECISION_BLOCK);
//   · the decision is anything but a plain reply: a web or literature search means THIS round's
//     prose is not the answer at all (a later round's is); tool asks mean the same; study and
//     rewrite turns hand the canvas to machinery this lane has no business narrating over;
//   · the first sentence carries notation, markdown or a bracketed marker — `[compound: …]` is
//     REWRITTEN by the prepare passes, `$…$` is typeset, a fence is a drawing — any of which
//     makes the streamed bytes differ from what `replySpeechPlan` would be handed;
//   · the sentence seam sits past `OPENER_BOUND`, where the finished plan would not split an
//     opener either.
//
// The match is then exact by construction: the same strip functions are applied to the same first
// sentence, and `spoken-opener.test.ts` proves `feed`'s output equals `replySpeechPlan(...)[0]`
// on the finished text, case by case.
//
// PURE. No React, no fetch, no timers. One instance per model round — a search round's watcher
// dies with its round, and the next round starts its own.

import { extractJson } from "./canvas-parse";
import { OPENER_BOUND, sayableProse } from "./reply-speech";
import { stripScreenPositions } from "./screen-positions";

/** Same shape as `turn-router.ts`'s DECISION_BLOCK, and it must stay identical: this watcher and
 *  `readTurnDecision` have to agree on where the decision ends and the answer begins. */
const FENCE = /```json\s*\n?([\s\S]*?)```/;

/** The first sentence's raw bytes must be plain prose. Anything here can be rewritten, typeset,
 *  resolved or drawn by the finished pipeline, so its presence stands the early lane down. */
const NOT_PLAIN_PROSE = /[[\]`$*_#|<>{}~]/;

/** Where a spoken sentence ends — the same seam `openerSplit` cuts at. */
const SENTENCE_SEAM = /(?<=[.!?…])\s/;

/**
 * True when this decision is a plain conversational reply whose prose IS the final answer.
 *
 * 🔴 ABSENT FIELDS PASS, `readTurnDecision` DEFAULTS THEM THE SAME WAY — and the spoken packet
 * now asks the model to omit everything false or empty, so on a voice turn absence is the norm,
 * not the exception.
 */
function plainReply(decision: Record<string, unknown>): boolean {
  if (decision.then !== undefined && decision.then !== "reply") return false;
  if (decision.needsWeb === true || decision.needsPapers === true) return false;
  if (decision.wantsTest === true || decision.wantsCards === true) return false;
  if (Array.isArray(decision.tools) && decision.tools.length > 0) return false;
  if (Array.isArray(decision.visuals) && decision.visuals.length > 0) return false;
  if (decision.question !== undefined && decision.question !== null) return false;
  if (typeof decision.wantsReport === "string" && decision.wantsReport.trim()) return false;
  if (typeof decision.curriculumFor === "string" && decision.curriculumFor.trim()) return false;
  if (decision.check !== undefined && decision.check !== null) return false;
  return true;
}

export interface SpokenOpenerWatch {
  /**
   * Feed the accumulated completion text; returns the opener EXACTLY ONCE, the first moment it is
   * safe, and null on every other call. `accumulated` is the whole text so far, not a delta —
   * which is what `postChatCompletion`'s stream handler is given, already dash-normalised the
   * same way the finished text will be.
   */
  feed(accumulated: string): string | null;
}

export function spokenOpenerWatch(): SpokenOpenerWatch {
  /** Fired, or permanently stood down — either way this watch is spent. */
  let spent = false;

  return {
    feed(accumulated: string): string | null {
      if (spent) return null;

      const fence = FENCE.exec(accumulated);
      if (!fence) {
        // 🔴 NO FENCE IS NOT YET A VERDICT — the block may still be streaming in. But prose this
        // long with no fence in sight is a model that ignored the envelope; the finished path
        // handles that fine, and this lane cannot gate a decision it will never see.
        if (accumulated.length > 2000) spent = true;
        return null;
      }

      const decision = extractJson(fence[1] ?? "");
      // A closed fence that does not parse will not parse better with more prose after it.
      if (!decision || !plainReply(decision)) {
        spent = true;
        return null;
      }

      // The same assembly `readTurnDecision` performs: everything outside the block is the answer.
      const outside = (accumulated.slice(0, fence.index) + "\n" + accumulated.slice(fence.index + fence[0].length)).trim();
      const seam = outside.search(SENTENCE_SEAM);
      if (seam === -1) {
        // Still growing. A first sentence already past the opener bound will never be split by
        // the finished plan either, so there is nothing early to say.
        if (outside.length > OPENER_BOUND) spent = true;
        return null;
      }
      if (seam > OPENER_BOUND) {
        spent = true;
        return null;
      }

      const rawFirst = outside.slice(0, seam);
      if (NOT_PLAIN_PROSE.test(rawFirst)) {
        spent = true;
        return null;
      }

      // Residue-free plain prose: the strip functions are LOCAL on it, so cleaning the sentence
      // alone equals the first sentence of cleaning the finished text — the parity the test holds.
      const opener = sayableProse(stripScreenPositions(rawFirst)).trim();
      if (opener.length < 4 || !/[a-zA-ZÀ-ɏ]/.test(opener)) {
        spent = true;
        return null;
      }

      spent = true;
      return opener;
    },
  };
}
