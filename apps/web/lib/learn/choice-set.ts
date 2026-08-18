// The options a recognition task puts on screen, and what picking each one MEANS.
//
// 🔴 THIS IS NOT "QUIZ MODE", AND THE DISTINCTION IS THE WHOLE DESIGN. A mode is something a learner
// switches on and then stays inside; this is one shape a single retrieval can take, chosen from the
// evidence by the teaching policy and abandoned the moment the evidence says something else. Nothing
// here is selectable, nothing persists, and no learner ever sees the word "quiz".
//
// 🔴🔴 EVERY DISTRACTOR CARRIES ITS GROUND, AND THAT IS THE ONLY REASON THIS FEATURE IS WORTH
// BUILDING. Multiple choice's standing objection in this codebase is written down in `canvas-model.ts`:
// *"you cannot detect a misconception from which of four options someone clicked"*. That is true of a
// question whose wrong options were invented to fill seats. It is false of one whose wrong options
// were each MINTED FROM A NAMED COMPETING MODEL — then the option the learner picked is the belief
// they hold, stated in advance, and picking it is a sharper observation than most free text. The
// objection is answered by construction, not waived.
//
// 🔴 SO A SET WITH NOTHING MEANINGFUL TO OFFER IS REFUSED, NEVER PADDED. Five options are preferred
// and are not a target: `MAX_OPTIONS` is a ceiling on how many good distractors are used, never a
// floor anything is filled up to. Three is a correct, complete, unremarkable result. Inventing a
// fifth option to reach five would put a seat on screen that no learner could ever pick for a reason,
// which destroys the very diagnostic the paragraph above is built on.
//
// 🔴 STRUCTURAL, NEVER SUBJECT-MATTER. Every distractor below comes from a relationship the SOURCE
// or the LEARNER'S OWN EVIDENCE already stated: a class the grid set this one against, a belief a
// judge already named, an answer to a question of the same shape. Nothing here knows what any word
// means, so it builds a law student's options and a mechanical engineer's options by the same rule.
//
// 🔴 AND POSITION IS NOT DECIDED HERE. `test-answer-balance.ts` already owns "the answer must not
// always be B", including the reason a prompt rule cannot do it. It is reused rather than
// reimplemented — see `choiceSetsFor`, which is batched precisely so that module can do its job.

import { balanceAnswerPositions } from "@/lib/workspace/test-answer-balance";

import { normalizeForIdentity } from "./knowledge-identity";
import type { KnowledgeObject } from "./knowledge-types";
import type { LearnerEvidence } from "./learner-evidence";
import type { LearningObjective } from "./learning-objective";

/**
 * Why a wrong option is on the screen.
 *
 * 🔴 A REASON PER OPTION, NOT A FLAG ON THE SET. The set's value comes from being able to say what
 * ONE tap meant, and a set-level label cannot: a learner who picks the belief a judge already caught
 * them holding has told us something completely different from one who picks a neighbouring class.
 * Storing the ground per option is what lets the durable record keep that difference.
 *
 * 🔴 ORDERED BY DIAGNOSTIC VALUE, AND `groundRank` READS THAT ORDER FROM THIS DECLARATION.
 */
export type DistractorGround =
  /**
   * A competing belief this learner has already been observed to hold about THIS objective.
   *
   * 🔴 THE STRONGEST DISTRACTOR THERE IS, AND IT COSTS NOTHING TO FIND — a judge already named it,
   * and `LearnerEvidence.misconceptions` already keeps it *"so they can be taught against"*. This is
   * that sentence executed: the belief goes on screen beside the right answer, and whether the
   * learner still holds it stops being an inference and becomes an observation.
   */
  | { kind: "held_misconception"; belief: string }
  /**
   * A class the SOURCE ITSELF set this answer against — `ClassContrast.siblings`.
   *
   * 🔴 THE DOCUMENT DECIDED THIS, NOT US. A grid with a class column has already declared which
   * things are confusable with which; putting those side by side is reading the source's own
   * structure, which is why it generalises to any field that writes tables.
   */
  | { kind: "neighbouring_class" }
  /**
   * The answer to another question of the SAME SHAPE on this canvas.
   *
   * 🔴 THE WEAKEST OF THE THREE, AND IT IS MARKED AS SUCH RATHER THAN QUIETLY MIXED IN. Two
   * objectives sharing an output role ask for the same KIND of thing, so the answer to one is a
   * plausible answer to the other — plausible, but not a belief anybody has been shown to hold. A
   * set built only from these is honest and easy, which is exactly what `demandOf` reports.
   */
  | { kind: "sibling_answer" };

