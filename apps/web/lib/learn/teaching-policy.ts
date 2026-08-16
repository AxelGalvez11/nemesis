// What the learner should do NEXT, chosen from what they have already demonstrated.
//
// 🔴 THIS IS NOT `canvas-policy.ts`, AND THE DIFFERENCE IS THE WHOLE POINT. That module answers
// "what should the canvas do about the answer just given" — reactive, running after a performance,
// reading one evaluation. This one answers "what is worth doing at all", from durable learner state
// that may have been established in a completely different session. Different questions on
// different axes; neither replaces the other.
//
// 🔴 ONE DECISION, FROM THE CURRENT STATE, AND THEN IT IS DONE. There is deliberately no sequence
// in here — no "if unknown: teach, then recall, then test". That would be the six-stage machine
// moved into a new file, which is exactly what this architecture exists to remove. The loop lives
// OUTSIDE: state → action → evidence → new state → ask again. Each call sees only where the learner
// is now, so the same state always yields the same action and nothing accumulates in here.
//
// 🔴 AND IT IS DETERMINISTIC. No model call, no randomness. A policy that cannot be replayed cannot
// be debugged, and "why did Nemesis ask me this?" has to have an answer better than "it felt like
// it". Every action carries `because` for exactly that reason.
//
// 🔴 ASSOCIATION RECALL ONLY. This is the first executable piece of the eventual policy, not the
// learning algorithm. It is deliberately small enough to be obviously correct.

import { expositionFor, NO_EXPOSITION, type Exposition } from "./cognitive-mode";
import type { LearnerEvidence, LearnerObjectiveState } from "./learner-evidence";
import type { LearningObjective } from "./learning-objective";
import type { KnowledgeObject } from "./knowledge-types";
import { eligibleForRetrieval } from "./retrieval-eligibility";
import { scaffoldRungFor } from "./scaffold-decision";
import { entails, type ScaffoldRung } from "./scaffold-rung";
import { answerStillHeld } from "./working-memory";

/**
 * A single thing to do. An ACTION, never a STAGE.
 *
 * 🔴 THE DISTINCTION MATTERS MORE THAN IT LOOKS. An action is local — one move, after which the
 * policy runs again on whatever the learner produced. A stage dictates the rest of the session:
 * enter `LearnStage` and the next three things are decided before the learner has done anything.
 * The names stay small on purpose.
 */
