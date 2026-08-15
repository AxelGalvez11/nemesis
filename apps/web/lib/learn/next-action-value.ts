// Which of the things Nemesis could do next is worth the most — and why.
//
// 🔴 THIS REPLACES "THE FIRST OBJECTIVE THAT IS OWED SOMETHING". That selector was honest about
// being provisional and it had a real ceiling: within a tier it fell back to whichever identity key
// sorted first, so a learner who had failed one objective twice and another once was offered them in
// hash order. The learner model had become substantially more sophisticated than the thing choosing
// from it.
//
// 🔴🔴 IT SCORES ACTIONS, NEVER THE LEARNER, AND THAT DISTINCTION IS THE WHOLE DESIGN. There is no
// mastery number anywhere in this file. Nothing here is stored, nothing accumulates, and nothing is
// ever shown to a learner as a measure of them. `value()` answers "how much is asking THIS worth at
// THIS moment", recomputed from durable evidence every single time — so it can be rewritten
// completely without migrating a single row, and it can never quietly become a score on a person.
//
// 🔴 EVERY TERM IS NAMED AND CARRIED OUT WITH THE ANSWER. A selector whose output is one float is a
// selector nobody can debug and nobody can correct: "why did Nemesis ask me this?" deserves better
// than "it scored highest". Each contribution is a `SelectionReason`, and the winning decision
// carries the list — which is the inspectable policy trace, not a model's chain of thought.
//
// 🔴 AND IT IS A STRICT GENERALISATION OF WHAT CAME BEFORE. The bands below reproduce the ordering
// the previous selector encoded — an exposition the learner is owed outranks anything Nemesis wants
// to ask; never-established outranks due-for-review — because those were reasoned about, tested, and
// accepted. What is new is discrimination WITHIN a band, which is where the old rule fell back to
// arbitrary. Every test written against the old ordering still passes, and that is the evidence this
// is an extension rather than a replacement.

import type { LearnerEvidence, LearnerObjectiveState } from "./learner-evidence";
import type { KnowledgeObject } from "./knowledge-types";
import { entails } from "./scaffold-rung";
import type { TeachingAction } from "./teaching-policy";

/**
 * Why an action scored what it did. The policy trace, in the product's own vocabulary.
 *
 * 🔴 REASON CODES, NOT PROSE. `TeachingAction.because` is a sentence for a human to read; these are
 * values a test can assert on and a dashboard can count. Both exist because they answer different
 * questions — "what would you tell the learner" and "what did the system weigh".
 */
export type SelectionReason =
  /** Nemesis has already decided to tell them something, and the telling is half-finished. */
  | "owed-an-answer"
  /** A named competing model is in the way; retrieval alone keeps returning the same wrong answer. */
  | "misconception-in-the-way"
  /** No evidence at all. The cheapest possible information about this learner. */
  | "never-established"
  /** Attempted, and what came back fell short. */
  | "fell-short"
  /** Attempted repeatedly and still unresolved — the strongest signal of a real gap. */
  | "repeatedly-unresolved"
  /** Evidence exists but no reading we would stand behind. */
  | "nothing-conclusive-yet"
  /** Demonstrated by picking it out, never by producing it — §31.2's provisional ✓. */
  | "recognised-not-produced"
  /** Demonstrated, and long enough ago that asking again measures memory. */
  | "due-again"
  /** Other material the learner is stuck on starts where this one ends — I11's edge, walked. */
  | "unlocks-other-work"
  /** The learner keeps having to look up this material's own vocabulary. The WORDS are the barrier. */
  | "terminology-in-the-way"
  /** Worked very recently. Asking now would measure the last few minutes, not learning. */
  | "just-worked"
  /** Other material has intervened since this was last touched, which is what makes it askable. */
  | "displaced-since"
  /** Repeated unaided misses moved this retrieval to a narrower rung of §33's ladder — see
   *  `scaffold-decision.ts`. Carried on the trace so "why did Nemesis ask it this way" is answerable
   *  from the same record as "why did Nemesis ask it at all". */
  | "scaffold-narrowed"
  /** Demonstrated, eligible, and `retention-model.ts` predicts real decay since the last pass — worth
   *  more than an equally-eligible objective whose memory is barely touched. */
  | "increasingly-overdue";