/** Most diagnostic first. 🔴 DERIVED FROM ONE LIST so the preference cannot be stated twice. */
const GROUND_PRIORITY: readonly DistractorGround["kind"][] = [
  "held_misconception",
  "neighbouring_class",
  "sibling_answer",
];

function groundRank(ground: DistractorGround): number {
  return GROUND_PRIORITY.indexOf(ground.kind);
}

/** One thing the learner can tap. */
export interface ChoiceOption {
  /** Exactly what is printed, and exactly what is stored when this one is picked. */
  text: string;
  correct: boolean;
  /** 🔴 ABSENT ON THE CORRECT OPTION AND PRESENT ON EVERY OTHER — the type carries the asymmetry so
   *  a consumer cannot read a distractor's meaning off the right answer. */
  ground?: DistractorGround;
}

/**
 * How hard the discrimination is.
 *
 * 🔴🔴 SEPARATE FROM RESPONSE BURDEN, WHICH IS THE OWNER'S OWN RULING AND THE THING A NAIVE MCQ
 * IMPLEMENTATION GETS BACKWARDS. Tapping is always cheap — that is the point, and it is why a
 * recognition item is worth offering to someone forty minutes into a sitting. It does not follow that
 * the QUESTION is easy. Difficulty lives in how close the wrong options are, and a three-option set
 * of near-neighbours is harder than a five-option set of unrelated answers.
 *
 * 🔴 SO IT IS NEVER READ OFF THE OPTION COUNT. `demandOf` looks only at the grounds, and a test pins
 * exactly that inversion: fewer, closer options outrank more, looser ones.
 */
export type ChoiceDemand =
  /** At least one option is a belief this learner holds, or a class the source set this against. */
  | "near"
  /** Every wrong option is merely a same-shape answer. Real, and eliminable without the mechanism. */
  | "related";

export interface ChoiceSet {
  /** In the order they are shown. Between `MIN_OPTIONS` and `MAX_OPTIONS`, inclusive. */
  options: readonly ChoiceOption[];
  /** 🔴 FROM THE GROUNDS, NEVER FROM THE COUNT. See `ChoiceDemand`. */
  demand: ChoiceDemand;
}

/**
 * Why no honest set could be built.
 *
 * 🔴 NAMES, NOT MESSAGES, SO THEY CAN BE TALLIED — the same construction `StrategyRefusal` and
 * `canvas_causal_refused` already use. "The runtime never offers recognition" and "the runtime offers
 * it and the material never supports it" look identical from outside, and only a counted reason tells
 * a deliberate choice from a lane that is quietly dead.
 */
export type ChoiceRefusal =
  /** The objective states no answer, so there is nothing to be correct about. */
  | "no-answer"
  /**
   * Fewer than `MIN_OPTIONS - 1` meaningful distractors survived.
   *
   * 🔴 THE EXPECTED OUTCOME ON MOST MATERIAL, NOT A FAULT. A canvas holding one association has no
   * neighbours to draw from and never will. Refusing is correct; padding to three would put two
   * invented options on screen, and every tap on them would mean nothing.
   */
  | "too-few-distractors";

/**
 * The smallest set worth showing.
 *
 * 🔴 THREE, NOT TWO, AND THE FLOOR IS THE POINT OF THE NUMBER. Two options is a coin flip: a learner
 * who knows nothing is right half the time, so a correct answer establishes almost nothing and the
 * evidence row would over-claim. Three is the smallest set where picking the right one is a real
 * observation.
 */
export const MIN_OPTIONS = 3;

/**
 * The most that are ever shown.
 *
 * 🔴 A CEILING ON GOOD DISTRACTORS, NEVER A TARGET. Five is preferred WHEN five genuinely plausible
 * options exist, which is the owner's wording exactly. `optionsFor` stops taking distractors when it
 * runs out of grounds, and returning three or four is a correct result rather than a shortfall — see
 * this file's header.
 */
export const MAX_OPTIONS = 5;

/** What one objective's options are built from. 🔴 Plain strings, so the core of this module can be
 *  tested without a knowledge object, and so nothing in it can reach for subject matter. */
