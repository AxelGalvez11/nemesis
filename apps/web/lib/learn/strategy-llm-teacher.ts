// The teaching controller: a general model reasoning over the state Nemesis has observed.
//
// 🔴🔴 THIS IS NOW THE PRODUCT, NOT A BASELINE, AND THE CHANGE IS THE OWNER'S. It shipped as the
// control arm of an experiment — default off, deliberately starved of every signal `decideNext`
// computes, so the comparison would be clean. `docs/canvas-teaching-policy-audit.md` measured what
// that cost: eight consecutive misses on one objective, every one answered "ask again", with
// untouched material losing every round because **nothing in the system represented the cost of
// continuing**. The owner's ruling:
//
//   *"Move teaching strategy toward model reasoning rather than continuing to accumulate handcrafted
//   pedagogical constants… Do not preserve an intentionally starved LLM simply to preserve the old
//   experiment… Nemesis defines the environment, state, tools, invariants, evidence, and objective.
//   The general model reasons about the teaching policy."*
//
// So the starvation is over — `teaching-snapshot.ts` gives this arm everything Nemesis honestly
// knows — and the structured policy remains as a real, selectable baseline rather than being deleted.
//
// 🔴 WHAT THE MODEL STILL MAY NOT DO, AND THIS LIST IS THE DESIGN. It chooses among the objectives it
// was given and among the verbs below, and nothing else. It may not word a question, invent a task
// format, decide what counts as evidence, bypass the judge, choose a presentation mode, or name a
// misconception the log does not already hold. Those are truth and safety, and they stay
// deterministic exactly as the owner required. A model naming anything outside the vocabulary is a
// counted refusal, never a silent repair.
//
// 🔴 AND IT MAY DECLINE. A teacher that believes it must always act will act on material the learner
// has already demonstrated. `advance`, `defer` and `revisit` are first-class verbs here, spelled out
// as equals rather than buried as last resorts — which is the whole point: *"A wrong answer must not
// automatically cause Nemesis to keep drilling the same objective indefinitely."*

import { postChatCompletion } from "@/lib/workspace/chat-api";
import type { ChatRouteDecision } from "@/lib/workspace/chat-routing";

import { extractJson } from "./canvas-parse";
import type { ChoiceSet } from "./choice-set";
import { expositionFor } from "./cognitive-mode";
import { projectLearnerState } from "./learner-evidence";
import type { LearnerEvidence } from "./learner-evidence";
import { choiceSetsForPool } from "./objective-task";
import type { ResolvedObjective } from "./canvas-knowledge";
import { easier, harder } from "./scaffold-prompt";
import { completionAvailable } from "./completion-task";
import { workedExampleFor } from "./worked-example";
import type { ScaffoldRung } from "./scaffold-rung";
import { expositionOf, type TeachingAction } from "./teaching-policy";
import { teachingSnapshot, type ObjectiveSnapshot } from "./teaching-snapshot";
import type {
  StrategyOutcome,
  StrategyRefusal,
  TeachingContext,
  TeachingDecision,
  TeachingStrategy,
} from "./teaching-strategy";

/**
 * 🔴 THE SAME MODEL EVERY OTHER CANVAS CALL USES, AND ON THE SAME METERED DOOR. `canvas-api.ts`
 * sends the evaluator as `deepseek-chat`; the teacher matching it keeps the whole loop on one device
 * key, one cost attribution and one budget. A separate route for the controller is exactly the
 * unmetered lane the unit-economics audit found and closed.
 */
const TEACHER_MODEL: ChatRouteDecision = { model: "deepseek-chat", route: "conversation", searchWeb: false };

/**
 * The objective, stated as an objective rather than as a procedure.
 *
 * 🔴🔴 THIS IS THE BITTER-LESSON CONSTRAINT, WRITTEN OUT. The owner: *"Do not encode the correct
 * teaching sequence. Encode what success means."* So there is no "if wrong twice then explain the
 * prerequisite" anywhere in this prompt, and there must never be. What it states is the goal, the
 * economics, and the things that are true regardless of how anyone teaches.
 *
 * 🔴 IT NAMES NO SUBJECT AND NO DISCIPLINE. The objectives arrive as labels the learner's own
 * material produced. A teaching instruction that assumed a field would teach a law student as though
 * they were a scientist, which is the standing product rule this whole codebase is held to.
 */
