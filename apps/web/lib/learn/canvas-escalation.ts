/**
 * When a canvas turn is worth a stronger model, and why.
 *
 * 🔴🔴 THE DEFAULT IS THE CHEAP MODEL AND A PAID PLAN DOES NOT CHANGE IT. The owner's rule is
 * explicit: *"Do not interpret a higher Nemesis subscription tier as permission to use the
 * expensive model on every operation… A paid plan can increase the permitted compute budget or
 * escalation ceiling. It should not automatically waste that budget."* So a plan appears in this
 * file exactly once — as a CEILING on how many escalations a session may make — and never as a
 * reason to escalate.
 *
 * 🔴 EVERY ESCALATION HAS A NAMED, OBSERVED REASON. Not a heuristic about difficulty, not a guess
 * about the topic, not "this looks hard": something measurable already went wrong on the cheap
 * path. Two reasons qualify today and both are quality failures the system has already detected on
 * its own:
 *
 *   `cheap-model-unusable-output`  The cheap model answered and the answer did not survive
 *                                  validation — `parseCanvasOps`, `parseEvaluation`,
 *                                  `parseLesson` returned nothing usable. Today that is a dead
 *                                  end the learner reads as *"Nemesis couldn't build a lesson
 *                                  from that. Try again."* One retry on a stronger model is the
 *                                  cheapest thing that can turn a failed turn into a turn.
 *   `judgement-did-not-settle`     The judge came back BELOW `TRUSTED_ENOUGH_TO_UPDATE_STATE`,
 *                                  which means by construction that its verdict may not move what
 *                                  Nemesis believes about the learner (`verdictIsTrustworthy`).
 *                                  The turn produced an observation and no claim: the learner
 *                                  answered and learned nothing about whether they were right.
 *                                  That is the definition of an unresolved ambiguity, and it is
 *                                  already measured rather than estimated.
 *
 * 🔴 WHAT IS DELIBERATELY NOT A REASON, AND WHY. `repair_misconception` is the most tempting — it
 * is plausibly the hardest teaching act on the canvas — and there is NO MEASUREMENT that a stronger
 * model repairs a false belief better. The owner's own instruction ends *"other measured cases
 * where stronger reasoning materially changes outcome"*, and adding an unmeasured one would make
 * this file a place where a feeling becomes a recurring bill. When `strategy-outcomes.ts` can show
 * a difference, that is the evidence to add it on.
 *
 * 🔴 AND ESCALATION IS BOUNDED, PER SESSION AND PER TURN. A model that keeps failing validation
 * would otherwise escalate on every attempt for ever — the retry loop that turns a bad minute into
 * a bad invoice. One escalation per turn, a small number per session.
 *
 * PURE. No network, no environment. `canvas-api.ts` calls it and applies the answer.
 */

/** What the canvas may route to. Names the wire model, not a tier. */
export type CanvasModel =
  /** DeepSeek Flash with thinking off — the ordinary cognition path, and the default for everything. */
  | "deepseek-chat"
  /**
   * DeepSeek Flash with thinking ON.
   *
   * 🔴 THE RUNG THAT ACTUALLY EXISTS BETWEEN CHEAP AND EXPENSIVE, AND IT IS THE ONE TO REACH FOR
   * FIRST. `resolveModel` in the metering valve maps `deepseek-reasoner` to `deepseek-v4-flash`
   * with `thinking: { type: "enabled" }` — the SAME MODEL at the same per-token price, thinking
   * harder. The whole cost of this rung is the extra output tokens the reasoning produces, against
   * `deepseek-v4-pro`'s 3.1x input and output rates for every token of the request. A cascade that
   * jumped straight from Flash to Pro would skip the rung that costs almost nothing.
   */
  | "deepseek-reasoner";

/** Why a turn escalated. Recorded on every escalation so it can be judged later. */
export type CanvasEscalationReason =
  | "cheap-model-unusable-output"
  | "judgement-did-not-settle";

/**
 * How many escalations one canvas session may make, by plan.
 *
 * 🔴 A CEILING, NOT AN ALLOWANCE TO SPEND. A session that never fails validation and never
 * produces an unsettled judgement escalates zero times on every plan, which is the intended and
 * the common case. What a paid plan buys is a higher bound on how many BAD turns can be rescued
 * before the surface stops trying.
 *
 * The free number is deliberately not zero: a learner whose first lesson fails to parse and who
 * cannot be rescued has a broken product, not a cheap one.
 */