export type TeachingAction =
  /**
   * Ask them to produce it. The only action that generates new evidence.
   *
   * 🔴 `rung` IS REQUIRED, NOT OPTIONAL — the same discipline `RetrievalPrompt.rung` already holds in
   * `objective-task.ts`, for the same reason: an optional field defaults to absent, and absent would
   * read as "we do not know what demand this asks at" about a decision this function just made and
   * therefore always knows the answer to. Every branch that returns `retrieve` states it explicitly;
   * see `scaffold-decision.ts` for the one branch where it is actually computed rather than fixed at
   * `"independent"`.
   */
  | { type: "retrieve"; objectiveId: string; because: string; rung: ScaffoldRung }
  /** State the answer plainly. For a wrong attempt, or an opportunity that produced nothing. */
  | { type: "show_correction"; objectiveId: string; exposition: Exposition; because: string }
  /**
   * Put the material in front of them before asking anything — §40's `teach`.
   *
   * 🔴 NOT `show_correction` WITH A DIFFERENT NAME, AND THE DIFFERENCE IS A CLAIM ABOUT THE LEARNER.
   * A correction is owed to an attempt that fell short and says so; teaching is owed to material
   * nobody has met and asserts nothing about whether the learner already knew it. Merging them would
   * mean a learner opening a fresh canvas is told they got something wrong.
   *
   * 🔴 AND IT IS DELIBERATELY NOT THE DEFAULT OPENING. `unknown` still ASKS — "unknown means Nemesis
   * lacks evidence, not that the learner lacks knowledge" is unchanged and is the invariant this
   * action is most likely to erode. Teaching first is a decision a controller has to justify from
   * what it knows, not the shape of every session.
   */
  | { type: "teach"; objectiveId: string; exposition: Exposition; because: string }
  /**
   * Say the same thing in plainer language — §40's `simplify`.
   *
   * 🔴 THE OWNER'S OWN RULE FOR TERMINOLOGY FRICTION, MADE AN ACTION. Their instruction was
   * *"simplifies language under terminology friction"* — the response to a learner tripping over the
   * material's words is to change HOW it is put, never to quietly stop asking. `next-action-value.ts`
   * already ranks friction UP for that reason; this is the move that ranking was pointing at and
   * which did not exist until now.
   */
  | { type: "simplify"; objectiveId: string; exposition: Exposition; because: string }
  /** Put the confusable items side by side, then ask for both. Only for a named competing model. */
  | {
      type: "contrast";
      objectiveIds: string[];
      competingWith: readonly string[];
      exposition: Exposition;
      because: string;
    }
  /** Hold this one for now — acting again this soon would teach nothing. Come back after other work. */
  | { type: "defer"; objectiveId: string; because: string }
  /**
   * Put this down for a LATER SITTING, not for later in this one — §40's `revisit later`.
   *
   * 🔴🔴 A DIFFERENT DECISION FROM `defer`, AND COLLAPSING THEM IS WHAT KEPT THE DRILL TRAP ALIVE.
   * `defer` says "the answer is still in working memory, come back after other work" — it holds an
   * objective for minutes and the loop returns to it inside the same sitting. `revisit` says "this
   * is not what the next minute of this session is worth", which is a judgement about the SITTING'S
   * BUDGET rather than about working memory. A controller that could only defer would meet the same
   * objective again a few items later for ever, which is exactly what
   * `docs/canvas-teaching-policy-audit.md` §3 measured: eight consecutive misses, every one answered
   * with "ask again".
   *
   * 🔴 AND IT IS NOT AN ABANDONMENT. Nothing is written, no state changes, the objective keeps every
   * piece of evidence it had, and the next sitting sees it exactly as before. It costs the learner
   * nothing to be wrong about; drilling them for the rest of the hour costs the whole hour.
   */
  | { type: "revisit"; objectiveId: string; because: string }
  /**
   * Nothing here is worth the next minute. Move forward.
   *
   * 🔴🔴 `objectiveId` IS NEW AND IT IS THE POINT. This used to carry only a reason, because the only
   * way to reach it was "this objective is demonstrated and not due" — an absence, not a decision.
   * The owner's ruling is that *"advance and defer must be first-class decisions. They must not
   * merely occur because every other action disappeared."* A first-class `advance` names what it is
   * moving on FROM, so "we moved on from something they had not mastered" is a fact in the record
   * rather than an inference from silence — and `strategy-outcomes.ts` can then ask the question that
   * actually matters: did moving on later cost them anything downstream?
   *
   * Absent means the whole canvas has nothing owed, which is the original meaning and still occurs.
   */
  | { type: "advance"; because: string; objectiveId?: string };

/**
 * What the learner is being asked to take in, for any action — §39.
 *
 * 🔴 THE EXPOSITION LIVES ON THE ACTIONS THAT HAVE ONE, AND THIS IS THE TOTAL FUNCTION OVER ALL
 * FIVE. Putting `exposition` on every variant would have meant writing `{ mode: "none" }` on
 * `retrieve`, `defer` and `advance` — a field that is always the same value is a field the next
 * editor sets wrongly. Putting it only where it exists makes "does this present something?" a
 * question the type answers, and this function is the one place the answer is read.
 *
 * 🔴 A NEW ACTION CANNOT SILENTLY INHERIT AN ANSWER. The switch is exhaustive over the union, so
 * adding a sixth action is a compile error here rather than a screen that quietly acquires — or
 * quietly loses — the product's only button.
 */