const TEACHER_SYSTEM = [
  "You are an expert tutor working with one learner, in whatever discipline their material happens to be.",
  "",
  "YOUR OBJECTIVE: maximize durable understanding of IMPORTANT material per unit of the learner's active attention.",
  "Find the fastest cognitive path from this learner's current state to mastery of the important structure.",
  "Prefer an organizing principle that makes many downstream facts understandable or derivable over drilling those",
  "facts separately. Consider prerequisites, causal leverage, downstream dependency, compression, transfer, supported",
  "assessment relevance and this learner's observed gaps. Source emphasis is evidence, not high yield by itself.",
  "You are not trying to perfect every concept before moving forward. A learner can understand something well enough",
  "for now, and lower yield knowledge can become valuable after the structure supporting it is established.",
  "",
  "Every turn is one question: what should this learner spend the next minute thinking about?",
  "You will be asked again after they respond, so do not plan a lesson. Decide the next move only.",
  "",
  "MOVING ON IS A REAL MOVE, NOT A FAILURE. If someone does not know something perfectly but another minute here",
  "has less expected value than going forward, go forward. Do the opposite when the thing unlocks, explains or",
  "compresses important downstream knowledge, or blocks material they are already stuck on.",
  "",
  "THINGS THAT ARE TRUE WHATEVER YOU DECIDE:",
  "- Being shown something is not evidence they know it. Only producing it is.",
  "- Recognizing something is weaker evidence than producing it unaided.",
  "- Answering seconds after being told measures working memory, not learning.",
  "- Slow is not wrong. Latency is context, never a verdict.",
  "- You may only act on the misconceptions listed. Do not infer or invent one.",
  "- Never ask the same question twice in a row.",
  "- If the learner opened this sitting by asking to be TAUGHT or walked through something, and they have produced no",
  "  evidence on it yet, teach it before you test it. Being asked is the learner telling you they have not met this,",
  "  so opening with a question answers something they did not ask and reads as being quizzed on material never shown.",
  "  This does not apply once they have produced anything, and it does not apply when they asked to be tested or drilled,",
  "  or when they attached material without saying what they wanted. Those are still yours to decide from the evidence.",
  "",
  "Your entire output is the JSON object requested: no greeting, no commentary, no explanation outside the JSON.",
  "Never use an em dash. The character - must not appear anywhere in your output.",
].join("\n");

/**
 * The moves.
 *
 * 🔴 TWELVE VERBS, AND EVERY ONE CHANGES WHAT THE LEARNER MEETS. The owner listed eleven; the
 * temptation was to accept the list and map several onto the same action so the enum looked right.
 * That is the defect this repo keeps paying for — a lane that is implemented, merged, deployed and
 * dead. `harder` and `easier` move a rung that, until `scaffold-prompt.ts` existed, did not change a
 * single character of the question it labelled. They are here because that was fixed first.
 */
const VERBS = [
  /** Ask them to produce it, at the demand the record supports. */
  "ask",
  /** Ask at full unaided demand specifically to test a pass that was only a recognition. */
  "probe",
  /** Put the material in front of them. Asserts nothing about what they know. */
  "teach",
  /** Say the same thing in plainer language. For a learner tripping over the words. */
  "simplify",
  /** State the answer plainly, because an attempt fell short and telling beats asking again. */
  "correct",
  /** Put a competing belief they actually showed beside the right one. */
  "contrast",
  /**
   * Ask them to pick it out of options that include what they are confusing it with.
   *
   * 🔴 A REAL MOVE, NOT A PRESENTATION CHOICE, WHICH IS WHY IT IS A VERB. It changes what the learner
   * has to do — discriminate rather than produce — and the evidence it writes is weaker and says so.
   *
   * 🔴 AND IT IS AVAILABLE FAR LESS OFTEN THAN THE MODEL WILL WANT IT. `actionFor` refuses it unless
   * a genuinely confusable set of options exists for that objective; the refusal is counted, exactly
   * like a `contrast` against no observed belief. This arm is the DEFAULT strategy, so leaving the
   * verb out would have meant recognition never reaching a real learner at all.
   */
  "recognise",
  /**
   * Work the reasoning through in front of them, start to finish.
   *
   * 🔴 A DIFFERENT MOVE FROM `teach`, AND THE DISTINCTION IS THE ONE THE WORKED-EXAMPLE LITERATURE
   * TURNS ON. `teach` states the claim; this states the PROCESS — where you start, what you look
   * up, how the parts compose, what you end up saying. A learner who cannot yet perform the
   * operation gets nothing from being shown the conclusion a second time.
   *
   * 🔴 IT SHOWS THE ANSWER AND WRITES NO EVIDENCE, WHICH IS ONE DECISION AND NOT TWO. Modelling is
   * not testing, so exposing the solution is the point; nothing the learner has demonstrated
   * changes as a result, because no row is written at all.
   *
   * 🔴 AND IT IS AVAILABLE ONLY WHERE THE MATERIAL HAS A PROCESS. The brief says which objectives
   * those are; asking for one elsewhere is refused rather than invented.
   */
  "model",
  /**
   * Show most of a valid solution with one piece missing and ask them to supply the piece.
   *
   * 🔴 THE STEP BETWEEN BEING SHOWN AND PERFORMING, WHICH NOTHING ELSE IN THIS VOCABULARY OCCUPIES.
   * `easier` walks the same question down a ladder of hints; this changes the task into a partly
   * worked solution with a gap in it.
   *
   * 🔴 THE EVIDENCE IT WRITES IS REAL AND WEAKER THAN UNAIDED PRODUCTION, and Nemesis enforces that
   * rather than trusting anyone to remember it: a completion pass can never satisfy the "produced
   * it unaided" test, so choosing this does not let a learner be marked as knowing something.
   */
  "complete",
  /** Same objective, one step more demanding. */
  "harder",
  /** Same objective, one step less demanding. */
  "easier",
  /** Nothing here is worth the next minute. Go forward. */
  "advance",
  /** Not right now. Come back to it later in this sitting, after other material. */
  "defer",
  /** Not this sitting. It stays exactly as it is for next time. */
  "revisit",
] as const;
type Verb = (typeof VERBS)[number];