export interface ChoiceCandidate {
  identityKey: string;
  /**
   * The sentence the learner will read.
   *
   * 🔴 CARRIED SO AN OPTION ALREADY PRINTED IN THE QUESTION CAN BE REMOVED. Asked *"what is the
   * brand for losartan?"*, an option reading `losartan` is not a distractor — the learner can see it
   * in the question and rule it out without knowing anything. It would occupy a seat and teach us
   * nothing, which is the same failure as an invented option wearing a structural disguise.
   */
  prompt: string;
  /** What a correct answer is. */
  answer: string;
  /** Competing beliefs already named for THIS objective, most recent first. */
  heldMisconceptions: readonly string[];
  /** Classes the source itself set this answer against. */
  neighbouringClasses: readonly string[];
  /** Answers to other objectives of the same shape on this canvas. */
  siblingAnswers: readonly string[];
}

interface RankedDistractor {
  text: string;
  ground: DistractorGround;
}

/**
 * Every distractor this candidate could honestly offer, best first, deduplicated.
 *
 * 🔴 THE CORRECT ANSWER AND ANYTHING ALREADY IN THE QUESTION ARE REMOVED BEFORE RANKING, not after
 * truncation. Filtering afterwards would let a discarded option consume one of the four slots and
 * silently shrink a set that had five good ones available.
 */
function distractorsFor(candidate: ChoiceCandidate): RankedDistractor[] {
  const seen = new Set<string>([normalizeForIdentity(candidate.answer)]);
  const promptText = normalizeForIdentity(candidate.prompt);
  const ranked: RankedDistractor[] = [];

  const consider = (text: string, ground: DistractorGround): void => {
    const key = normalizeForIdentity(text);
    if (!key || seen.has(key)) return;
    // 🔴 SUBSTRING, NOT EQUALITY. The cue is embedded IN the question rather than being the whole of
    // it, so an equality check would never fire and the giveaway option would ship. Both sides are
    // normalised first, so casing and the source's punctuation cannot smuggle one through.
    if (promptText.includes(key)) return;
    seen.add(key);
    ranked.push({ ground, text: text.trim() });
  };

  for (const belief of candidate.heldMisconceptions) consider(belief, { belief, kind: "held_misconception" });
  for (const neighbour of candidate.neighbouringClasses) consider(neighbour, { kind: "neighbouring_class" });
  for (const sibling of candidate.siblingAnswers) consider(sibling, { kind: "sibling_answer" });

  // Stable by construction: `consider` appends in ground order and the sort is only asked to keep
  // that order, so two distractors of the same ground stay in the order the source listed them.
  return ranked.sort((a, b) => groundRank(a.ground) - groundRank(b.ground));
}

/** 🔴 GROUNDS ONLY — see `ChoiceDemand`. Nothing here counts options. */
function demandOf(options: readonly ChoiceOption[]): ChoiceDemand {
  return options.some(
    (option) => option.ground?.kind === "held_misconception" || option.ground?.kind === "neighbouring_class",
  )
    ? "near"
    : "related";
}

/**
 * One candidate's options, in a canonical order — correct first, then distractors best first.
 *
 * 🔴 CANONICAL, NOT PRESENTED. Where the correct answer actually SITS is decided by
 * `balanceAnswerPositions` over the whole batch, for the reasons that module documents at length. A
 * caller that renders this order directly would put the answer first every single time, which is the
 * exact defect the balancer exists to prevent.
 */
export function optionsFor(candidate: ChoiceCandidate): ChoiceSet | ChoiceRefusal {
  if (!candidate.answer.trim()) return "no-answer";
  const distractors = distractorsFor(candidate).slice(0, MAX_OPTIONS - 1);
  if (distractors.length < MIN_OPTIONS - 1) return "too-few-distractors";
  const options: ChoiceOption[] = [
    { correct: true, text: candidate.answer.trim() },
    ...distractors.map((distractor) => ({
      correct: false,
      ground: distractor.ground,
      text: distractor.text,
    })),
  ];
  return { demand: demandOf(options), options };
}

/** A refusal, told apart from a set without anyone having to remember which is which. */
export function isRefusal(result: ChoiceSet | ChoiceRefusal): result is ChoiceRefusal {
  return typeof result === "string";
}