export function expositionOf(action: TeachingAction): Exposition {
  switch (action.type) {
    case "show_correction":
    case "contrast":
    // 🔴 THE TWO NEW EXPOSITIONS SHARE THIS BRANCH BECAUSE THEY ARE THE SAME KIND OF EVENT. Teaching
    // and simplifying both put material in front of the learner to process, exactly as a correction
    // and a contrast do; what differs is why it is owed, which is the action's own business and not
    // the mode's. Giving either its own mode would let one of them auto-advance past material the
    // other holds still for, which is §39's whole complaint about verdicts deciding advancement.
    case "teach":
    case "simplify":
      return action.exposition;
    // 🔴 NOT AN ABSENCE OF INFORMATION — A RETRIEVAL ASKS FOR PRODUCTION AND A HOLD SHOWS A STATUS.
    // Neither puts material in front of the learner to process, and saying so is different from
    // saying nothing. See `DeclaredMode`'s `"none"` in canvas-continue.ts: the consumer treats an
    // un-emitted mode as a defect, and a retrieval reporting one would be reporting a defect that
    // is not there.
    //
    // 🔴 `revisit` AND `advance` PRESENT NOTHING BY CONSTRUCTION. Both are decisions to spend the
    // next minute elsewhere; the learner sees whatever comes next, never a screen announcing that
    // something was skipped. A "we are moving on from X" card would be progress clutter, and would
    // also be the one place the system told a learner they had failed at something.
    case "retrieve":
    case "defer":
    case "revisit":
    case "advance":
      return NO_EXPOSITION;
  }
}

export interface TeachingPolicyInput {
  objective: LearningObjective;
  knowledgeObject: KnowledgeObject;
  learnerState: LearnerObjectiveState;
  /**
   * This objective's recent evidence, most recent last.
   *
   * 🔴 THE ONLY EXTRA INPUT, AND IT EARNS ITS PLACE. It answers a question the projected state
   * cannot: how long ago. Without it the policy would show a correction, be asked again a second
   * later, and show the same correction — a loop that looks like teaching and is not.
   *
   * 🔴 NO RETENTION, NO CALENDAR, NO PREREQUISITES, NO AVAILABLE TIME. Those are real inputs to a
   * real policy and none of them are needed to make the decisions below, so adding them now would
   * be guessing at an interface before anything exercises it.
   */
  recentEvidence: readonly LearnerEvidence[];
  /** Injected so every decision is reproducible in a test rather than depending on the clock. */
  now: Date;
  /**
   * Has this objective's correction already been put in front of the learner in this session?
   *
   * 🔴 THE ONE FACT THE EVIDENCE LOG CANNOT HOLD, AND THAT IS NOT AN OVERSIGHT. Receiving a
   * correction is not a demonstration — "viewing is not evidence" is a hard invariant, and writing
   * a row when someone reads an answer would be exactly the absence-as-evidence defect this whole
   * model refuses. So the log is silent about it by design, which leaves the policy unable to tell
   * "they have just been told" from "they have never been told", and it answered both the same way
   * for ever. `decideNext` already names the gap: *"showing a correction produces no new evidence,
   * so the state that asked for it is unchanged, so it asks again."*
   *
   * 🔴 SESSION STATE, PASSED IN, NEVER ACCUMULATED HERE. The policy stays a pure function of its
   * inputs — same inputs, same action — and this is an input like `now` and `recentEvidence`. It is
   * a fact about what the RUNTIME has already displayed, never a claim about the learner, and
   * nothing durable is written from it.
   *
   * 🔴 AND IT IS SPECIFICALLY "A CORRECTION WAS SHOWN", NOT `actedOn`. They are not the same set
   * and using the wrong one inverts this fix: `acknowledge()` adds an objective to `actedOn` when
   * the learner clears the FEEDBACK screen after answering — which happens BEFORE the correction is
   * ever displayed. Reading `actedOn` here would defer at the exact moment the correction is owed,
   * and a learner who got something wrong would never be shown the answer at all.
   *
   * Absent means not shown, which is the honest reading for a caller that does not track it.
   */
  correctionAlreadyShown?: boolean;
  /**
   * How many OTHER objectives have been worked since this one was last acted on.
   *
   * 🔴 THE HALF OF THE OWNER'S OWN TEMPO BRIEF THAT WAS NEVER BUILT. They asked for material that
   * *"comes back within the same sitting, after OTHER MATERIAL HAS INTERVENED"*; only the clock half
   * existed. §39's consequence 2 asks for the same instrument from the other direction — a window
   * that continues after the answer leaves the screen — and a count of intervening work is what
   * measures it. See `working-memory.ts`.
   *
   * 🔴 SESSION STATE, PASSED IN, NEVER ACCUMULATED HERE, exactly like `correctionAlreadyShown` and
   * `now`. It is a fact about what the RUNTIME has staged, never a claim about the learner, and
   * nothing durable is written from it.
   *
   * Absent means zero — nothing has intervened — which is the honest reading for a caller that does
   * not track it, and the conservative one: it can only hold an objective back, never release it.
   */
  interveningActs?: number;
}