function isVerb(value: unknown): value is Verb {
  return typeof value === "string" && (VERBS as readonly string[]).includes(value);
}

/** Verbs that name an objective. `advance` may also be canvas-wide, which is why it is not here. */
const NEEDS_OBJECTIVE: readonly Verb[] = VERBS.filter((verb) => verb !== "advance");

/**
 * One objective, as the model sees it.
 *
 * 🔴 A DESCRIPTION, NEVER A RECOMMENDATION. There is no "due", no "worth asking", no score and no
 * ranking. The moment this line computed a priority, the structured policy would be doing the
 * controller's job for it and the two arms would converge by construction — which would make the
 * comparison meaningless in the direction that flatters us.
 *
 * 🔴 AND EVERY ABSENT VALUE SAYS "not recorded" IN WORDS. A model handed `retrievability: 0` will
 * reason that the learner has forgotten something they were never asked. The whole `| null`
 * discipline in `teaching-snapshot.ts` is worth nothing if it is flattened into a zero here.
 */
/**
 * 🔴 EXPORTED FOR ONE REASON: SO A TEST CAN READ WHAT THE MODEL IS ACTUALLY TOLD.
 *
 * A field can be stored, selected, mapped and put on the snapshot and still reach no reader — four
 * green boundaries and a dead lane, which is a shape this codebase has shipped before. Deleting the
 * diagnosis line below left all 3,764 tests passing until this was exported and asserted against.
 */
export function brief(snapshot: ObjectiveSnapshot): string {
  const lines = [
    `- id: ${snapshot.identityKey}`,
    `  asks: ${snapshot.label}  [${snapshot.capability} over ${snapshot.knowledgeType}]`,
    `  the material says: ${snapshot.statement}`,
    ...(snapshot.semanticRelations.length > 0
      ? [`  semantic structure: ${snapshot.semanticRelations.join(" | ")}`]
      : []),
    `  status: ${snapshot.state.status}`,
    `  met ${snapshot.state.evidenceCount} times, produced it ${snapshot.state.demonstrationCount} times, ` +
      `${snapshot.unresolvedAttempts} attempts fell short`,
    `  last verdict: ${snapshot.state.latestVerdict ?? "none"}`,
    snapshot.minutesSinceLastEvidence === null
      ? "  last met: never"
      : `  last met: ${snapshot.minutesSinceLastEvidence} minutes ago`,
    `  last asked at demand: ${snapshot.lastRung ?? "not recorded"}`,
    snapshot.medianResponseMs === null
      ? "  typical time to answer: not recorded"
      : `  typical time to answer: ${Math.round(snapshot.medianResponseMs / 1000)}s`,
    snapshot.retrievability === null
      ? "  predicted recall right now: not estimable"
      : `  predicted recall right now: ${Math.round(snapshot.retrievability * 100)}%`,
    `  importance in the source: ${snapshot.importance ?? "not read"}`,
  ];
  // 🔴 THE DIAGNOSIS IS PRINTED ONLY WHEN ONE WAS MADE. "kind of failure: none" would read to a
  // model as a positive finding — that the last attempt failed in no particular way — when what it
  // means is that nobody looked. An absent line says nothing, which is the truth.
  if (snapshot.lastErrorType) {
    lines.push(`  how their last failure was diagnosed: ${snapshot.lastErrorType}`);
  }
  // 🔴 WHAT THE MATERIAL CAN SUPPORT, NOT WHAT TO DO ABOUT IT. Absent, the model spends turns asking
  // for moves that cannot be staged over a two-column table and gets refused; present, it is a fact
  // about the source in the same register as "importance in the source".
  const available = [
    ...(snapshot.canBeModelled ? ["model"] : []),
    ...(snapshot.canBeCompleted ? ["complete"] : []),
  ];
  lines.push(
    available.length > 0
      ? `  this material can also support: ${available.join(", ")}`
      : "  this material supports asking and telling only: no process to work through, and no part that could be withheld without withholding the whole answer",
  );
  if (snapshot.completionAttempts > 0) {
    lines.push(`  answered ${snapshot.completionAttempts} times with part of the solution already on screen`);
  }
  if (snapshot.misconceptions.length > 0) {
    lines.push(`  competing beliefs they have actually shown: ${snapshot.misconceptions.join("; ")}`);
  }
  if (snapshot.blockedDependents.length > 0) {
    lines.push(
      `  ${snapshot.blockedDependents.length} things they are stuck on build on this: ` +
        snapshot.blockedDependents.slice(0, 3).join(", "),
    );
  }
  if (snapshot.prerequisites.length > 0) {
    lines.push(`  builds on: ${snapshot.prerequisites.slice(0, 3).join(", ")}`);
  }
  if (snapshot.terminologyInTheWay) {
    lines.push("  they keep looking up the words this is built from");
  }
  if (snapshot.actsThisSession > 0) {
    lines.push(
      `  this sitting: ${snapshot.actsThisSession} turns spent here, ` +
        `about ${Math.round(snapshot.msThisSession / 1000)}s of attention`,
    );
  }
  return lines.join("\n");
}