/**
 * Every candidate's options, with the correct answer's POSITION balanced across the batch.
 *
 * 🔴🔴 BATCHED FOR ONE REASON, AND IT IS A CORRECTNESS REASON RATHER THAN A PERFORMANCE ONE.
 * `balanceAnswerPositions` guarantees a DISTRIBUTION: over n questions with k options, each position
 * takes roughly n/k of the answers. Handed one question at a time it degenerates completely —
 * `balancedPositions(1, k, …)` is `[0]`, whichever way it is shuffled, so every single item would put
 * the correct answer first and a learner would learn to tap the top row without reading. Measured, not
 * reasoned: that is what the function returns for a batch of one.
 *
 * 🔴 SO THE BATCH IS THE WHOLE CANDIDATE POOL, NEVER THE OWED SUBSET. Keying it on what is still owed
 * would shrink the batch toward one as a sitting progresses, and the degenerate case would arrive
 * late in a session where nobody is looking. Keyed on the pool, the layout is a function of the canvas
 * and is the same on every turn.
 *
 * 🔴 AND NOTHING DURABLE EVER STORES A POSITION. The balancer's own header forbids re-running it over
 * a test somebody has taken, because `TestAttempt.missed` stores `picked` as an INDEX. This path
 * stores the option's TEXT (see `readSelection`), so a re-layout can never rewrite what a learner
 * picked — which is why calling it on every turn is safe here and would not be there.
 *
 * Candidates that cannot be built are simply absent from the result. 🔴 Absent means "no honest set
 * exists", which is a different fact from an empty set and is why no entry is written for them.
 */
export function choiceSetsFor(candidates: readonly ChoiceCandidate[]): Map<string, ChoiceSet> {
  const built = candidates
    .map((candidate) => ({ candidate, result: optionsFor(candidate) }))
    .filter((entry): entry is { candidate: ChoiceCandidate; result: ChoiceSet } => !isRefusal(entry.result));

  const balanced = balanceAnswerPositions(
    built.map(({ candidate, result }) => ({
      answer: result.options.findIndex((option) => option.correct),
      options: result.options.map((option) => option.text),
      q: candidate.prompt,
      // 🔴 EMPTY ON PURPOSE. The balancer leaves a question untouched when its explanation names an
      // option BY LETTER, because moving the options would make that sentence a lie. Nothing here
      // writes such an explanation, and passing one would be handing the balancer a reason to skip
      // items for a hazard this path does not have.
      why: "",
    })),
  );

  const sets = new Map<string, ChoiceSet>();
  built.forEach(({ candidate, result }, index) => {
    const laidOut = balanced[index];
    if (!laidOut) {
      sets.set(candidate.identityKey, result);
      return;
    }
    // 🔴 RE-FOUND BY TEXT, NEVER BY INDEX, AND `canvas-parse.ts` LEARNED THIS THE SAME WAY. Trusting
    // an index across a reshuffle silently inverts which option is correct, and every test that only
    // checks "a set came back" passes through it.
    const byText = new Map(result.options.map((option) => [option.text, option]));
    const options = laidOut.options.map<ChoiceOption>((text, position) => {
      const original = byText.get(text);
      const correct = position === laidOut.answer;
      // A ground survives the move; correctness is re-read from where the balancer put the answer.
      return original?.ground ? { correct, ground: original.ground, text } : { correct, text };
    });
    sets.set(candidate.identityKey, { demand: result.demand, options });
  });
  return sets;
}

/**
 * What one tap meant.
 *
 * 🔴 `unrecognised` IS A REAL CASE AND MUST NOT BE READ AS A WRONG ANSWER. It happens when the set on
 * screen is not the set being read — a stale render, a rebuilt pool, a replayed effect. Nobody got
 * anything wrong; we simply do not know what was picked, which is the `noJudgement()` case and writes
 * nothing. Folding it into "incorrect" would charge a learner for our own race.
 */
export type ChoiceSelection =
  | { kind: "correct"; text: string }
  | { kind: "distractor"; text: string; ground: DistractorGround }
  | { kind: "unrecognised"; text: string };

/**
 * Resolve a tapped option back to its meaning.
 *
 * 🔴 BY TEXT, WHICH IS WHY NOTHING DOWNSTREAM EVER HOLDS AN INDEX. An index is only true of the
 * layout that produced it; the text is true of the option. That is what makes the durable row
 * self-describing — `responseText` alone says which distractor was picked, with no second lookup
 * against a layout nobody stored.
 */
export function readSelection(set: ChoiceSet, text: string): ChoiceSelection {
  const key = normalizeForIdentity(text);
  const found = set.options.find((option) => normalizeForIdentity(option.text) === key);
  if (!found) return { kind: "unrecognised", text };
  if (found.correct) return { kind: "correct", text: found.text };
  return found.ground
    ? { ground: found.ground, kind: "distractor", text: found.text }
    : // A wrong option with no ground cannot be built by `optionsFor`, so reaching here means the set
      // was assembled somewhere else. Reporting it as unrecognised is the honest, non-accusing read.
      { kind: "unrecognised", text };
}