export interface ActionValue {
  /** Higher is more worth doing NOW. 🔴 A property of the ACTION at this moment — never of the
   *  learner, never stored, never shown. */
  score: number;
  /** Every term that contributed, most significant first. The trace. */
  reasons: SelectionReason[];
}

/**
 * The bands, and why they are ordered this way.
 *
 * 🔴 BANDS RATHER THAN A CONTINUUM, BECAUSE THE ORDERING BETWEEN THEM IS A RULE AND THE ORDERING
 * WITHIN THEM IS A JUDGEMENT. A modifier must never lift an action out of its band: no amount of
 * "this failed three times" should outrank an answer the learner is standing there waiting for.
 *
 * 🔴 THIS PARAGRAPH USED TO END "the gaps are wide enough that the modifiers below cannot cross
 * them, and that is checked by a test", AND BOTH HALVES WERE FALSE. No such test existed, and the
 * gaps were not wide enough: +1,000 from failures against −1,500 from `just-worked` is a 2,500
 * swing across a smallest gap of 2,000, so a `due` objective could outrank a `provisional` one. The
 * guarantee is now structural — see `MODIFIER_CEILING` — and `modifierCeilingHoldsBands` derives the
 * check from these numbers instead of restating them.
 */
const BAND = {
  /** §39: the exposure is the second half of an interaction the learner is already inside. */
  exposition: 10_000,
  /**
   * Not yet demonstrated — never asked, asked inconclusively, or asked and missed.
   *
   * 🔴🔴 ONE BAND, AND MY FIRST VERSION SPLIT IT. I gave never-established 8,000 and unresolved
   * 6,000, reasoning that an unknown buys the most information. That inverted a behaviour this
   * codebase had already accepted and pinned: the previous selector's tier was
   * `status !== "correct"`, which puts "never asked" and "asked and missed" TOGETHER above
   * review, deliberately. Splitting them meant a learner who had just missed something twice was
   * handed a brand-new question instead — the system visibly dropping the thread it had started,
   * and the opposite of the owner's *"it returns to failed material after intervening work"*.
   *
   * So the band is shared and the MODIFIERS discriminate, which is the whole reason for having
   * modifiers. A repeatedly-missed objective outranks an untouched one because it has been missed
   * repeatedly, not because of where it sits in an enum.
   */
  owed: 8_000,
  /** Looked strong, but only at recognition. A false ✓ is invisible and compounds. */
  provisional: 4_000,
  /** Demonstrated and due. Real, and the least urgent thing here. */
  due: 2_000,
} as const;

/**
 * Evidence exists, but nothing conclusive came back.
 *
 * 🔴 A NUDGE INSIDE THE BAND, NOT A BAND OF ITS OWN. An objective nobody has ever asked buys
 * slightly more than one whose last reading was too uncertain to stand behind — but both are
 * "not demonstrated", and putting a band boundary between them would be the same over-claiming
 * that splitting `owed` was.
 */
const INCONCLUSIVE_NUDGE = 100;

/**
 * The most any combination of modifiers may move a score, in either direction.
 *
 * 🔴🔴 A CLAMP, NOT A BUDGET, AND THE BUDGET WAS ALREADY OVERSPENT. The comment above says "the gaps
 * are wide enough that the modifiers below cannot cross them, and that is checked by a test". There
 * was no such test, and the claim was false when written: five unresolved attempts added 1,000 while
 * `just-worked` subtracted 1,500, against a smallest band gap of 2,000. An objective the learner had
 * eventually got right after five misses scored 3,000, and a provisional ✓ that had just been worked
 * scored 2,500 — so `due` outranked `provisional`, which is the one ordering §31.2 exists to hold.
 *
 * 🔴 CLAMPED IN AGGREGATE, SO THE INVARIANT SURVIVES THE MODIFIERS THAT DO NOT EXIST YET. Sizing
 * each constant to fit inside the gap makes the guarantee a piece of arithmetic that has to be
 * redone every time a term is added — and it is exactly the arithmetic that was already wrong. With
 * a ceiling below half the smallest gap, any number of future terms can be added and a modifier
 * still cannot lift an action out of its band. `modifierCeilingHoldsBands` proves it from the bands
 * themselves rather than from a number written here.
 *
 * 🔴 WHAT IT GOVERNS, STATED SO THE GUARANTEE CANNOT LEAK QUIETLY. Everything that flows through
 * `delta` — failures, blocked dependents, terminology friction, `just-worked`. `INCONCLUSIVE_NUDGE`
 * deliberately sits OUTSIDE it, because it is not a modifier: it separates two readings of the same
 * band and is applied to `score` where the band is chosen. A future term that follows that pattern
 * escapes this clamp, so a term belongs in `delta` unless it is picking a band.
 */