/**
 * The sitting itself.
 *
 * Active attention already spent is observed interaction context, never an explicit study budget.
 * The controller does not ask how long the learner has or build a policy around a time allowance.
 */
function sittingNote(
  context: TeachingContext,
  scope: { total: number; touched: number; demonstrated: number; importantTotal: number | null; importantDemonstrated: number | null },
  shown: number,
): string {
  const lines: string[] = [];
  // 🔴 FIRST, BECAUSE IT REFRAMES EVERYTHING UNDER IT. What the learner asked for changes how the
  // zero-evidence state should read: with no opening, "nothing produced yet" means we know nothing
  // and must ask; with "teach me X" it means they have told us they have not met it.
  //
  // 🔴 BOUNDED AT 200 CHARACTERS. This is learner text on a per-turn model call, so it is the one
  // field here with no natural ceiling; an unbounded one would let a pasted paragraph set the size
  // of every subsequent teaching decision in the sitting.
  const opening = context.opening?.trim().slice(0, 200);
  if (opening) {
    lines.push(
      `The learner opened this sitting by saying: "${opening}"`,
      "Those are their own words about what they came for. Treat it as something they told you, not as an inference about what they know.",
    );
  }
  const attention = context.attention;
  if (attention) {
    lines.push(`Attention spent this sitting so far: about ${Math.round(attention.activeMs / 60_000)} minutes.`);
  }
  lines.push(
    `Material on this canvas: ${scope.total} objectives, ${scope.touched} touched at all, ` +
      `${scope.demonstrated} produced at least once.`,
  );
  // 🔴 THE WINDOW IS DISCLOSED, ALWAYS. A controller shown forty of four hundred and not told so
  // would conclude the material was nearly covered when it had seen a tenth of it, and coverage is
  // the exact objective it is being asked to optimise. See `BRIEF_LIMIT`.
  if (shown < scope.total) {
    lines.push(
      `Nemesis retrieved ${shown} of ${scope.total} objectives for this decision using current learner signals and ` +
        "the material's shared knowledge structure. The rest still exist; do not treat this neighborhood as the whole canvas.",
    );
  }
  if (scope.importantTotal !== null) {
    lines.push(
      `Of the ones the source treats as central: ${scope.importantTotal} exist, ` +
        `${scope.importantDemonstrated ?? 0} have been produced.`,
    );
  }
  const acted = context.actedOn ?? [];
  if (acted.length > 0) lines.push(`Already worked this sitting, oldest first: ${acted.join(", ")}.`);
  const corrected = [...(context.correctionsShown ?? new Set<string>())];
  if (corrected.length > 0) {
    lines.push(`Answers already stated plainly this sitting: ${corrected.join(", ")}.`);
  }
  // 🔴 THE SAME SERVICE `correctionsShown` DOES, FOR AN ACTION THAT LEAVES NO DURABLE TRACE AT ALL.
  // A worked example writes no evidence row by design, so without this line the next turn has no way
  // to know one was just shown and the obvious failure is showing it again.
  const worked = [...(context.modelled ?? new Set<string>())];
  if (worked.length > 0) {
    lines.push(`Reasoning already worked through in front of them this sitting: ${worked.join(", ")}.`);
  }
  return lines.join("\n");
}

/**
 * How many objectives may be briefed on one turn.
 *
 * 🔴🔴 A COST BOUND, AND IT IS NOT OPTIONAL. Measured on the real corpus before this existed, with
 * the brief below at its real field width:
 *
 *     24 objectives  ->   11,816 chars  ~2,950 tokens
 *     83 objectives  ->   40,962 chars  ~10,200 tokens
 *    229 objectives  ->  113,602 chars  ~28,400 tokens
 *    474 objectives  ->  235,612 chars  ~58,900 tokens   <- the owner's real immunology lecture
 *
 * **Per turn.** Every decision. A learner working through one lecture would have sent several
 * million tokens through the metered door before finishing it, and the unit-economics audit closed a
 * much smaller hole than that. Forty objectives is about 5,000 tokens, which is a decision worth
 * paying for.
 *
 * The number is only a cost bound. `relevantWindowOf` fills it from the learner's active frontier
 * and the material's exact structural joins instead of truncating an identity-sorted checklist.
 *
 * 🔴 AND THE MODEL IS TOLD THE CANVAS IS BIGGER THAN ITS WINDOW. A controller that could see forty
 * of four hundred and was not told so would report the material covered when it had seen a tenth of
 * it — a coverage claim that is false, about the exact objective the owner set.
 */
