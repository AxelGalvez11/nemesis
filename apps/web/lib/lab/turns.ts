/**
 * A stream of trace events, folded into TURNS — Nemesis Lab §10.
 *
 * 🔴 A TURN STARTS WHEN THE CONTROLLER DECIDES, because that is the unit the owner's question is
 * about: "given this information and this learner state, what did Nemesis do, and why?" Model calls,
 * the question, the verdict, the evidence write and the next decision all hang off one decision.
 *
 * 🔴 EVERY DERIVED FIELD IS `| null` WHEN NOTHING OBSERVED IT, AND THE PANEL PRINTS THE DIFFERENCE.
 * `tokens: null` means the provider reported none (a streamed turn does not carry usage); it does
 * NOT mean the turn was free. `evidenceRows: null` means no write was attempted, which is a
 * different fact from `0` rows written. Those two distinctions are most of the diagnostic value
 * here: they are how "bad judge" is told apart from "bad evidence write".
 *
 * PURE. No React, no I/O.
 */

import { costUsd } from "../../../../supabase/functions/_shared/llm-cost";

import type { LabTraceEvent } from "./trace";

export interface LabTurn {
  index: number;
  startedAt: number;
  events: LabTraceEvent[];
  /** Which controller decided. */
  strategy: string | null;
  /** The objective it chose, by identity key. */
  objective: string | null;
  /** The cognitive action it chose. */
  action: string | null;
  /** Why it could not decide, when it could not. */
  refusal: string | null;
  /** The question actually put in front of the learner. */
  question: string | null;
  /** What the judge said. `null` means no answer was judged in this turn. */
  verdict: string | null;
  /** The kind of failure the judge named, when it named one. */
  errorType: string | null;
  /** Rows written to `learner_evidence`. `null` means no write was attempted. */
  evidenceRows: number | null;
  /** Whether the write succeeded. `null` means none was attempted. */
  evidenceWritten: boolean | null;
  modelCalls: number;
  /** Sum of every measured duration in the turn. */
  totalMs: number;
  /** `null` means no provider reported usage for any call in this turn. */
  tokens: { prompt: number; completion: number; cacheHit: number } | null;
  /** `null` when tokens were not reported, or the answering model has no price on file. */
  costUsd: number | null;
}

interface ModelCallDetail {
  answeredBy?: string | null;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number; cacheHitTokens: number } | null;
}

function emptyTurn(index: number, startedAt: number): LabTurn {
  return {
    action: null,
    costUsd: null,
    errorType: null,
    evidenceRows: null,
    evidenceWritten: null,
    events: [],
    index,
    modelCalls: 0,
    objective: null,
    question: null,
    refusal: null,
    startedAt,
    strategy: null,
    tokens: null,
    totalMs: 0,
    verdict: null,
  };
}

/**
 * Fold the stream.
 *
 * Events before the first controller decision — the knowledge resolution and the model calls it
 * makes — land in turn 0, which is correct: they are the work that produced the first decision.
 */
export function foldTurns(events: readonly LabTraceEvent[]): LabTurn[] {
  const turns: LabTurn[] = [];
  let current: LabTurn | null = null;
  /** Has the open turn already had its decision? A second one means a new turn. */
  let decided = false;

  for (const event of events) {
    const opensTurn = current === null || (event.kind === "controller" && decided);
    if (opensTurn) {
      current = emptyTurn(turns.length, event.at);
      turns.push(current);
      decided = false;
    }
    if (event.kind === "controller") decided = true;
    const turn = current!;
    turn.events.push(event);
    turn.totalMs += event.ms ?? 0;

    if (event.kind === "controller") {
      const detail = event.detail as {
        strategy?: string;
        objective?: { identityKey?: string } | null;
        action?: { type?: string } | null;
        refusal?: string | null;
      };
      turn.strategy = detail.strategy ?? null;
      turn.objective = detail.objective?.identityKey ?? null;
      turn.action = detail.action?.type ?? null;
      turn.refusal = detail.refusal ?? null;
    }

    if (event.kind === "judge") {
      const detail = event.detail as { verdict?: string; errorType?: string | null; question?: string };
      if (detail.verdict) turn.verdict = detail.verdict;
      if (detail.errorType) turn.errorType = detail.errorType;
      if (detail.question) turn.question = detail.question;
    }

    if (event.kind === "evidence") {
      const rows = (event.detail as { rows?: unknown[] }).rows;
      if (Array.isArray(rows)) turn.evidenceRows = rows.length;
      // The failure label is the authority on whether it landed; a write event alone only says one
      // was attempted.
      turn.evidenceWritten = event.label.includes("FAILED") ? false : (turn.evidenceWritten ?? true);
    }

    if (event.kind === "model_call") {
      turn.modelCalls += 1;
      const detail = event.detail as ModelCallDetail;
      const usage = detail.usage;
      if (usage) {
        const tokens = turn.tokens ?? { cacheHit: 0, completion: 0, prompt: 0 };
        turn.tokens = {
          cacheHit: tokens.cacheHit + usage.cacheHitTokens,
          completion: tokens.completion + usage.completionTokens,
          prompt: tokens.prompt + usage.promptTokens,
        };
        // 🔴 PRICED WITH THE VALVE'S OWN CANONICAL TABLE, not a number typed here. If the two ever
        // disagreed, the Lab would be reporting a cost the business does not pay.
        const priced = costUsd(detail.answeredBy ?? "", {
          cacheHitTokens: usage.cacheHitTokens,
          completionTokens: usage.completionTokens,
          promptTokens: usage.promptTokens,
        });
        if (priced.usd !== null && priced.usd !== undefined) {
          turn.costUsd = (turn.costUsd ?? 0) + priced.usd;
        }
      }
    }
  }

  return turns;
}
