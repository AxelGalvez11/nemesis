/**
 * Turning what a speech recogniser has heard so far into text, exactly once.
 *
 * 🔴🔴🔴 THE DEFECT THIS EXISTS FOR: EVERY DICTATED SENTENCE WAS SENT TWICE. Read off the owner's
 * own canvas on production, 2026-08-26 — four separate messages, each one the whole utterance
 * repeated:
 *
 *     "did you get my attachment did you get my attachment"
 *     "can you teach me this can you teach me this…"
 *     "what is this and why did you randomly jump to something weird… what is this and why did…"
 *
 * The doubling was in the stored message, not in the rendering: it showed in the history rail's
 * label and again in the rewound bubble, so the duplicated string reached the model too. Somebody
 * who dictates is being answered on a question they asked once and appeared to ask twice.
 *
 * 🔴 IT EXISTS AS A PURE FUNCTION BECAUSE THE BUG WAS UNTESTABLE WHERE IT LIVED. Both halves of it
 * were inside a React hook that opens a microphone, so nothing in this repository could exercise
 * either. The decision "which of these results have I already written down" is arithmetic over a
 * list; it does not need a browser, and now it has one home and a test.
 *
 * PURE. No React, no I/O, no clock.
 */

/** One entry of a `SpeechRecognitionResultList`, reduced to what this decision needs. */
export interface HeardResult {
  /** The recogniser has committed to this wording and will not revise it. */
  readonly isFinal?: boolean;
  /** The best alternative's text. Empty is legitimate and contributes nothing. */
  readonly transcript: string;
}

export interface HeardSoFar {
  /** Text that just became final and has not been written down before. */
  readonly settled: string;
  /** The phrase still in flight, whole, every time. Replaces what was there; never appended. */
  readonly pending: string;
  /**
   * How many results of THIS recogniser run are now written down.
   *
   * 🔴 THE CALLER HOLDS IT, AND HAS TO HAND IT BACK ON THE NEXT EVENT. A count kept inside this
   * module would be shared by every recogniser in the process and would survive a restart, which
   * is precisely the state that must not survive one.
   */
  readonly settledCount: number;
}

/**
 * What is new since the last event.
 *
 * 🔴🔴 IT READS THE WHOLE LIST AND IGNORES `resultIndex`, WHICH IS THE FIX. The handler this
 * replaced looped `for (i = event.resultIndex; i < results.length; i++)` and appended every final
 * it found — the pattern every Web Speech example uses. It is only correct while `resultIndex` is
 * strictly ahead of everything already consumed, and Chrome does not promise that: with
 * `continuous` and `interimResults` both on, an event carrying interim words for the NEXT phrase
 * can arrive with `resultIndex` pointing back AT the final one before it. That final is then
 * appended a second time, and the learner's sentence goes out twice.
 *
 * 🔴 SO THE GUARD IS THE COUNT, NOT THE INDEX THE BROWSER OFFERS. A result is written down when its
 * position is at or past everything already written down, and never again after that. Re-delivering
 * an old result cannot double it; re-delivering it with different wording cannot revise it either,
 * which is the right trade: `isFinal` is the recogniser saying it will not revise.
 *
 * 🔴 A RESULT THAT IS STILL INTERIM IS ALWAYS PENDING, WHATEVER ITS POSITION, and pending replaces
 * rather than accumulates. That is what lets a phrase be rewritten word by word as it is heard
 * without every draft of it surviving into the final text.
 *
 * 🔴 AND THE COUNT ONLY EVER GOES UP WITHIN ONE RUN. A recogniser that ends and restarts (which
 * `continuous` does by itself, on a pause and on some browsers every minute) begins a fresh list at
 * index zero, so the caller resets the count to zero at exactly that moment and nowhere else.
 */
export function readHeard(input: {
  readonly results: ArrayLike<HeardResult | undefined>;
  readonly settledCount: number;
}): HeardSoFar {
  const { results, settledCount } = input;
  let settled = "";
  let pending = "";
  let counted = Math.max(0, settledCount);

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const said = result?.transcript ?? "";
    if (!result?.isFinal) {
      // 🔴 NOT `continue` ON AN EMPTY ONE. An interim result that has gone empty is the recogniser
      // withdrawing the phrase it was drafting, and skipping it would leave the previous draft on
      // screen for ever.
      pending += said;
      continue;
    }
    if (index < counted) continue;
    settled += said;
    counted = index + 1;
  }

  return { pending: pending.trim(), settled: settled.trim(), settledCount: counted };
}

/**
 * Two pieces of dictated text, joined the one way.
 *
 * 🔴 ONE FUNCTION BECAUSE THERE WERE THREE COPIES OF THE SAME EXPRESSION, and one of them is the
 * other half of the doubling bug (see `use-canvas-dictation.ts`'s `stop`). A rule spelled out at
 * three call sites is a rule that gets fixed at one of them.
 */
export function joinSpoken(before: string, after: string): string {
  const head = before.trim();
  const tail = after.trim();
  if (!head) return tail;
  if (!tail) return head;
  return `${head} ${tail}`;
}