const BRIEF_LIMIT = 40;

/**
 * The relevant structural neighborhood for one controller decision.
 *
 * This is retrieval, not teaching policy. It makes the current gap, its exact neighbors and large
 * connected structures legible; the general model still decides what any of that makes worth doing.
 * Every comparison is lexicographic and stable, with no hand-tuned pedagogical weights.
 */
export function relevantWindowOf(
  snapshots: readonly ObjectiveSnapshot[],
  actedOn: readonly string[],
): readonly ObjectiveSnapshot[] {
  if (snapshots.length <= BRIEF_LIMIT) return snapshots;
  const acted = new Set(actedOn);

  const indexById = new Map(snapshots.map((entry, index) => [entry.identityKey, index] as const));
  const adjacency = snapshots.map(() => new Set<number>());
  const connect = (left: number, right: number) => {
    if (left === right) return;
    adjacency[left]!.add(right);
    adjacency[right]!.add(left);
  };
  for (const [index, snapshot] of snapshots.entries()) {
    for (const id of snapshot.prerequisites) {
      const other = indexById.get(id);
      if (other !== undefined) connect(index, other);
    }
  }
  const byTerm = new Map<string, number[]>();
  for (const [index, snapshot] of snapshots.entries()) {
    for (const key of snapshot.semanticKeys) {
      const holders = byTerm.get(key);
      if (holders) holders.push(index);
      else byTerm.set(key, [index]);
    }
  }
  for (const holders of byTerm.values()) {
    for (let left = 0; left < holders.length; left += 1) {
      for (let right = left + 1; right < holders.length; right += 1) {
        connect(holders[left]!, holders[right]!);
      }
    }
  }

  const componentSize = new Array<number>(snapshots.length).fill(1);
  const visited = new Set<number>();
  for (let start = 0; start < snapshots.length; start += 1) {
    if (visited.has(start)) continue;
    const component: number[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adjacency[current]!) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    for (const member of component) componentSize[member] = component.length;
  }

  const active = new Set<number>();
  for (const [index, snapshot] of snapshots.entries()) {
    if (
      snapshot.terminologyInTheWay ||
      snapshot.misconceptions.length > 0 ||
      (snapshot.state.evidenceCount > 0 && snapshot.state.status !== "correct")
    ) active.add(index);
  }
  const nextToActive = new Set<number>();
  for (const index of active) for (const neighbor of adjacency[index]!) nextToActive.add(neighbor);

  return snapshots
    .map((snapshot, index) => ({ index, snapshot }))
    .sort((left, right) => {
      const l = left.index;
      const r = right.index;
      return (
        Number(active.has(r)) - Number(active.has(l)) ||
        Number(nextToActive.has(r)) - Number(nextToActive.has(l)) ||
        componentSize[r]! - componentSize[l]! ||
        adjacency[r]!.size - adjacency[l]!.size ||
        Number(right.snapshot.importance === "central") - Number(left.snapshot.importance === "central") ||
        Number(acted.has(left.snapshot.identityKey)) - Number(acted.has(right.snapshot.identityKey)) ||
        l - r
      );
    })
    .slice(0, BRIEF_LIMIT)
    .map(({ snapshot }) => snapshot);
}