const MODIFIER_CEILING = 900;

/** Each further unresolved attempt adds this much. Bounded, and then clamped with everything else. */
const PER_FAILED_ATTEMPT = 120;
/** …and bounded here, so five failures and fifty are not a hundredfold difference. */
const MAX_FAILED_ATTEMPTS = 5;

/**
 * Each piece of work stuck behind this one adds this much.
 *
 * 🔴 THE PREREQUISITE IS UPRANKED AND THE DEPENDENT IS *NOT* DOWNRANKED, which is one decision
 * rather than a symmetric-looking pair. Doing both moves a single edge's two candidates twice the
 * intended distance apart, so the strength of the effect stops being readable from either constant.
 * Upranking alone produces the behaviour I11 asks for — the learner who misses the second step is
 * offered the first — and leaves everything else where it was.
 */
const PER_BLOCKED_DEPENDENT = 100;
/** Bounded for the same reason as failures: a hub term is more valuable, not unboundedly so. */
const MAX_BLOCKED_DEPENDENTS = 3;

/**
 * The learner keeps looking up this material's own words.
 *
 * 🔴 IT RAISES THE VALUE RATHER THAN LOWERING IT, WHICH IS NOT OBVIOUS AND IS THE OWNER'S CALL.
 * "Asking this again will just fail again" argues for pushing it down; the owner's instruction is
 * *"simplifies language under terminology friction"* — the response to friction is to change HOW the
 * thing is asked, never to quietly stop asking it. Pushing it down would make Nemesis avoid exactly
 * the material a learner has actively told it they are stuck on.
 *
 * 🔴 AND IT IS DELIBERATELY SMALLER THAN ONE UNRESOLVED ATTEMPT. Friction is the learner reaching
 * for a dictionary; a missed answer is the learner producing something wrong. The second is stronger
 * evidence of a gap, and no amount of looking words up should outrank it.
 */
const TERMINOLOGY_FRICTION = 90;

/**
 * How much a fully-decayed prediction can move a `due` objective's score, at the far end from a
 * freshly-eligible one.
 *
 * 🔴 SCALED SO EVEN THE MAXIMUM NEVER APPROACHES THE CEILING ALONE, BECAUSE IT IS NOT ALONE. A `due`
 * objective with a long, wrong history could ALSO be carrying `PER_FAILED_ATTEMPT`'s modifier at the
 * same time — nothing here gates the two apart, and `clampToBand` is what has to hold regardless of
 * how many terms are summed before it runs. 800 leaves headroom under `MODIFIER_CEILING` (900) on
 * its own; the two combined still cannot cross a band, because nothing can — that is the ceiling's
 * whole job, proven once in `modifierCeilingHoldsBands` rather than re-budgeted per term.
 */
const OVERDUE_SCALE = 800;

/**
 * Working memory, as a penalty rather than a filter.
 *
 * 🔴 A PENALTY, NOT AN EXCLUSION, AND THAT IS DELIBERATE. The old selector filtered `defer` out of
 * the candidates entirely, so a session in which everything had just been worked had nothing to
 * offer at all. Ranking down instead means the least-recently-touched thing still wins, and a
 * learner never meets a blank surface.
 */
const JUST_WORKED_PENALTY = 700;

/** How many other objectives must intervene before something counts as displaced. */
const DISPLACEMENT = 1;