export const ESCALATION_CEILING: Readonly<Record<string, number>> = {
  free: 3,
  max: 30,
  plus: 10,
  pro: 20,
};

/** The ceiling for a plan, defaulting to free for an unknown one. */
export function escalationCeiling(plan: string | null | undefined): number {
  const key = (plan ?? "").trim().toLowerCase();
  return ESCALATION_CEILING[key] ?? ESCALATION_CEILING.free!;
}

export interface EscalationState {
  /** Escalations already made in this session. */
  readonly spent: number;
  /** The learner's plan, for the ceiling only. */
  readonly plan: string | null;
}

export interface EscalationRequest {
  /**
   * What went wrong on the cheap path, or null when nothing did.
   *
   * 🔴 NULL IS THE ORDINARY CASE AND MUST STAY THE ORDINARY CASE. A caller that always passes a
   * reason has turned an escalation ladder into a model picker.
   */
  readonly reason: CanvasEscalationReason | null;
  /** True when this turn has already escalated once. One rescue per turn, never a loop. */
  readonly alreadyEscalatedThisTurn: boolean;
}

export type ModelChoice =
  | { readonly model: "deepseek-chat"; readonly escalated: false; readonly reason: null; readonly detail: string }
  | {
      readonly model: "deepseek-reasoner";
      readonly escalated: true;
      readonly reason: CanvasEscalationReason;
      readonly detail: string;
    };

const ORDINARY: ModelChoice = {
  detail: "ordinary cognition; nothing has failed on the cheap path",
  escalated: false,
  model: "deepseek-chat",
  reason: null,
};

/**
 * Which model this turn should use. PURE.
 *
 * 🔴 THE ORDER IS: NO REASON, THEN NO BUDGET, THEN ESCALATE. A caller who supplies no reason can
 * never reach the stronger model however much budget is left, which is what keeps the ceiling from
 * becoming a target.
 */
export function chooseCanvasModel(request: EscalationRequest, state: EscalationState): ModelChoice {
  if (!request.reason) return ORDINARY;
  if (request.alreadyEscalatedThisTurn) {
    return {
      ...ORDINARY,
      detail: "this turn has already been escalated once; a second rescue is a retry loop, not a decision",
    };
  }
  const ceiling = escalationCeiling(state.plan);
  if (state.spent >= ceiling) {
    return {
      ...ORDINARY,
      detail: `this session has spent its ${ceiling} escalation(s); the cheap path answers or the turn fails honestly`,
    };
  }
  return {
    detail:
      request.reason === "cheap-model-unusable-output"
        ? "the cheap model's answer did not survive validation, so the turn produced nothing"
        : "the judge could not tell, so the turn produced an observation and no claim about the learner",
    escalated: true,
    model: "deepseek-reasoner",
    reason: request.reason,
  };
}

/**
 * A session's escalation ledger.
 *
 * MUTABLE ON PURPOSE, for the reason `VisionLedger` is: a budget that returned a new copy on every
 * debit would let a caller spend the same allowance twice by holding the old one.
 */
export class EscalationLedger {
  #spent = 0;
  #byReason = new Map<CanvasEscalationReason, number>();
  readonly plan: string | null;

  constructor(plan: string | null) {
    this.plan = plan;
  }

  get spent(): number {
    return this.#spent;
  }

  state(): EscalationState {
    return { plan: this.plan, spent: this.#spent };
  }

  /** Record one escalation. Charged when it is DECIDED, not when it succeeds — a stronger model
   *  that also failed was still billed. */
  note(reason: CanvasEscalationReason): void {
    this.#spent += 1;
    this.#byReason.set(reason, (this.#byReason.get(reason) ?? 0) + 1);
  }

  /** What this session escalated for, so a later question about whether it was worth it has data. */
  report(): { spent: number; ceiling: number; byReason: Record<string, number> } {
    return {
      byReason: Object.fromEntries(this.#byReason),
      ceiling: escalationCeiling(this.plan),
      spent: this.#spent,
    };
  }
}
