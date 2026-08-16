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
import { expositionFor } from "./cognitive-mode";
import { projectLearnerState } from "./learner-evidence";
import type { LearnerEvidence } from "./learner-evidence";
import type { ResolvedObjective } from "./canvas-knowledge";
import { easier, harder } from "./scaffold-prompt";
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
  "You are not trying to achieve perfect mastery of every concept before moving forward. Attention is the scarce",
  "resource and you are spending it. Coverage matters. Importance matters. Prerequisites matter. The cost of",
  "continuing to drill something matters. A learner can understand something well enough for now.",
  "",
  "Every turn is one question: what should this learner spend the next minute thinking about?",
  "You will be asked again after they respond, so do not plan a lesson. Decide the next move only.",
  "",
  "MOVING ON IS A REAL MOVE, NOT A FAILURE. If someone does not know something perfectly but another minute here",
  "has less expected value than going forward, go forward. Do the opposite when the thing is foundational, heavily",
  "emphasized by the source, or blocking material they are already stuck on.",
  "",
  "THINGS THAT ARE TRUE WHATEVER YOU DECIDE:",
  "- Being shown something is not evidence they know it. Only producing it is.",
  "- Recognizing something is weaker evidence than producing it unaided.",
  "- Answering seconds after being told measures working memory, not learning.",
  "- Slow is not wrong. Latency is context, never a verdict.",
  "- You may only act on the misconceptions listed. Do not infer or invent one.",
  "- Never ask the same question twice in a row.",
  "",
  "Your entire output is the JSON object requested: no greeting, no commentary, no explanation outside the JSON.",
  "Never use an em dash. The character - must not appear anywhere in your output.",
].join("\n");

/**
 * The moves.
 *
 * 🔴 ELEVEN VERBS, AND EVERY ONE CHANGES WHAT THE LEARNER MEETS. The owner listed these; the
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
function brief(snapshot: ObjectiveSnapshot): string {
  const lines = [
    `- id: ${snapshot.identityKey}`,
    `  asks: ${snapshot.label}  [${snapshot.capability} over ${snapshot.knowledgeType}]`,
    `  the material says: ${snapshot.statement}`,
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
 * 🔴 TIME IS STATE, NOT A MODE — the owner's ruling in one sentence. A learner with twenty minutes
 * and a learner with six hours reach the identical controller and the identical prompt; what differs
 * is what these two lines say. There is no branch anywhere in this file asking whether we are
 * cramming, and there must never be one.
 */
function sittingNote(context: TeachingContext, scope: { total: number; touched: number; demonstrated: number; importantTotal: number | null; importantDemonstrated: number | null }): string {
  const lines: string[] = [];
  const attention = context.attention;
  if (attention) {
    lines.push(`Attention spent this sitting so far: about ${Math.round(attention.activeMs / 60_000)} minutes.`);
    lines.push(
      attention.availableMs === null
        // 🔴 SAID IN WORDS, BECAUSE A MISSING FIELD READS AS UNLIMITED. Nobody told us how long they
        // have. That is not permission to assume there is plenty.
        ? "How long they have left: nobody has told us. Do not assume it is a lot."
        : `Time left in this sitting: about ${Math.round(attention.availableMs / 60_000)} minutes.`,
    );
  }
  lines.push(
    `Material on this canvas: ${scope.total} objectives, ${scope.touched} touched at all, ` +
      `${scope.demonstrated} produced at least once.`,
  );
  if (scope.importantTotal !== null) {
    lines.push(
      `Of the ones the source treats as central: ${scope.importantTotal} exist, ` +
        `${scope.importantDemonstrated ?? 0} have been produced.`,
    );
  }
  const acted = context.actedOn ?? [];
  if (acted.length > 0) lines.push(`Already worked this sitting, oldest first: ${acted.join(", ")}.`);
  const shown = [...(context.correctionsShown ?? new Set<string>())];
  if (shown.length > 0) lines.push(`Answers already stated plainly this sitting: ${shown.join(", ")}.`);
  return lines.join("\n");
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
function actionFor(input: {
  verb: Verb;
  entry: ResolvedObjective;
  snapshot: ObjectiveSnapshot;
  because: string;
  evidence: readonly LearnerEvidence[];
}): TeachingAction | null {
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
      return { because, objectiveId: id, rung: current, type: "retrieve" };
    case "probe":
      // 🔴 ALWAYS `independent`, WHATEVER THE LADDER SAYS. A probe exists to settle whether a
      // recognition-level pass generalises to production (§31.2). Narrowing it would ask the learner
      // to recognise again and call the result a production probe.
      return { because, objectiveId: id, rung: "independent", type: "retrieve" };
    case "harder": {
      const up = harder(current);
      // 🔴 A REFUSAL, NOT A CLAMP. Returning the same rung would report a difficulty change that did
      // not happen — the exact lie `scaffold-prompt.ts` was written to end.
      return up ? { because, objectiveId: id, rung: up, type: "retrieve" } : null;
    }
    case "easier": {
      const down = easier(current);
      return down ? { because, objectiveId: id, rung: down, type: "retrieve" } : null;
    }
    case "teach":
      return { because, exposition: exposition("correction"), objectiveId: id, type: "teach" };
    case "simplify":
      return { because, exposition: exposition("correction"), objectiveId: id, type: "simplify" };
    case "correct":
      return { because, exposition: exposition("correction"), objectiveId: id, type: "show_correction" };
    case "contrast": {
      // 🔴🔴 DERIVED FROM THE EVIDENCE AND NEVER TAKEN FROM THE MODEL. Naming which false belief a
      // learner holds is authoring a claim about a person. A model-supplied list would let the
      // controller teach against mistakes nobody made, which is not a teaching difference, it is a
      // fabrication — and it is one of the invariants the owner listed by name.
      const competing = input.snapshot.misconceptions;
      // Nothing to separate. A "contrast" against no observed belief is a retrieval with a
      // misleading name, so it is refused and counted rather than quietly downgraded.
      if (competing.length === 0) return null;
      return {
        because,
        competingWith: competing,
        exposition: exposition("contrast"),
        objectiveIds: [id],
        type: "contrast",
      };
    }
    case "defer":
      return { because, objectiveId: id, type: "defer" };
    case "revisit":
      return { because, objectiveId: id, type: "revisit" };
    case "advance":
      return { because, objectiveId: id, type: "advance" };
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

      let reply: Awaited<ReturnType<TeacherTransport>>;
      try {
        // 🔴 A THROW IS A REFUSAL, NOT AN EXCEPTION, AND THIS `catch` IS LOAD-BEARING.
        // `postChatCompletion` REJECTS on an aborted fetch, and the runtime aborts this call every
        // time the learner's evidence moves underneath it. An exception escaping here would skip the
        // refusal accounting entirely, so the one instrument that tells a working controller from a
        // broken one would go quiet in exactly the conditions that break it.
        reply = await ask(
          context.uid,
          teacherMessages(snapshot.objectives, sittingNote(context, snapshot.scope)),
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
      const objectiveSnapshot = snapshot.objectives.find((s) => s.identityKey === entry.objective.identityKey);
      if (!objectiveSnapshot) return refused("unknown-objective");

      const action = actionFor({ because, entry, evidence: context.evidence, snapshot: objectiveSnapshot, verb });
      // The verb was legal and the objective was real, but the move is not available for THIS
      // objective — a contrast with no observed belief, a rung already at the end of the ladder.
      // Counted, never silently substituted with a different move the model did not choose.
      if (!action) return refused("unknown-action");

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
