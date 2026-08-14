// The baseline arm: the same model, given a strong adaptive-teaching objective, choosing for itself.
//
// 🔴🔴 THIS SUSPENDS AN INVARIANT THE REST OF THIS DIRECTORY IS BUILT ON, AND IT IS QUARANTINED HERE
// SO THAT NOBODY READS IT AS PERMISSION.
//
//   * `canvas-policy.ts`: *"it is DELIBERATELY NOT A MODEL CALL ... A model writes the new content
//     once the action is chosen; it does not choose the action."*
//   * `teaching-policy.ts`: *"it is DETERMINISTIC. No model call, no randomness. A policy that
//     cannot be replayed cannot be debugged."*
//   * `docs/canvas-product-contract.md` §34: *"do not allow an unconstrained LLM prompt to reinvent
//     learning policy on every turn."*
//
// §34 still governs the product. This file is not a proposal to change it — it is the INSTRUMENT
// THAT TESTS IT. §34 is a bet: that explicit, interpretable cognition beats a good model improvising.
// A bet nobody measures is a belief, and the whole point of building this arm is that the owner
// asked whether the structured engine adds value beyond giving the model a good teaching objective.
// If it does, §34 is vindicated with evidence instead of conviction. If it does not, that is
// something worth knowing before more is built on top of it.
//
// 🔴 SO IT IS DEFAULT-OFF, DEV-SWITCHED, AND NEVER THE PRODUCT'S POLICY. `DEFAULT_STRATEGY` is
// `nemesis_policy`, randomisation is off, and no learner reaches this arm without a URL that says
// so. Nothing in the shipping path may import this file except the strategy registry.
//
// 🔴 AND IT IS CONSTRAINED, WHICH IS WHY IT IS A FAIR BASELINE RATHER THAN A DIFFERENT PRODUCT. The
// model does NOT reinvent the learning system: it cannot word a question, invent a task format,
// decide what counts as evidence, bypass the judge, or emit anything outside the action vocabulary
// the structured policy already uses. It chooses WHICH objective and WHICH of the same actions, from
// exactly the inputs `decideNext` reads. That is the comparison the experiment is for: same
// information, same moves, different reasoning about them.
//
// 🔴🔴 THERE IS NO FALLBACK TO THE STRUCTURED POLICY ANYWHERE IN THIS FILE, AND ADDING ONE WOULD
// DESTROY THE EXPERIMENT SILENTLY. The obvious recovery for a model that returns nonsense is "use
// `decideNext` instead" — and then this arm quietly IS the other arm, both cohorts report the same
// outcomes, and the conclusion drawn is "structured cognition adds nothing" when what actually
// happened is that the baseline never ran. Every failure below returns a named refusal that is
// counted. A degraded arm must read as degraded.

import { postChatCompletion } from "@/lib/workspace/chat-api";
import type { ChatRouteDecision } from "@/lib/workspace/chat-routing";

import { extractJson } from "./canvas-parse";
import { expositionFor } from "./cognitive-mode";
import { projectLearnerState } from "./learner-evidence";
import type { LearnerEvidence } from "./learner-evidence";
import type { ResolvedObjective } from "./canvas-knowledge";
import { expositionOf, type TeachingAction } from "./teaching-policy";
import type {
  StrategyOutcome,
  StrategyRefusal,
  TeachingContext,
  TeachingDecision,
  TeachingStrategy,
} from "./teaching-strategy";

/**
 * 🔴 THE SAME MODEL THE REST OF THE CANVAS USES, AND THAT IS AN EXPERIMENTAL REQUIREMENT RATHER THAN
 * a convenience. `canvas-api.ts` sends every Canvas call as `deepseek-chat`, including the evaluator
 * that marks both arms' answers. Giving the baseline a stronger model would mean a favourable result
 * measured the model, not the teaching; giving it a weaker one would rig the comparison the other
 * way. It also keeps the call on the same metered door — same device key, same cost attribution,
 * same budget enforcement — so an experiment cannot open the unmetered lane the unit-economics audit
 * closed.
 */
const TEACHER_MODEL: ChatRouteDecision = { model: "deepseek-chat", route: "conversation", searchWeb: false };

