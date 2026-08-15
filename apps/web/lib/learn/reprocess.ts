/**
 * Is the answer we already have the answer the current rules would give?
 *
 * 🔴 ONE PREDICATE, BECAUSE THE OWNER'S TWO ITEMS ARE ONE MECHANISM. "Do not repeatedly pay to
 * discover the same empty result" and "identify documents missing newly available figure/vision
 * information" are the same question asked from two sides, and the owner's constraint on them is a
 * single sentence: **DO NOT CREATE A SECOND INDEPENDENT RETRY SYSTEM.** Two functions that happen
 * to agree today are two functions that disagree the first time one is edited, and the disagreement
 * is invisible — one lane keeps paying for an answer the other already has, or one lane stops
 * revisiting documents an improvement was built for. So there is exactly one comparison, and every
 * consumer that decides whether to spend again calls it.
 *
 * Today that is three call sites, not two:
 *
 *     parse lane        `decideEnqueue`                    — re-read the BYTES
 *     empty-build lane  `territoryReuse` (`emptyUnder`)    — re-read the DOCUMENT for pairs
 *     mechanism lane    `mechanismsFor`  (`mechanismsUnder`) — re-read the DOCUMENT for causes
 *
 * The third was a bare `===` guarding a paid model call, and it is the marker that actually exists
 * in production. Leaving it out would have shipped the second system inside the change that exists
 * to prevent one.
 *
 * 🔴 THREE DIMENSIONS, NEVER FUSED INTO ONE STRING. A parse and an extraction can each move without
 * the other, and a fingerprint that mixed them would make every parser bump re-run every model
 * call, and every extractor bump re-read every file. `canvas-territory.ts`'s `buildRules` states
 * this gap explicitly — "IT DOES NOT CARRY THE DOCUMENT'S PARSE VERSION" — and this is where the
 * gap is closed: by comparing the versions side by side, not by concatenating them.
 *
 * 🔴 AND IT NEVER DECIDES WHETHER SPENDING IS WORTH IT. This answers "is the stored answer stale?"
 * The owner reserved "should we pay to refresh it?" — *"Reprocess only the real documents necessary
 * to prove the system now. Do not mass-backfill production until there is a measured reason."* So a
 * `true` verdict is a fact about a row, never an instruction to a queue: nothing here sweeps a
 * corpus, and every caller reaches this one source at a time.
 *
 * PURE. No imports, no I/O — so every branch is decidable in a test without a database, which is
 * the property that was missing when a gate "was semantically correct and never executed".
 */

/**
 * Which rules produced a stored answer, and what they were run over.
 *
 * 🔴 A NULL IS "THIS CONSUMER DOES NOT TRACK THIS", NEVER "THIS DIMENSION IS FINE". The parse lane
 * has no ruleset version because parsing does not run the knowledge lanes; the empty-build lane may
 * fail to compute a content fingerprint because a source would not load. Those are different facts
 * from "unchanged", and `needsReprocess` reads them differently depending on which side is null —
 * see the null rules on the function itself.
 */
export interface ProcessingStamp {
  /**
   * What could be READ out of the bytes — `PARSER_VERSION`, or the vendor string a external reader
   * reported. Moves when the parser or the vision ladder changes what it can see.
   */
  parserVersion: string | null;
  /**
   * What could be UNDERSTOOD out of an already-read document — `RULESET_VERSION`. Moves when a
   * knowledge lane changes what it mints from the same text.
   */
  rulesetVersion: string | null;
  /**
   * The bytes this answer is about. `sha256` of one file, or a fingerprint over several.
   *
   * 🔴 THE BYTES, NEVER THE ROW. "The source itself changed" has to mean the content changed, or a
   * rename, a re-file or any other touch of `library_sources` would spend money re-deriving an
   * answer about an identical document.
   */
  contentHash: string | null;
}

/**
 * Why the stored answer no longer stands.
 *
 * 🔴 THE REASON IS THE OUTPUT, NOT DECORATION. A caller that gets `true` and no reason cannot tell
 * "a better extractor shipped" from "the learner replaced the file" from "a person pressed the
 * button", and those justify different amounts of spending and different messages on a surface.
 */