/**
 * 🔴 ACTING AGAIN INSIDE THIS WINDOW TEACHES NOTHING. Asking someone the same thing four minutes
 * after they answered measures whether they can still hear their own voice; showing a correction
 * twice in a row is just the same sentence twice. The policy holds instead, and the loop brings the
 * objective back after intervening work.
 *
 * Deliberately crude, and deliberately NOT a retention estimate — that is exactly the "add the
 * field when a real decision needs it" line. When real retrievability exists it supersedes this.
 */
export const ACT_AGAIN_AFTER_MS = 60 * 60 * 1000;

function msSince(state: LearnerObjectiveState, now: Date): number {
  if (!state.lastEvidenceAt) return Number.POSITIVE_INFINITY;
  return now.getTime() - Date.parse(state.lastEvidenceAt);
}

export function chooseNextTeachingAction(input: TeachingPolicyInput): TeachingAction {
  const { learnerState: state, objective } = input;
  const id = objective.identityKey;
  const sinceMs = msSince(state, input.now);
  const actedJustNow = sinceMs < ACT_AGAIN_AFTER_MS;
  // 🔴 THE §39 WINDOW: could the answer still be in working memory? It reuses `ACT_AGAIN_AFTER_MS`
  // as its decay term rather than minting a second interval, and clears as soon as other material
  // has intervened — so it is never longer than the churn guard it replaces on that branch, only
  // shorter. See `working-memory.ts` for why displacement rather than a clock.
  const stillHeld = answerStillHeld({
    decayAfterMs: ACT_AGAIN_AFTER_MS,
    interveningActs: input.interveningActs ?? 0,
    sinceMs,
  });
  // What kind of cognitive object this objective's exposition would be, if one is emitted below.
  // Derived from the knowledge type and the capability — never from the verdict (§39).
  const exposition = (kind: "correction" | "contrast"): Exposition =>
    expositionFor({
      capability: objective.capability,
      kind,
      knowledgeType: input.knowledgeObject.type,
    });

  switch (state.status) {
    // 🔴 UNKNOWN ASKS RATHER THAN TELLS, AND THAT IS THE WHOLE POINT OF THE STATE. Unknown means
    // NEMESIS LACKS EVIDENCE — it does not mean the learner lacks knowledge. Opening with "you
    // haven't learned this yet, first read this" asserts something nobody has observed, and spends
    // the learner's attention on material they may already hold. Asking costs seconds and settles
    // it. This is "prefer a task that reveals the learner over a question about them", executed.
    case "unknown":
      // 🔴 `unknown` NO LONGER IMPLIES "NEVER ASKED", AND THIS BRANCH WAS BUILT WHEN IT DID. It used
      // to return `retrieve` unconditionally, which was safe only because zero evidence meant nobody
      // had touched the objective — "have we just asked this?" answered itself. Once an uncertain
      // judgement can leave a learner at `unknown` WITH evidence, that assumption is gone, and
      // without this guard someone whose answers keep being read uncertainly gets the identical
      // question back instantly, for ever. That is the correction dead end pointed the other way:
      // there the learner could not answer their way out, here the answer never resolves anything.
      //
      // 🔴 `actedJustNow` ALONE, AND THE REDUNDANT HALF WAS REMOVED RATHER THAN LEFT LOOKING
      // LOAD-BEARING. The obvious form of this is `state.evidenceCount > 0 && actedJustNow`, to keep
      // a never-asked objective from being deferred. It is unnecessary: `msSince` returns
      // POSITIVE_INFINITY when `lastEvidenceAt` is null, so an objective nobody has touched can
      // never be "just acted on". Calibration proved it — deleting that clause turned no test red,
      // which is the tell that a condition is decoration. A guard that cannot fail is worse than no
      // guard, because the next reader budgets for protection that is not there.
      //
      // What makes this work is that `lastEvidenceAt` counts EVERY row, including the ones whose
      // verdict was too uncertain to conclude from. The attempt happened; only the conclusion is
      // missing. That is exactly why the projection keeps it as an observation.
      if (actedJustNow) {
        return {
          because: `this was just attempted and the reading settled nothing — another go should follow some intervening work`,
          objectiveId: id,
          type: "defer",
        };
      }
      return {
        because: state.evidenceCount > 0
          // 🔴 SAYS WHAT IS TRUE OF THIS LEARNER. Evidence exists; what is missing is a reading we
          // would stand behind. These strings are the answer to "why did Nemesis ask me this?", and
          // "no evidence exists" would be a plain falsehood to exactly the people it is shown to.
          ? `"${objective.label}" has been attempted, but nothing conclusive came back — asking again is the only way to settle it`
          : `no evidence exists for "${objective.label}" — asking settles it, and telling would assert something unobserved`,
        objectiveId: id,
        // 🔴 ALWAYS `independent`, NEVER SCAFFOLDED. `unknown` means EVIDENCE IS MISSING OR
        // UNREADABLE — a judge that could not reach a confident verdict, or nobody has asked at all.
        // Neither is the "repeated unaided miss" signal `scaffold-decision.ts` looks for, and
        // narrowing the question here would treat a readability problem as a difficulty problem.
        rung: "independent",
        type: "retrieve",
      };

    // 🔴 A NAMED COMPETING MODEL IS IN THE WAY, so retrieval alone keeps returning the same wrong
    // answer: the learner is not failing to remember, they are remembering something else. Put the
    // confusable pairs side by side, then ask for both. This is the first place the KIND of
    // evidence changes the pedagogy rather than just the wording.
    case "misconception": {
      const competing = [...new Set(
        input.recentEvidence
          .filter((e) => e.verdict === "misconception")
          .flatMap((e) => e.misconceptions ?? []),
      )];
      return {
        because: `a specific competing answer keeps surfacing, so the pair needs separating before another retrieval is worth asking for`,
        competingWith: competing,
        // 🔴 ALWAYS DELIBERATE, WHATEVER THE KNOWLEDGE TYPE — §39's misconception row is the one
        // unconditional **Yes** in the table. `expositionFor` refuses to consult the type for a
        // contrast, so this cannot become transient by someone adding an association shortcut.
        exposition: exposition("contrast"),
        // Only this objective is named. Resolving the COMPETING objective is a lookup over the
        // learner's other knowledge, which belongs to the caller that holds it — not to a decision
        // function that is supposed to stay pure.
        objectiveIds: [id],
        type: "contrast",
      };
    }

    // Wrong, or right about only part of it. Both want the answer stated plainly and another
    // attempt later — 🔴 NOT the identical question a millisecond afterwards, which tests nothing.
    //
    // 🔴 "LATER" HAD NEVER BEEN BUILT, AND THE INTENT WAS WRITTEN DOWN IN THIS FUNCTION'S OWN
    // REASONS. They said the answer is worth stating "before another attempt" and "before asking
    // again" — and there was no again. Every route into this branch returned `show_correction`, at
    // every elapsed time out to a year, and the correction screen has no answer box. Evidence only
    // changes by answering, so status could never leave `incorrect`: get something wrong once and
    // Nemesis showed you the answer, then showed you the same answer every time that objective came
    // round, for ever, and never asked you again. **The one thing that would fix their state was the
    // one thing they were never offered.** Someone wrote the sequence correctly and built the first
    // half of it.
    case "incorrect":
    case "partial":
    // 🔴 AN OPPORTUNITY PASSED AND NOTHING CAME BACK — revealed, gave up, unreadable, or a
    // judgement too uncertain to be one. They did not give a wrong answer, so they must not be told
    // they were wrong; the renderer keeps that distinction. But the shape of what is owed is
    // identical to the two states above — state it, then come back and ask — so the routing is
    // shared rather than duplicated, and the three cannot drift apart.
    case "not_demonstrated": {
      // 🔴 THE CORRECTION BELONGS TO THE MOMENT THE ATTEMPT FELL SHORT, NOT TO THE OBJECTIVE FOR
      // EVER. Once the churn window has passed, showing the same answer a second time teaches
      // nothing that showing it once did not — what is owed then is the attempt the correction was
      // stated in aid of. This is the ONLY guard on this branch and it is the existing one: no new
      // interval, no second knob, nothing to tune. `ACT_AGAIN_AFTER_MS` already asks exactly the
      // right question here — "have we just touched this?" — and its answer simply had no bearing
      // on the outcome before.
      //
      // 🔴🔴 AND THE WINDOW IS NOW WORKING MEMORY, NOT AN HOUR — §39 CONSEQUENCE 1. This read
      // `!actedJustNow`, which is `ACT_AGAIN_AFTER_MS`, which is SIXTY MINUTES. Measured across the
      // real decision rather than reasoned from the constant:
      //
      //     answered CORRECTLY   ->  askable again after 10 minutes  (the owner's ruled tempo)
      //     answered WRONGLY     ->  correction shown once, then `defer` for the rest of the hour
      //
      // and `decideNext` filters `defer` out of `owed` entirely, so between ten and sixty minutes
      // the canvas offered the objective the learner had ALREADY DEMONSTRATED and withheld the one
      // they had just failed. **Getting something wrong made Nemesis less likely to ask you about
      // it.** In a twenty-minute sitting a failed objective never came back at all.
      //
      // That is §39's consequence 1 — *"exposure must not reduce priority; Nemesis schedules
      // another retrieval later"* — inverted, and it was live. It is a defect, not a design.
      //
      // 🔴 THE FIX INTRODUCES NO NEW NUMBER. `answerStillHeld` clears as soon as ONE other objective
      // has been worked, and falls back to this same `ACT_AGAIN_AFTER_MS` only where nothing can
      // intervene. It is a disjunction, so it is never longer than the guard it replaces — the
      // objective can only come back sooner, never later. A failed objective now returns after the
      // next item, which is sooner than a passed one's ten minutes, which is the order every
      // spaced-repetition system uses and the order §39 requires.
      if (!stillHeld) {
        // 🔴 §33, EXECUTED — THE ONE BRANCH WHERE SCAFFOLDING IS AN ACTUAL DECISION. This is
        // specifically the retrieval offered AFTER an attempt fell short, which is exactly the
        // evidence `scaffoldRungFor` reads: a trailing run of unresolved attempts at THIS objective,
        // stopping at the last one that resolved. One miss stays `independent` — see that file for
        // why the bar is two, not one. `unknown`'s retrieve above and `correct`'s below are both
        // deliberately excluded: the first is a readability gap, not a difficulty one, and the second
        // is a targeted probe that must ask at full demand or it proves nothing.
        const scaffold = scaffoldRungFor(input.recentEvidence);
        const base = state.latestVerdict
          ? `this fell short and the answer has already been stated, and other material has come between — asking is what is owed now, not stating it again`
          : `an opportunity passed with nothing demonstrated and other material has come between, so the next thing owed here is a real attempt`;
        return {
          because: scaffold.rung === "independent"
            ? base
            : `${base} — the last ${scaffold.streak} unaided attempts at this fell short, so this one narrows the scope instead of repeating the same question`,
          objectiveId: id,
          rung: scaffold.rung,
          type: "retrieve",
        };
      }

      // Inside the window, and they have already read it. Repeating the card is the loop that looks
      // like teaching and is not — 🔴 and the condition that used to sit here was `state.evidenceCount
      // > 1`, so a learner who got something wrong ONCE never even reached this line. Whether they
      // have been shown the answer is the question; how many times they have been assessed is not.
      if (input.correctionAlreadyShown) {
        return {
          because: `the answer has just been shown, so the next attempt should follow some intervening work`,
          objectiveId: id,
          type: "defer",
        };
      }

      return {
        // 🔴 §39 — THE MODE OF WHAT IS ABOUT TO BE SHOWN, DECIDED HERE, WHERE THE POLICY KNOWS WHAT
        // KIND OF OBJECT IT IS EMITTING. An association's correction is one line and moves on by
        // itself; a causal or procedural one is material to be read and waits for the learner. The
        // three statuses below share this renderer and therefore share this mode — which is the
        // point: `incorrect`, `partial` and `not_demonstrated` are three verdicts, and §39 says a
        // verdict must not decide advancement.
        exposition: exposition("correction"),
        because: state.status === "partial"
          ? `part of this was demonstrated and part was missing — the answer is worth stating plainly before asking again`
          : state.status === "incorrect"
            ? `the last attempt contradicted this objective, so the correct answer is worth stating before another attempt`
            : state.latestVerdict
              ? `no retrieval was obtained this time, though this was demonstrated before — showing it beats asking again immediately`
              : `an opportunity passed with no usable demonstration, so the answer is worth showing before asking again`,
        objectiveId: id,
        type: "show_correction",
      };
    }

    // 🔴 DEMONSTRATED. Move on — for now, and ONLY for now. Nothing here requires a separate Test
    // stage to re-verify what was just shown to work; that is the fixed sequence this architecture
    // removes. It does not come back because a session template says there are more steps left.
    //
    // 🔴 BUT "MOVE ON" USED TO MEAN "FOR EVER", AND THAT WAS THE DEFECT. Both branches returned
    // `advance`, `decideNext` never selects an `advance`, and `projectLearnerState` has no clock —
    // so a demonstrated objective was not deprioritised, it was EXCLUDED. Measured: answered
    // correctly a year ago, still `null`. The comment above used to promise it would "come back
    // later on its own merits, once forgetting is modelled"; nothing had checked whether that day
    // had arrived, and it had not.
    case "correct": {
      // 🔴 §31.2 — A ✓ THAT WAS ONLY RECOGNISED IS PROVISIONAL, AND OWES A PRODUCTION PROBE BEFORE
      // IT COUNTS. This is the asymmetry, and it is the whole reason §33's ladder was built:
      //
      //     sweep ✕  →  act immediately         the branches above already do this
      //     sweep ✓  →  PROVISIONAL             a production probe before it counts
      //
      // A false ✕ costs re-teaching something known — annoying, and self-correcting. A false ✓
      // costs skipping something unknown — invisible, and compounding under §22 scheduling. The
      // asymmetry also makes the probes cheap: production is spent ONLY on what looked strong.
      //
      // 🔴 IT FALLS OUT OF THE RUNG RATHER THAN BEING A SECOND MECHANISM. There is no `provisional`
      // flag to set, clear, or forget to clear: the evidence already records that the learner
      // discriminated rather than produced, so "has this been shown at production level?" is
      // answerable from the log alone. A boolean would have been session state that a reload loses.
      //
      // 🔴 AND IT IS DELIBERATELY NOT `!satisfies(state, "independent")`, WHICH WOULD BE THE
      // OBVIOUS LINE AND WOULD BE WRONG HERE. `satisfies` refuses a rungless demonstration, because
      // what may be CLAIMED must under-claim. What to DO is a different question, and the fact on
      // the ground settles it: this runtime has only ever staged unaided retrieval, so every
      // pre-§33 row IS an independent production that simply predates the label. Probing them all
      // would re-ask hundreds of genuinely demonstrated objectives to relabel history. So the probe
      // is owed only where the rung is KNOWN and known to be below production.
      const provisional = state.demonstratedAt !== null && !entails(state.demonstratedAt, "independent");
      if (provisional) {
        // Invariant 3 — never ask a question whose answer the learner is still holding. Not the
        // eligibility window: confirming a recognition is not a scheduling decision about
        // forgetting, so it must not wait for a spacing interval.
        //
        // 🔴 THE SAME `stillHeld`, DELIBERATELY, SO THE FILE HOLDS ONE DEFINITION OF THE WINDOW
        // RATHER THAN TWO. This branch's own comment used to say *"the answer is still on screen"*,
        // which is §34 invariant 3's ORIGINAL wording — the exact sentence §39 strengthened to
        // "still in working memory". Leaving the old guard here would have kept the superseded
        // reading alive next to the new one.
        //
        // 🔴 UNREACHABLE ON TODAY'S DATA, AND SAID SO RATHER THAN COUNTED AS COVERAGE. Nothing yet
        // stages a task below `independent`, so no evidence carries a rung this branch can read. It
        // is consistency with the reachable branch, not a verified behaviour change.
        if (stillHeld) {
          return {
            because: `this was recognised a moment ago and the answer is still being held — the confirming attempt should follow some intervening work`,
            objectiveId: id,
            type: "defer",
          };
        }
        return {
          because: `this was recognised rather than produced, so what it establishes is that the learner can pick it out — asking them to produce it is what would settle whether they know it`,
          objectiveId: id,
          // 🔴 ALWAYS `independent`, NEVER SCAFFOLDED — THE ONE PLACE THIS WOULD BE SELF-DEFEATING.
          // This probe exists to settle whether a recognition-level pass generalises to production
          // (§31.2). Narrowing it would ask the learner to recognise again and call the result a
          // production probe, which proves nothing beyond what is already on record.
          rung: "independent",
          type: "retrieve",
        };
      }

      // 🔴 EXACTLY ONE INTERVAL GOVERNS TEMPO HERE, AND THE CONJUNCTION THAT USED TO SIT ON THIS
      // LINE IS WHY THAT SENTENCE HAS TO BE WRITTEN DOWN. This read `!actedJustNow &&
      // eligibleForRetrieval(...)`. `actedJustNow` is measured against `ACT_AGAIN_AFTER_MS`, so a
      // learner waited the LONGER of the two and the owner's ruling on tempo was inert anywhere
      // below one hour. Measured, not reasoned: the constant moved 60 min → 10 min and the decision
      // table did not change by a single row.
      //
      // The two constants answer different questions, which is why only this branch changed.
      // `ACT_AGAIN_AFTER_MS` asks "have we just TOUCHED this objective?" — a churn guard, blind to
      // the outcome, and the ONLY guard on the three branches above, where it still does real work.
      // Eligibility asks "is this demonstrated objective DUE?" — a scheduling decision. On THIS
      // branch it is the more specific of the two and never looser, so it subsumes the churn guard.
      //
      // 🔴 LAYER 1 DID NOT LEAVE, IT MOVED FROM THE DECISION ONTO THE CONFIGURATION. Never
      // re-asking the thing just answered is now guaranteed by the floor asserted at module scope
      // in `retrieval-eligibility.ts`: a tempo short enough to reopen the immediate repeat cannot
      // be configured at all. A bound on the input can never out-vote the number the owner set —
      // a second interval in this condition could, and did.
      //
      // 🔴 AND THIS IS THE SEAM. Eligibility is consulted from exactly one place. When "when does
      // this return?" stops being a constant READ and becomes a question ASKED — of evidence, of
      // the operation, of prior demonstrations, of forgetting — it is this one expression that
      // changes, not the shape of the policy around it.
      if (eligibleForRetrieval({ lastEvidenceAt: state.lastEvidenceAt, now: input.now })) {
        return {
          because: `demonstrated before, and long enough ago that asking again measures memory rather than the last few minutes`,
          objectiveId: id,
          // 🔴 ALWAYS `independent`. This is a demonstrated, non-provisional objective coming back
          // for a due retrieval — a memory check, not a struggling learner. `scaffoldRungFor` reads
          // for a trailing run of FAILURES; there is none to read here by construction, so asking
          // would only relabel a fact this branch already knows.
          rung: "independent",
          type: "retrieve",
        };
      }
      return {
        because: `already demonstrated, and not yet due for another retrieval`,
        type: "advance",
      };
    }
  }
}