// ── From this canvas's knowledge to candidates ───────────────────────────────────────────────────

/**
 * What makes two objectives ask for the same KIND of thing.
 *
 * 🔴 STRUCTURAL, IN THREE FALLBACKS, AND NONE OF THEM READS A WORD'S MEANING. The output role is the
 * source's own name for the column an answer came from, so two objectives sharing one are asking for
 * the same kind of value — "brand", "holding", "part number" — without anything here knowing what any
 * of those are. `relationKind` is the same idea for a relation the extractor named. The knowledge type
 * is the last resort, and it is deliberately loose: a glossary with no headers still yields sibling
 * answers, and a set built only from those reports `demand: "related"` rather than pretending to be
 * a discrimination.
 *
 * 🔴 THE CAPABILITY IS ALWAYS PART OF IT. An `explain` answer is a sentence and a `recall` answer is
 * a term; offering one as an option for the other would be obviously wrong on sight and would hand
 * the learner a free elimination.
 */
export function neighbourhoodKey(objective: LearningObjective, knowledge: KnowledgeObject): string {
  const shape = objective.parameters.outputRole ?? knowledge.relationKind ?? knowledge.type;
  return `${objective.capability}|${normalizeForIdentity(shape)}`;
}

/** One entry of the pool a canvas can draw distractors from. */
export interface ChoicePoolEntry {
  objective: LearningObjective;
  knowledge: KnowledgeObject;
  /** The sentence this objective's question will print. */
  prompt: string;
  /** This objective's own evidence, newest last. */
  evidence: readonly LearnerEvidence[];
}

/**
 * Competing beliefs a judge has already named for this objective, most recent first.
 *
 * 🔴 READ OFF THE LOG, NEVER INVENTED, AND ONLY FROM ROWS WHOSE VERDICT WAS `misconception`. That is
 * the one verdict whose contract says a specific competing model was identified; a belief scraped off
 * an `incorrect` row would be a claim no judge made. Newest first because a belief named last week and
 * one named a minute ago are not equally likely to still be held, and the ceiling means the older ones
 * are what gets dropped.
 */
function heldMisconceptionsIn(evidence: readonly LearnerEvidence[]): string[] {
  const beliefs: string[] = [];
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const row = evidence[index]!;
    if (row.verdict !== "misconception") continue;
    for (const belief of row.misconceptions ?? []) {
      if (belief.trim()) beliefs.push(belief.trim());
    }
  }
  return beliefs;
}

/**
 * Turn a canvas's pool into candidates, one per objective.
 *
 * 🔴 THE SIBLING ANSWERS COME FROM THE POOL AND FROM NOWHERE ELSE. A distractor invented here — a
 * near-miss spelling, a plausible-sounding term — would be this module writing subject matter, which
 * is precisely what the field-agnostic rule forbids and what makes an option nobody can learn from.
 * Every wrong option on screen is a real answer to a real question from the learner's own material.
 */
export function choiceCandidatesFrom(pool: readonly ChoicePoolEntry[]): ChoiceCandidate[] {
  const byNeighbourhood = new Map<string, string[]>();
  for (const entry of pool) {
    const key = neighbourhoodKey(entry.objective, entry.knowledge);
    const answers = byNeighbourhood.get(key);
    if (answers) answers.push(entry.objective.answer);
    else byNeighbourhood.set(key, [entry.objective.answer]);
  }

  return pool.map((entry) => {
    const key = neighbourhoodKey(entry.objective, entry.knowledge);
    const mine = normalizeForIdentity(entry.objective.answer);
    return {
      answer: entry.objective.answer,
      heldMisconceptions: heldMisconceptionsIn(entry.evidence),
      identityKey: entry.objective.identityKey,
      // The source's own neighbours for this class. Absent for every knowledge type that declares
      // none, which is most of them, and that absence is why `demand` exists.
      neighbouringClasses: (entry.knowledge.contrast?.siblings ?? []).map((sibling) => sibling.label),
      prompt: entry.prompt,
      siblingAnswers: (byNeighbourhood.get(key) ?? []).filter(
        (answer) => normalizeForIdentity(answer) !== mine,
      ),
    };
  });
}