function teacherMessages(
  snapshots: readonly ObjectiveSnapshot[],
  sitting: string,
): Parameters<typeof postChatCompletion>[1] {
  return [
    { content: TEACHER_SYSTEM, role: "system" },
    {
      content:
        "Here is everything Nemesis has observed about this learner and the material in front of them.\n\n" +
        `${snapshots.map(brief).join("\n")}\n\n` +
        `${sitting}\n\n` +
        "Choose the single next move. Reply with JSON only:\n" +
        '{"objective": "<the id you are acting on, copied exactly, or null>", ' +
        `"move": ${VERBS.map((verb) => `"${verb}"`).join(" | ")}, ` +
        '"because": "<one sentence, for a reviewer, on why this move now>"}\n\n' +
        "ask       ask them to produce it.\n" +
        "probe     ask at full unaided demand, to test a pass that was only a recognition.\n" +
        "teach     put the material in front of them. Says nothing about whether they knew it.\n" +
        "simplify  say the same thing in plainer language.\n" +
        "correct   state the answer plainly, because an attempt fell short.\n" +
        "contrast  put a competing belief they have ACTUALLY SHOWN beside the right one.\n" +
        // 🔴 THE LINE STATES THE REFUSAL AS WELL AS THE MOVE. A model told only what a verb does will
        // reach for it where it is unavailable, and every such reply is a wasted turn counted as
        // `unknown-action`. Saying that options come from the material and may not exist turns a
        // silent failure rate into a move the model can decline to make.
        "recognise ask them to pick it out of options drawn from the material and from what they have " +
        "confused it with. Available only where such options exist. Lower effort to answer, not " +
        "lower difficulty, and a correct pick is WEAKER evidence than producing it. They may still " +
        "type an answer before the options are shown, and that counts as producing it.\n" +
        "model     work the reasoning through in front of them, start to finish, showing the answer. " +
        "This is MODELLING, not testing: it establishes nothing about what they know. Available " +
        "only where the line above says so.\n" +
        "complete  show most of a valid solution with one piece missing and ask them for the piece. " +
        "Real production, but assisted, and recorded as weaker than an unaided answer. Available " +
        "only where the line above says so.\n" +
        "harder    same objective, one step more demanding.\n" +
        "easier    same objective, one step less demanding.\n" +
        "advance   nothing here is worth the next minute. Go forward.\n" +
        "defer     not right now. Come back later in this sitting, after other material.\n" +
        "revisit   not this sitting. It keeps everything it has for next time.\n\n" +
        // 🔴 THE THREE MOVING-ON VERBS ARE SPELLED OUT AS EQUALS, NOT AS LAST RESORTS. Wording them
        // as failure would put a thumb on precisely the scale this whole change exists to correct.
        "advance, defer and revisit are ordinary good moves. Choosing one is often better than spending this " +
        "learner's attention on something that will not pay for the minute.\n" +
        'If nothing on this canvas is worth doing at all, reply {"objective": null, "move": "advance", "because": "<why not>"}.\n' +
        "The objective id must be copied exactly from the list above. Do not invent one, and do not answer about " +
        "anything not listed.",
      role: "user",
    },
  ];
}

/**
 * Build the action. Everything that is NOT the model's to choose is taken from where the structured
 * policy takes it.
 *
 * 🔴 THE EXPOSITION MODE IS NEVER THE MODEL'S. §39 decides what a learner is asked to take in from
 * the capability and the knowledge type. A model choosing it would let one screen auto-advance where
 * another waits, and the difference in measured time would be the renderer rather than the teaching.
 */
/**
 * What `actionFor` came back with.
 *
 * 🔴🔴 TWO REFUSALS, NOT ONE `null`, AND THE SPLIT IS WHAT KEEPS THE ARM'S HEALTH READABLE. Before
 * the grounded builders existed there was one way to fail — the model named a verb this runtime
 * could not stage — and `null` said it. There are two now: "we do not have that move" is a
 * controller not following instructions, and "this material has no process to work through" is a
 * controller reasoning perfectly well about a canvas of two-column associations. Reported as one
 * number they are indistinguishable, and the arm looks broken exactly when it is working.
 */
type ActionOrRefusal =
  | { readonly action: TeachingAction; readonly refusal?: undefined }
  | { readonly action?: undefined; readonly refusal: StrategyRefusal };