export type ReprocessReason =
  /** Nothing has ever been processed here. The first read and a re-read ask the same question. */
  | "never-processed"
  /** Different bytes. The stored answer is about a different document. */
  | "content-changed"
  /** The parser or vision ladder moved — more may be readable out of the same file. */
  | "parser-version-changed"
  /** A knowledge lane moved — more may be extractable out of the same already-read text. */
  | "ruleset-version-changed"
  /** A person asked, and nothing else had changed. See the note on ordering below. */
  | "explicitly-requested";

export type ReprocessVerdict =
  | { reprocess: true; reason: ReprocessReason }
  /** Same rules, same bytes, and nobody asked. Spending again buys the identical answer. */
  | { reprocess: false; reason: "unchanged" };

const UNCHANGED: ReprocessVerdict = { reason: "unchanged", reprocess: false };

/**
 * Compare one dimension of a stored answer against the current one.
 *
 * 🔴 THE TWO NULLS ARE DIFFERENT AND THIS IS THE WHOLE SUBTLETY.
 *
 *   stored null, current null       → NOT a trigger. The consumer does not track this dimension at
 *                                     all (the parse lane has no ruleset version). Nothing is known
 *                                     to have moved.
 *   stored null, current NON-null   → A TRIGGER. Something is tracked now that was not tracked when
 *                                     this answer was stored, so we cannot prove the answer was
 *                                     reached over it. Unknown is not unchanged — the same rule the
 *                                     coverage contract states as "UNKNOWN IS NOT COMPLETE".
 *   stored NON-null, current null   → NOT a trigger. A consumer that STOPS supplying a dimension
 *                                     has a code regression, not a content fact, and letting that
 *                                     spend money would turn one bad edit into a corpus-wide bill.
 *                                     It can only ever suppress a reprocess, never cause one —
 *                                     which is exactly the reading `territoryReuse` already gives
 *                                     an absent `rules`.
 */
function moved(stored: string | null, current: string | null): boolean {
  if (current === null) return false;
  return stored !== current;
}

/**
 * Should this be processed again?
 *
 * 🔴 THE FACTS ARE CHECKED BEFORE THE ASK, AND THAT ORDER IS DELIBERATE. When a person asks for a
 * reprocess AND a version has moved, both are true and the verdict is `true` either way — so the
 * only thing the order decides is which reason the caller is told. The version and content reasons
 * are DIAGNOSTIC: they say what changed and therefore what might be recovered. "A person asked"
 * says only that permission exists. Reporting the diagnostic reason when there is one loses
 * nothing and reporting `explicitly-requested` over it would.
 *
 * 🔴 AND AN EXPLICIT REQUEST STANDS ALONE. The owner listed three triggers — *"the relevant
 * extractor/ruleset version changes; the source itself changes; or an explicit reprocess is
 * requested"* — and the third is not conditional on the first two. Somebody who believes a parse is
 * wrong must be able to get it re-read without waiting for a version bump. Asking twice is made
 * harmless by the PENDING STATE at the call site, never by refusing the first ask: see
 * `decideEnqueue`'s `already-reprocessing`, which is the same shape, and for the same reason, as
 * the `already-queued` that protects the backoff ladder.
 */
export function needsReprocess(input: {
  /** What is on record. `null` when nothing has ever been processed. */
  stored: ProcessingStamp | null;
  /** What the rules and the bytes are NOW. */
  current: ProcessingStamp;
  /** A person asked for this one, by name. Never a sweep. */
  requested?: boolean;
}): ReprocessVerdict {
  const { current, requested = false, stored } = input;

  if (!stored) return { reason: "never-processed", reprocess: true };

  // Content first: different bytes make every other comparison a comparison about a different
  // document, so it is the strongest reason available and the one worth reporting.
  if (moved(stored.contentHash, current.contentHash)) {
    return { reason: "content-changed", reprocess: true };
  }
  if (moved(stored.parserVersion, current.parserVersion)) {
    return { reason: "parser-version-changed", reprocess: true };
  }
  if (moved(stored.rulesetVersion, current.rulesetVersion)) {
    return { reason: "ruleset-version-changed", reprocess: true };
  }
  if (requested) return { reason: "explicitly-requested", reprocess: true };
  return UNCHANGED;
}