/**
 * The teaching objective the baseline is given.
 *
 * 🔴 THIS IS DELIBERATELY A STRONG PROMPT, NOT A WEAK CHATBOT ONE, AND THAT IS THE WHOLE POINT OF
 * THE EXPERIMENT. A baseline that loses because it was under-instructed proves nothing: the question
 * is whether structured cognition beats a model that has been TOLD to do everything the structure
 * does. So it is told, explicitly, to diagnose, adapt difficulty, use retrieval, correct
 * misconceptions, scaffold, and aim at durable transferable understanding. If the structured engine
 * still wins against this, the win means something.
 *
 * 🔴 IT NAMES NO SUBJECT AND NO DISCIPLINE. The objectives arrive as labels the learner's own
 * material produced, and a teaching instruction that assumed a field would teach a law student as
 * though they were a scientist. Nothing here knows or asks what the material is about.
 *
 * 🔴 AND IT IS TOLD IT MAY DECLINE. A teacher that cannot say "nothing is owed" would ask a question
 * on every single turn, including about material the learner has just demonstrated — which is one of
 * the outcomes being measured. Rigging that by construction would make the metric meaningless.
 */
const TEACHER_SYSTEM =
  "You are an expert tutor working with one learner, in whatever discipline their material happens to be. " +
  "Your goal is to get this learner to durable, transferable understanding of this material as efficiently as possible. " +
  "Diagnose what they already know rather than assuming. Adapt the difficulty to what their record shows. " +
  "Use retrieval practice where it will do more than re-explaining would. Correct misconceptions directly, " +
  "naming the specific wrong belief rather than restating the right answer at them. Scaffold when someone is stuck, " +
  "and stop scaffolding when they are not. Do not spend their attention on things they have already demonstrated, " +
  "and do not ask the same question twice in a row. " +
  "You are choosing ONE next move, and you will be asked again after the learner responds, so do not plan a lesson: " +
  "decide what is worth doing right now, given what this record shows. " +
  "Your entire output is the JSON object requested: no greeting, no commentary, no explanation outside the JSON. " +
  "Never use an em dash. The character - must not appear anywhere in your output.";

/**
 * The moves the baseline may make.
 *
 * 🔴 THE STRUCTURED POLICY'S OWN VOCABULARY, NOT A NEW ONE, WHICH IS WHAT MAKES THE OUTCOMES
 * COMPARABLE. If this arm could emit a move the other cannot, the two would be putting different
 * kinds of screen in front of learners and any difference in result would be partly a difference in
 * what a "turn" even is. `defer` and `advance` are deliberately absent: for a single chosen objective
 * they both mean "not this one", which is already expressible by choosing a different objective or
 * by choosing nothing.
 */
const ALLOWED_ACTIONS = ["retrieve", "show_correction", "contrast"] as const;
type AllowedAction = (typeof ALLOWED_ACTIONS)[number];

function isAllowedAction(value: unknown): value is AllowedAction {
  return typeof value === "string" && (ALLOWED_ACTIONS as readonly string[]).includes(value);
}

/**
 * What the model is told about one objective and this learner's history with it.
 *
 * 🔴 EXACTLY WHAT `decideNext` READS, AND NOTHING MORE. The projected status, how many times it has
 * been met, how many of those obtained a demonstration, the last verdict, how long ago, and any
 * competing belief that was named. Handing the baseline a signal the structured policy cannot see —
 * or withholding one it uses — would make the comparison a difference of inputs rather than of
 * reasoning, and nothing afterwards could separate the two.
 *
 * 🔴 IT IS A DESCRIPTION, NOT A RECOMMENDATION. There is no "due", no "worth asking", no score. The
 * moment this line computed a priority, the structured policy would be doing the baseline's work for
 * it and the arms would converge by construction.
 */