function actionFor(input: {
  verb: Verb;
  entry: ResolvedObjective;
  snapshot: ObjectiveSnapshot;
  because: string;
  evidence: readonly LearnerEvidence[];
  /** The options this runtime could honestly stage for THIS objective, or null when none exist. */
  choices: ChoiceSet | null;
}): ActionOrRefusal {
  const id = input.entry.objective.identityKey;
  const because = input.because;
  const exposition = (kind: "correction" | "contrast") =>
    expositionFor({
      capability: input.entry.objective.capability,
      kind,
      knowledgeType: input.entry.knowledge.type,
    });
  // Where the ladder currently stands for this objective. `independent` when nothing recorded a
  // rung, which is the honest reading: every pre-ladder row really was an unaided question.
  const current: ScaffoldRung = input.snapshot.lastRung ?? "independent";

  switch (input.verb) {
    case "ask":
      return { action: { because, objectiveId: id, rung: current, type: "retrieve" } };
    case "probe":
      // 🔴 ALWAYS `independent`, WHATEVER THE LADDER SAYS. A probe exists to settle whether a
      // recognition-level pass generalises to production (§31.2). Narrowing it would ask the learner
      // to recognise again and call the result a production probe.
      return { action: { because, objectiveId: id, rung: "independent", type: "retrieve" } };
    case "harder": {
      const up = harder(current);
      // 🔴 A REFUSAL, NOT A CLAMP. Returning the same rung would report a difficulty change that did
      // not happen — the exact lie `scaffold-prompt.ts` was written to end.
      return up
        ? { action: { because, objectiveId: id, rung: up, type: "retrieve" } }
        : { refusal: "unknown-action" };
    }
    case "easier": {
      const down = easier(current);
      return down
        ? { action: { because, objectiveId: id, rung: down, type: "retrieve" } }
        : { refusal: "unknown-action" };
    }
    case "teach":
      return { action: { because, exposition: exposition("correction"), objectiveId: id, type: "teach" } };
    case "simplify":
      return { action: { because, exposition: exposition("correction"), objectiveId: id, type: "simplify" } };
    case "correct":
      return {
        action: { because, exposition: exposition("correction"), objectiveId: id, type: "show_correction" },
      };
    case "contrast": {
      // 🔴🔴 DERIVED FROM THE EVIDENCE AND NEVER TAKEN FROM THE MODEL. Naming which false belief a
      // learner holds is authoring a claim about a person. A model-supplied list would let the
      // controller teach against mistakes nobody made, which is not a teaching difference, it is a
      // fabrication — and it is one of the invariants the owner listed by name.
      const competing = input.snapshot.misconceptions;
      // Nothing to separate. A "contrast" against no observed belief is a retrieval with a
      // misleading name, so it is refused and counted rather than quietly downgraded.
      if (competing.length === 0) return { refusal: "unknown-action" };
      return {
        action: {
          because,
          competingWith: competing,
          exposition: exposition("contrast"),
          objectiveIds: [id],
          type: "contrast",
        },
      };
    }
    case "recognise":
      // 🔴 REFUSED WHEN NO HONEST SET EXISTS, EXACTLY LIKE `contrast` WITH NOTHING TO SEPARATE. The
      // model may not conjure options: distractors are built from the source's own structure and from
      // beliefs a judge already named, and a model-supplied list would be this arm authoring content
      // — the line `TeachingStrategy`'s header draws ("a controller chooses; it does not author") and
      // the same one the contrast case draws two branches down.
      return input.choices
        ? {
            action: { because, choices: input.choices, objectiveId: id, rung: "recognition", type: "recognise" },
          }
        : { refusal: "unknown-action" };
    // 🔴🔴 THE TWO GROUNDED MOVES, AND BOTH ASK THE BUILDER RATHER THAN TRUSTING THE SNAPSHOT.
    // The snapshot's `canBeModelled` / `canBeCompleted` lines exist to stop the model WASTING turns;
    // they are not the authority on whether the thing can be staged. Reading
    // them here instead of calling the builder would put the check one copy away from the code that
    // actually has to produce the screen — which is the exact shape of defect this repo keeps
    // finding: a decision that says yes and a builder that then returns nothing.
    case "model":
      return workedExampleFor(input.entry).modelled
        ? {
            action: {
              because,
              exposition: expositionFor({
                capability: input.entry.objective.capability,
                // A demonstration is material to be read, which is what `correction` resolves to for
                // every knowledge type one can be built from. It is not a verdict about the learner.
                kind: "correction",
                knowledgeType: input.entry.knowledge.type,
              }),
              objectiveId: id,
              type: "worked_example",
            },
          }
        : { refusal: "ungroundable-action" };
    case "complete":
      return completionAvailable(input.entry)
        ? { action: { because, objectiveId: id, rung: "completion", type: "complete" } }
        : { refusal: "ungroundable-action" };
    case "defer":
      return { action: { because, objectiveId: id, type: "defer" } };
    case "revisit":
      return { action: { because, objectiveId: id, type: "revisit" } };
    case "advance":
      return { action: { because, objectiveId: id, type: "advance" } };
  }
}

function refused(refusal: StrategyRefusal): StrategyOutcome {
  return { decision: null, refusal, strategy: "llm_teacher" };
}

/**
 * How this arm reaches the model.
 *
 * 🔴 INJECTABLE FOR ONE REASON ONLY: so a test can prove this arm actually reaches a model and the
 * other one does not. It is not a configuration point and must not become one — routing this through
 * a different door would take it off the metered path, which is precisely the hole the
 * unit-economics audit closed.
 */
export type TeacherTransport = (
  uid: string,
  messages: Parameters<typeof postChatCompletion>[1],
  options: { signal?: AbortSignal },
) => Promise<{ text: string | null; errorText: string | null }>;