export interface ValueInput {
  action: TeachingAction;
  state: LearnerObjectiveState;
  knowledge: KnowledgeObject;
  /** This objective's own evidence, newest last. */
  evidence: readonly LearnerEvidence[];
  /** How many OTHER objectives have been worked since this one was last acted on. */
  interveningActs: number;
  /**
   * How many objectives that DEPEND on this one the learner is currently stuck on.
   *
   * 🔴 STUCK, NOT MERELY DEPENDENT, AND THE DIFFERENCE IS THE WHOLE BEHAVIOUR. Every upstream term
   * in a document has dependents; counting those would put the foundations of every chain
   * permanently above everything built on them, which is a curriculum — the exact thing
   * `policy-runtime.ts` says must not grow back. What earns the uprank is that the learner has
   * ALREADY TRIED the dependent and it did not go well, so the thing underneath it is now the
   * useful move. See `objective-prerequisites.ts` for how the edge is built, and how carefully it
   * refuses to build one.
   *
   * Absent means zero — no dependents are stuck — which is the honest default for a caller that
   * does not compute the graph, and the conservative one: it can only fail to promote.
   */
  blockedDependents?: number;
  /**
   * The learner keeps having to look up terms this objective is built from.
   *
   * 🔴 FRICTION, NEVER EVIDENCE. Looking a word up is not an attempt and contradicts nothing — see
   * `learner-friction.ts` for why it lives in its own table and never reaches `projectLearnerState`.
   * It arrives here as a separate input for exactly that reason: the day someone folds it into the
   * evidence log, a learner's curiosity starts moving their status toward "does not know this".
   *
   * Absent means none observed, which is the honest default for a caller that does not read lookups.
   */
  terminologyFriction?: boolean;
  /**
   * Predicted probability of successful retrieval right now, 0-1 — `retention-model.ts`'s reading of
   * this objective's evidence. Due/overdue as a RANKING signal among objectives already eligible to
   * be asked, never a second opinion on WHETHER one is eligible — see that file's header for why
   * `retrieval-eligibility.ts`'s flat tempo is left untouched.
   *
   * 🔴 A PLAIN SCALAR, COMPUTED BY THE CALLER — THE SAME PATTERN `blockedDependents` AND
   * `terminologyFriction` ALREADY USE, AND FOR THE SAME REASON. `value()` promises "no clock, no
   * network" in its own header; retrievability needs `now`, so `now` is resolved once in
   * `decideNext` (which already holds it) and handed in as a number, never read from a clock in here.
   *
   * Absent or `null` means nothing to estimate from — never demonstrated, or demonstrated only by a
   * reveal or a give-up — which must not be read as "certain to fail". See `retrievabilityFor`.
   */
  retrievability?: number | null;
}

/**
 * Did this one row come back wrong, partial, or with nothing shown — the learner's own signal.
 *
 * 🔴 EXPORTED SO `scaffold-decision.ts` READS THE SAME DEFINITION RATHER THAN A SECOND ONE. That
 * file needs the TRAILING RUN of unresolved attempts where this file needs the total count — two
 * different folds, and both have to agree on what "unresolved" means or a score and the scaffolding
 * rung it is paired with could tell two different stories about identical evidence.
 */
export function isUnresolvedAttempt(row: LearnerEvidence): boolean {
  return (
    row.objectiveEvidence !== "not_addressed" &&
    (row.verdict === "incorrect" || row.verdict === "misconception" || row.verdict === "partial" ||
      (!row.demonstrationObtained && row.objectiveEvidence === "nothing_produced"))
  );
}

/** Attempts that came back wrong, partial, or with nothing shown — the learner's own signal. */
function unresolvedAttempts(evidence: readonly LearnerEvidence[]): number {
  return evidence.filter(isUnresolvedAttempt).length;
}

/**
 * What this action is worth right now.
 *
 * 🔴 PURE. No clock, no network, no model, no randomness — the same inputs always produce the same
 * score, so "why did Nemesis ask me this?" is answerable by replaying it rather than by guessing.
 */