function objectiveBrief(
  entry: ResolvedObjective,
  evidence: readonly LearnerEvidence[],
  now: Date,
): string {
  const mine = evidence.filter((row) => row.objectiveIdentityKey === entry.objective.identityKey);
  const state = projectLearnerState(entry.objective.identityKey, mine);
  const ageMinutes = state.lastEvidenceAt
    ? Math.round((now.getTime() - Date.parse(state.lastEvidenceAt)) / 60_000)
    : null;
  const competing = [
    ...new Set(mine.filter((row) => row.verdict === "misconception").flatMap((row) => row.misconceptions ?? [])),
  ];
  return [
    `- id: ${entry.objective.identityKey}`,
    `  asks about: ${entry.objective.label}`,
    `  what the material says: ${entry.knowledge.statement}`,
    `  status: ${state.status}`,
    `  times met: ${state.evidenceCount}, of which demonstrations: ${state.demonstrationCount}`,
    `  last verdict: ${state.latestVerdict ?? "none"}`,
    ageMinutes === null ? "  last met: never" : `  last met: ${ageMinutes} minutes ago`,
    competing.length > 0 ? `  competing beliefs they have shown: ${competing.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function teacherMessages(context: TeachingContext, sessionNote: string): Parameters<typeof postChatCompletion>[1] {
  const briefs = context.objectives
    .map((entry) => objectiveBrief(entry, context.evidence, context.now))
    .join("\n");
  return [
    { content: TEACHER_SYSTEM, role: "system" },
    {
      content:
        "Here is everything known about what this learner has and has not demonstrated on the material in front of them.\n\n" +
        `${briefs}\n\n` +
        (sessionNote ? `${sessionNote}\n\n` : "") +
        "Choose the single next move. Reply with JSON only:\n" +
        '{"objective": "<the id of the objective you are acting on, copied exactly>", ' +
        '"action": "retrieve" | "show_correction" | "contrast", ' +
        '"because": "<one sentence, for a reviewer, on why this move now>"}\n\n' +
        "retrieve means ask them to produce it, unaided.\n" +
        "show_correction means state the answer plainly, because an attempt fell short and telling them beats asking again.\n" +
        "contrast means put a competing belief they have actually shown beside the right one, then come back to it.\n\n" +
        // 🔴 THE DECLINE PATH IS SPELLED OUT AS AN EQUAL OPTION, NOT AS A LAST RESORT. A teacher that
        // believes it must always act will act on material the learner has already demonstrated,
        // which is precisely one of the behaviours being measured. Burying this instruction, or
        // wording it as a failure, would put a thumb on that scale.
        'If nothing here is worth doing right now, reply {"objective": null, "action": null, "because": "<why not>"}. ' +
        "That is a legitimate answer and it is better than spending this learner's attention on something they have shown they know.\n" +
        "The objective id must be copied exactly from the list above. Do not invent one, and do not answer about anything not listed.",
      role: "user",
    },
  ];
}

/** What this session has already put in front of the learner. 🔴 THE SAME SESSION STATE
 *  `decideNext` receives as `actedOn` and `correctionsShown`, in words. Withholding it would make
 *  the baseline repeat itself for a reason that is our omission rather than its judgement. */
function sessionNoteFor(context: TeachingContext): string {
  const lines: string[] = [];
  const acted = context.actedOn ?? [];
  if (acted.length > 0) {
    // Most recent last, which is the order the runtime keeps them in.
    lines.push(`Already worked in this sitting, oldest first: ${acted.join(", ")}.`);
  }
  const shown = [...(context.correctionsShown ?? new Set<string>())];
  if (shown.length > 0) {
    lines.push(`Answers already stated plainly in this sitting: ${shown.join(", ")}.`);
  }
  return lines.join("\n");
}

/** Build the action, with everything that is NOT the model's to choose taken from the same places
 *  the structured policy takes it from. */
function actionFor(input: {
  chosen: AllowedAction;
  entry: ResolvedObjective;
  because: string;
  evidence: readonly LearnerEvidence[];
}): TeachingAction {
  const id = input.entry.objective.identityKey;
  // 🔴 THE MODE IS NEVER THE MODEL'S. §39 decides what the learner is asked to take in from the
  // capability and the knowledge type, and both arms must resolve it identically — otherwise one arm
  // auto-advances where the other waits for a press, and the difference in measured time is the
  // renderer rather than the teaching.
  const exposition = (kind: "correction" | "contrast") =>
    expositionFor({
      capability: input.entry.objective.capability,
      kind,
      knowledgeType: input.entry.knowledge.type,
    });
  switch (input.chosen) {
    case "retrieve":
      return { because: input.because, objectiveId: id, type: "retrieve" };
    case "show_correction":
      return { because: input.because, exposition: exposition("correction"), objectiveId: id, type: "show_correction" };
    case "contrast":
      return {
        because: input.because,
        // 🔴 DERIVED FROM THE EVIDENCE, EXACTLY AS `chooseNextTeachingAction` DERIVES IT, AND NEVER
        // TAKEN FROM THE MODEL. Naming which false belief a learner holds is authoring a claim about
        // a person; the log already records the ones a judge actually observed. A model-supplied
        // list would let the baseline invent misconceptions and teach against mistakes nobody made,
        // which is not a teaching difference, it is a fabrication.
        competingWith: [
          ...new Set(
            input.evidence
              .filter((row) => row.objectiveIdentityKey === id && row.verdict === "misconception")
              .flatMap((row) => row.misconceptions ?? []),
          ),
        ],
        exposition: exposition("contrast"),
        objectiveIds: [id],
        type: "contrast",
      };
  }
}

function refused(refusal: StrategyRefusal): StrategyOutcome {
  return { decision: null, refusal, strategy: "llm_teacher" };
}

/**
 * How this arm reaches the model.
 *
 * 🔴 INJECTABLE FOR ONE REASON ONLY: SO A TEST CAN PROVE THIS ARM ACTUALLY REACHES A MODEL AND THE
 * OTHER ONE DOES NOT. That is the guard the whole experiment rests on — if the two arms turned out
 * to be running the same controller, every outcome number would be a coincidence — and it cannot be
 * asserted from outside without either module mocking (which would mean changing the repo's test
 * command) or a seam here.
 *
 * 🔴 IT IS NOT A CONFIGURATION POINT AND MUST NOT BECOME ONE. The shipped strategy binds
 * `postChatCompletion` and nothing in the application may pass anything else: routing this arm
 * through a different door would take it off the metered path — the same device key, cost
 * attribution and budget enforcement every other Canvas call uses — which is precisely the hole the
 * unit-economics audit found and closed.
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
    // signed-in session, and calling without one would either fail or, worse, find some other route
    // to the model that the budget does not see.
    if (!context.uid) return refused("model-unreachable");

    // 🔴 A THROW IS A REFUSAL, NOT AN EXCEPTION, AND THIS `catch` IS LOAD-BEARING RATHER THAN
    // DEFENSIVE. `postChatCompletion` REJECTS on an aborted fetch, and the runtime aborts this call
    // every time the learner's evidence moves underneath it — so the ordinary path of answering a
    // question while a decision is in flight would otherwise produce an unhandled rejection. Worse
    // than the noise: an exception escaping here skips the refusal accounting entirely, so the one
    // instrument that tells a working baseline from a broken one would go quiet in exactly the
    // conditions that break it.
    let reply: Awaited<ReturnType<TeacherTransport>>;
    try {
      reply = await ask(context.uid, teacherMessages(context, sessionNoteFor(context)), {
        ...(context.signal ? { signal: context.signal } : {}),
      });
    } catch {
      return refused("model-unreachable");
    }
    if (reply.errorText || !reply.text) return refused("model-unreachable");

    const parsed = extractJson(reply.text);
    if (!parsed) return refused("unparseable");

    const because = typeof parsed.because === "string" && parsed.because.trim() ? parsed.because.trim() : "no reason given";

    // 🔴 A DECLINE IS A DECISION, NOT A REFUSAL, AND CONFLATING THEM WOULD MAKE THE ARM LOOK BROKEN
    // WHENEVER IT WAS BEING CAREFUL. The teacher was offered the option of doing nothing and took it;
    // that is the same `null` the structured policy returns when everything has advanced, and it is
    // one of the behaviours being compared. Counting it as a fault would report restraint as a
    // failure rate.
    if (parsed.action === null || parsed.objective === null) {
      return { decision: null, refusal: null, strategy: "llm_teacher" };
    }

    if (!isAllowedAction(parsed.action)) return refused("unknown-action");

    // 🔴🔴 THE VALIDATION THAT KEEPS THE EXPERIMENT HONEST. A model naming an objective that is not
    // on this canvas is the single most likely failure of this arm — it will paraphrase an id, merge
    // two, or invent one that reads plausibly. The tempting recovery is to fuzzy-match it, or to
    // fall through to the structured policy; both silently convert a failed baseline into a working
    // one. Exact membership, or a counted refusal.
    const entry = context.objectives.find((candidate) => candidate.objective.identityKey === parsed.objective);
    if (!entry) return refused("unknown-objective");

    const mine = context.evidence.filter(
      (row) => row.objectiveIdentityKey === entry.objective.identityKey,
    );
    const action = actionFor({ because, chosen: parsed.action, entry, evidence: context.evidence });
    // 🔴 EVERY REMAINING FIELD IS BUILT THE WAY THE STRUCTURED ARM BUILDS IT. The projection, the
    // evidence slice and the exposition are the same functions on the same inputs, so two decisions
    // naming the same objective and the same action are byte-identical apart from `rationale`. That
    // is asserted, not hoped for: see `strategy-cleanroom.test.ts`.
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

/** The shipped baseline arm, on the same metered door every other Canvas model call uses. */
export const llmTeacherStrategy: TeachingStrategy = createLlmTeacherStrategy(meteredTransport);