const meteredTransport: TeacherTransport = async (uid, messages, options) => {
  const reply = await postChatCompletion(uid, messages, {
    decision: TEACHER_MODEL,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return { errorText: reply.errorText ?? null, text: reply.text };
};

export function createLlmTeacherStrategy(ask: TeacherTransport): TeachingStrategy {
  return {
    id: "llm_teacher",
    async decide(context: TeachingContext): Promise<StrategyOutcome> {
      if (context.objectives.length === 0) return refused("no-candidates");
      // 🔴 NO LEARNER MEANS NO METERED DOOR. `postChatCompletion` needs a device key derived from the
      // signed-in session; calling without one would either fail or find some other route to the
      // model that the budget does not see.
      if (!context.uid) return refused("model-unreachable");

      const snapshot = teachingSnapshot(context);
      // 🔴 BOUNDED BEFORE ANY OF IT IS SENT. See `BRIEF_LIMIT` for the measured reason.
      const briefed = relevantWindowOf(snapshot.objectives, context.actedOn ?? []);

      let reply: Awaited<ReturnType<TeacherTransport>>;
      try {
        // 🔴 A THROW IS A REFUSAL, NOT AN EXCEPTION, AND THIS `catch` IS LOAD-BEARING.
        // `postChatCompletion` REJECTS on an aborted fetch, and the runtime aborts this call every
        // time the learner's evidence moves underneath it. An exception escaping here would skip the
        // refusal accounting entirely, so the one instrument that tells a working controller from a
        // broken one would go quiet in exactly the conditions that break it.
        reply = await ask(
          context.uid,
          teacherMessages(briefed, sittingNote(context, snapshot.scope, briefed.length)),
          { ...(context.signal ? { signal: context.signal } : {}) },
        );
      } catch {
        return refused("model-unreachable");
      }
      if (reply.errorText || !reply.text) return refused("model-unreachable");

      const parsed = extractJson(reply.text);
      if (!parsed) return refused("unparseable");

      const because =
        typeof parsed.because === "string" && parsed.because.trim() ? parsed.because.trim() : "no reason given";

      // 🔴 THE OBJECTIVE IS READ BEFORE THE VERB, AND THE ORDER IS LOAD-BEARING. Checking the verb
      // first files a decline as `unknown-action` whenever the model writes `{"objective": null,
      // "move": null}` — a perfectly coherent "nothing here is worth doing", reported as a fault.
      // The refusal tally is the one instrument that tells a working controller from a broken one,
      // and restraint reading as a failure rate would poison exactly that.
      //
      // 🔴 A CANVAS-WIDE DECLINE IS A DECISION, NOT A REFUSAL. It is the same `null` the structured
      // policy returns when everything has advanced, and it is one of the behaviours being compared.
      const named = parsed.objective ?? null;
      if (named === null) {
        // `advance`, or nothing said at all. Anything else names a move with nothing to move on —
        // incoherent, and worth seeing rather than smoothing over.
        const move = parsed.move ?? null;
        if (move === null || move === "advance") return { decision: null, refusal: null, strategy: "llm_teacher" };
        return refused("unknown-objective");
      }

      if (!isVerb(parsed.move)) return refused("unknown-action");
      const verb = parsed.move;
      if (NEEDS_OBJECTIVE.includes(verb) && typeof named !== "string") return refused("unknown-objective");

      // 🔴🔴 THE VALIDATION THAT KEEPS THIS HONEST. A model naming an objective that is not on this
      // canvas is the single most likely failure — it will paraphrase an id, merge two, or invent one
      // that reads plausibly. The tempting recoveries are fuzzy matching and falling through to the
      // structured policy; both silently convert a failed decision into a working one. Exact
      // membership, or a counted refusal.
      const entry = context.objectives.find((candidate) => candidate.objective.identityKey === named);
      if (!entry) return refused("unknown-objective");
      // 🔴 FROM THE BRIEFED WINDOW, NOT THE WHOLE SNAPSHOT. A model naming an objective it was not
      // shown has hallucinated an id that happens to exist, and treating that as a valid choice
      // would let a lucky guess act on material the controller never reasoned about.
      const objectiveSnapshot = briefed.find((s) => s.identityKey === entry.objective.identityKey);
      if (!objectiveSnapshot) return refused("unknown-objective");

      // 🔴 THE SAME BUILDER BOTH ARMS USE, CALLED THE SAME WAY. The experiment's constraint is that
      // everything except the choosing is identical; options built one way here and another way in
      // `decideNext` would put different questions in front of two cohorts.
      const choiceSets = choiceSetsForPool({
        evidence: context.evidence,
        objectives: context.objectives,
      });
      const chosen = actionFor({
        because,
        choices: choiceSets.get(entry.objective.identityKey) ?? null,
        entry,
        evidence: context.evidence,
        snapshot: objectiveSnapshot,
        verb,
      });
      // The verb was legal and the objective was real, but the move is not available for THIS
      // objective — a contrast with no observed belief, a rung already at the end of the ladder, a
      // worked example over material with no process in it. Counted, never silently substituted with
      // a different move the model did not choose.
      //
      // 🔴 THE BUILDER'S OWN REASON, PASSED THROUGH RATHER THAN FLATTENED TO ONE NAME. See
      // `ActionOrRefusal`: "we do not have that move" and "this material cannot support it" are
      // different facts about the arm's health, and only the second is a healthy controller.
      if (!chosen.action) return refused(chosen.refusal);
      const action = chosen.action;

      const mine = context.evidence.filter((row) => row.objectiveIdentityKey === entry.objective.identityKey);
      const decision: TeachingDecision = {
        action,
        cognitiveMode: expositionOf(action).mode,
        evidence: mine,
        exposition: expositionOf(action),
        knowledge: entry.knowledge,
        objective: entry.objective,
        rationale: { because, by: "llm_teacher", candidates: context.objectives.length },
        state: projectLearnerState(entry.objective.identityKey, mine),
      };
      return { decision, refusal: null, strategy: "llm_teacher" };
    },
  };
}

/** The shipped controller, on the same metered door every other Canvas model call uses. */
export const llmTeacherStrategy: TeachingStrategy = createLlmTeacherStrategy(meteredTransport);