export function value(input: ValueInput): ActionValue {
  const {
    action,
    blockedDependents = 0,
    evidence,
    interveningActs,
    retrievability = null,
    state,
    terminologyFriction = false,
  } = input;
  const reasons: SelectionReason[] = [];
  let score: number;
  // 🔴 HOISTED OUT OF THE `correct` BRANCH BELOW SO THE MODIFIERS SECTION CAN READ IT WITHOUT
  // RECOMPUTING IT A SECOND WAY. Two expressions for "is this provisional" that could drift is
  // exactly how the retrievability modifier could end up applying to a recognition-level ✓ the score
  // assignment just decided was provisional — the one case this modifier must never touch.
  let provisional = false;

  if (action.type === "show_correction") {
    score = BAND.exposition;
    reasons.push("owed-an-answer");
  } else if (action.type === "contrast") {
    // 🔴 ALSO THE EXPOSITION BAND, AND ABOVE `show_correction` INSIDE IT. A competing model does not
    // merely leave a gap, it actively returns the wrong answer — so it blocks its own retrieval in a
    // way an ordinary miss does not, and separating the pair is what unblocks everything after it.
    score = BAND.exposition + 500;
    reasons.push("owed-an-answer", "misconception-in-the-way");
  } else if (state.status === "unknown" && state.evidenceCount === 0) {
    score = BAND.owed;
    reasons.push("never-established");
  } else if (state.status === "unknown") {
    // Evidence exists; no reading we would stand behind came back. Worth settling, and slightly
    // below the untouched case — asking something never asked buys marginally more information.
    score = BAND.owed - INCONCLUSIVE_NUDGE;
    reasons.push("nothing-conclusive-yet");
  } else if (state.status === "correct") {
    // 🔴 THE ASYMMETRY §31.2 IS BUILT ON. A ✓ that was only recognised is provisional and owes a
    // production probe; a false ✓ costs skipping something unknown, which is invisible and
    // compounds, while a false ✕ costs re-teaching something known and self-corrects.
    provisional = state.demonstratedAt !== null && !entails(state.demonstratedAt, "independent");
    score = provisional ? BAND.provisional : BAND.due;
    reasons.push(provisional ? "recognised-not-produced" : "due-again");
  } else {
    // Incorrect, partial, or an opportunity that produced nothing. The learner has shown us where
    // the gap is, which is worth exactly as much as an unknown until the modifiers speak.
    score = BAND.owed;
    reasons.push("fell-short");
  }

  // ── modifiers: they discriminate WITHIN a band and can never cross one ────
  //
  // 🔴 ACCUMULATED, THEN CLAMPED ONCE — see `MODIFIER_CEILING`. Applying each directly to `score`
  // was how the band guarantee came to be false while a comment promised it: every new term was one
  // more thing to fit inside a gap by hand, and the arithmetic was never redone.
  let delta = 0;

  const failures = Math.min(unresolvedAttempts(evidence), MAX_FAILED_ATTEMPTS);
  if (failures > 1) {
    // 🔴 REPEATEDLY UNRESOLVED IS THE STRONGEST GAP SIGNAL THE LEARNER GIVES US, and the old
    // selector could not see it at all: within a tier it fell back to identity-key order, so
    // something failed three times waited behind something failed once for no reason anybody chose.
    delta += failures * PER_FAILED_ATTEMPT;
    reasons.push("repeatedly-unresolved");
  }

  const blocked = Math.min(blockedDependents, MAX_BLOCKED_DEPENDENTS);
  if (blocked > 0 && state.status !== "correct") {
    // 🔴🔴 I11, WALKED. The learner missed something that starts where this one ends, so this is the
    // step underneath it — "move down, teach the prerequisite, return", which had no edge to walk
    // until `objective-prerequisites.ts`.
    //
    // 🔴 ONLY WHILE THIS ONE IS ITSELF UNRESOLVED. A prerequisite the learner has already
    // demonstrated is not what is blocking them, and promoting it would send someone who missed the
    // second step back to a first step they have proved twice — which reads as the system losing
    // the thread just as badly as asking the same question again.
    delta += blocked * PER_BLOCKED_DEPENDENT;
    reasons.push("unlocks-other-work");
  }

  if (retrievability !== null && state.status === "correct" && !provisional) {
    // 🔴 ONLY THE PLAIN `due` CASE — NOT `unknown`, NOT `owed`, AND NOT A PROVISIONAL ✓. Retrievability
    // is a prediction about how much a KNOWN thing has decayed; it is not defined the same way for
    // something never demonstrated, and a recognition-level pass has its OWN eligibility mechanism
    // (`stillHeld`, working memory) that this must not compete with or duplicate. The band gap keeps
    // this modifier from ever crossing into `provisional` even if the guard above were loosened, but
    // the guard is here anyway so the reason in the trace only ever describes what it actually is.
    //
    // 🔴 MORE DECAYED, WORTH MORE — the direction due/overdue has to move a score for "overdue"
    // to mean anything. Two objectives both merely ELIGIBLE (`eligibleForRetrieval`, untouched by
    // this) can still be very differently overdue, and today they scored identically: `due` is flat.
    delta += Math.round((1 - retrievability) * OVERDUE_SCALE);
    reasons.push("increasingly-overdue");
  }

  if (terminologyFriction && state.status !== "correct") {
    // 🔴 THE LEARNER TOLD US THIS DIRECTLY, WITHOUT BEING ASKED — they stopped and looked up a word
    // this objective is built from, more than once. That is the only signal in the whole selector
    // the learner volunteers rather than produces under a question.
    //
    // 🔴 NOT ON SOMETHING ALREADY DEMONSTRATED, for the same reason as the prerequisite term: having
    // needed a definition on the way to producing the answer is not a reason to come back to
    // material they have proved.
    delta += TERMINOLOGY_FRICTION;
    reasons.push("terminology-in-the-way");
  }

  if (interveningActs >= DISPLACEMENT) {
    reasons.push("displaced-since");
  } else if (state.lastEvidenceAt) {
    // Touched, and nothing has come between. Asking again now measures whether they can still hear
    // their own voice. Ranked down rather than removed — see `JUST_WORKED_PENALTY`.
    delta -= JUST_WORKED_PENALTY;
    reasons.push("just-worked");
  }

  // 🔴 A TRACE ENTRY, NEVER A MODIFIER — SCAFFOLDING DOES NOT TOUCH `delta`. Whether this objective
  // is worth doing is already answered by the band and the modifiers above; asking it at a narrower
  // rung is a decision about HOW, made by `scaffold-decision.ts` from the same evidence, and it must
  // not be double-counted here as a second reason to rank the objective itself higher or lower. What
  // it must do is be VISIBLE: "why did Nemesis ask it this way" needs the same kind of inspectable
  // answer as "why did Nemesis ask it at all", and this is that answer's home in the trace.
  if (action.type === "retrieve" && action.rung !== "independent") {
    reasons.push("scaffold-narrowed");
  }

  return { reasons, score: score + clampToBand(delta) };
}

/** A modifier sum, held inside the ceiling that keeps it from crossing a band. */
function clampToBand(delta: number): number {
  return Math.max(-MODIFIER_CEILING, Math.min(MODIFIER_CEILING, delta));
}

/**
 * The property `MODIFIER_CEILING` exists to hold, computed from the bands rather than asserted.
 *
 * 🔴 EXPORTED SO A TEST CAN ASK THE MODULE, NOT A CONSTANT. The invariant is "no combination of
 * modifiers lifts an action out of its band", and the honest way to check it is to derive the
 * smallest gap between adjacent bands from the bands themselves — so adding a band, or moving one,
 * re-runs the check instead of quietly invalidating a number somebody wrote down once.
 */
export function modifierCeilingHoldsBands(): { smallestGap: number; worstSwing: number } {
  const values = [...new Set(Object.values(BAND))].sort((a, b) => a - b);
  let smallestGap = Number.POSITIVE_INFINITY;
  for (let i = 1; i < values.length; i += 1) {
    smallestGap = Math.min(smallestGap, values[i]! - values[i - 1]!);
  }
  // A lower band pushed all the way up, against a higher band pulled all the way down.
  return { smallestGap, worstSwing: MODIFIER_CEILING * 2 };
}

/**
 * The most valuable of several candidate actions.
 *
 * 🔴 TIES BREAK ON THE CALLER'S ORDER, WHICH IS ALREADY STABLE. Two genuinely equal candidates must
 * resolve the same way on every render, or the same canvas asks a different question after a reload
 * and nothing looks wrong. `Array.prototype.reduce` keeps the first of equals, which is what makes
 * this stable without a second sort.
 */
export function mostValuable<T>(candidates: readonly T[], valueOf: (candidate: T) => ActionValue): T | undefined {
  if (candidates.length === 0) return undefined;
  let best: T = candidates[0]!;
  let bestValue = valueOf(best);
  for (const candidate of candidates.slice(1)) {
    const candidateValue = valueOf(candidate);
    if (candidateValue.score > bestValue.score) {
      best = candidate;
      bestValue = candidateValue;
    }
  }
  return best;
}
