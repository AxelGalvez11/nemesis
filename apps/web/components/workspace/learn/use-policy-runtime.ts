"use client";

// The loop, closed.
//
//     source → knowledge → objective → learner state → policy → task
//       → real answer → real evaluator → append-only evidence → state again → policy again
//
// 🔴 THE LOOP IS OUTSIDE THE POLICY, AND THIS FILE IS THE OUTSIDE. `chooseNextTeachingAction` sees
// one state and returns one action; nothing in it remembers being called. What makes the canvas
// adaptive is that evidence changes the state, so the next call is answered differently. If a
// sequence ever appears in this product again it will appear here, as an index or a "step" — there
// is deliberately neither.
//
// 🔴 AND NOTHING HERE DECIDES WHAT THE ANSWER SHOWED. The evaluator does. This file carries text to
// it and carries a verdict back; a `text === expected` shortcut would be faster, wrong about
// capitalisation and synonyms, and — the part that matters — unable to tell a wrong answer from a
// specific competing belief, which is the one distinction that changes the teaching.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { canvasCapture } from "@/lib/learn/canvas-analytics";
import { evaluateLearningResponse } from "@/lib/learn/canvas-api";
import type { LearningCanvas, ResponseEvaluation } from "@/lib/learn/canvas-model";
import { ensureKnowledgeForCanvas, type CanvasKnowledge } from "@/lib/learn/canvas-knowledge";
import { emptyCoverage } from "@/lib/learn/knowledge-coverage";
import { policyAllowed, policyForced, type PolicyOverride } from "@/lib/learn/policy-override";
import { loadEvidence, recordEvidence, type StoredObjective } from "@/lib/learn/learner-store";
import type { LearnerEvidence } from "@/lib/learn/learner-evidence";
import {
  evidenceFromEvaluation,
  objectiveAsTask,
  retrievalPromptFor,
  unobtainedEvidence,
  type RetrievalPrompt,
} from "@/lib/learn/objective-task";
import { decideNext, supportedObjectives, type PolicyDecision } from "@/lib/learn/policy-runtime";
import { isAdmissionOfNotKnowing } from "@/lib/learn/response-admission";
import { THINKING_VISIBLE_AFTER_MS, type ThinkingPhase } from "@/lib/learn/thinking-phases";

import { useDelayedFlag } from "./use-delayed-flag";

export interface PolicyRuntime {
  /** 🔴 THREE VALUES, NOT TWO. Resolving a canvas's knowledge is a round trip, and defaulting to
   *  "inactive" while it runs would paint the legacy stage — and run its effects — for a canvas
   *  the policy is about to own. A flash of the wrong runtime is not cosmetic here: the six-stage
   *  machine starts generating a lesson. */
  status: "loading" | "active" | "inactive";
  decision: PolicyDecision | null;
  /** The question on screen, when the policy asked for one. */
  prompt: RetrievalPrompt | null;
  /** What the judge said about the last answer, held until the learner moves on. */
  feedback: { evaluation: ResponseEvaluation; answer: string } | null;
  judging: boolean;
  /**
   * The step currently running, or null when nothing is.
   *
   * 🔴 SET BY THE STEP ITSELF. Nothing advances this on a timer, and there is no ordered list it
   * walks — if a phase is skipped or repeated, that is because the work was. A caption that cycled
   * through plausible stages would be indistinguishable from a working system right up until it
   * described something that never ran.
   */
  phase: ThinkingPhase | null;
  /** The phase has run long enough to be worth saying out loud. See THINKING_VISIBLE_AFTER_MS. */
  thinking: boolean;
  error: string | null;
  /** Why this canvas has the objectives it has — stated, so "nothing to teach" and "we could not
   *  read the file" stay different facts. */
  outcome: CanvasKnowledge["outcome"];
  /**
   * This runtime is on a canvas it does not own, because someone asked for it.
   *
   * 🔴 CARRIED TO THE SCREEN, NOT KEPT INTERNAL. A bypassed session that looked identical to a real
   * one is precisely what made the old `?policy=1` untrustworthy: "is ownership working?" could not
   * be answered by using the product. Anything showing this runtime must say when it was forced.
   */
  forced: boolean;
  /** What the canvas is made of and what supported knowledge accounts for — the ownership numbers,
   *  so a forced session can show WHY it would otherwise have been refused. */
  coverage: CanvasKnowledge["coverage"];
  submit: (text: string, via: "typed" | "spoken", tookMs?: number) => Promise<void>;
  admitUnknown: () => Promise<void>;
  /** Read the correction, then let the policy decide again from the same state. */
  acknowledge: () => void;
}

/** The sources this canvas can produce durable knowledge from. Used as an effect dependency so
 *  attaching material re-resolves, and re-rendering does not. */
/** A canvas with no sources at all, before anything has been read. Nothing is owned from here. */
const EMPTY_COVERAGE = emptyCoverage(0);

function durableSignature(canvas: LearningCanvas): string {
  return canvas.sources
    .map((source) => source.librarySourceId)
    .filter(Boolean)
    .sort()
    .join(",");
}

/**
 * @param override What the URL asked for, if anything. `null` is the ordinary case.
 *
 * 🔴 THERE IS NO OPT-IN HERE ANY MORE. Ownership is decided from what the canvas's sources contain
 * — see `policyOwnsCanvas` — so an ordinary visit passes `null` and coverage answers. The two
 * things left are a stop and a bypass, and the bypass DECLARES ITSELF all the way to the screen:
 * a forced session that looked like an owned one would make "did ownership work?" unanswerable by
 * looking, which is exactly what the old `?policy=1` cost.
 */
export function usePolicyRuntime(canvas: LearningCanvas, override: PolicyOverride): PolicyRuntime {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const enabled = policyAllowed(override);
  const forced = policyForced(override);

  const [status, setStatus] = useState<PolicyRuntime["status"]>(enabled ? "loading" : "inactive");
  const [knowledge, setKnowledge] = useState<CanvasKnowledge>({
    coverage: EMPTY_COVERAGE,
    objectives: [],
    outcome: "no-durable-source",
    ownership: { coverage: EMPTY_COVERAGE, owns: false, refusal: "source-not-read" },
  });
  const [evidence, setEvidence] = useState<LearnerEvidence[]>([]);
  const [prompt, setPrompt] = useState<RetrievalPrompt | null>(null);
  const [feedback, setFeedback] = useState<PolicyRuntime["feedback"]>(null);
  const [judging, setJudging] = useState(false);
  const [phase, setPhase] = useState<ThinkingPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Bumped when the learner reads a correction, so the same state can produce a fresh prompt. */
  const [round, setRound] = useState(0);
  /** 🔴 SESSION-LOCAL, NEVER PERSISTED. Reading a correction says nothing about what the learner
   *  can now do, so it is not evidence and must not be stored as any. It exists only to stop the
   *  same card being served twice in a row — see `decideNext`'s `actedOn`. */
  const [actedOn, setActedOn] = useState<ReadonlySet<string>>(() => new Set());
  /** Frozen per evidence change rather than read per render: the policy takes `now`, and a clock
   *  that moved on every render would make the decision unstable for no reason. */
  const [decidedAt, setDecidedAt] = useState(() => new Date());

  const sources = durableSignature(canvas);

  useEffect(() => {
    if (!enabled || !uid) {
      setStatus("inactive");
      return;
    }
    let live = true;
    setStatus("loading");
    void (async () => {
      const resolved = await ensureKnowledgeForCanvas(uid, canvas, {
        bypassOwnership: forced,
        onPhase: (step) => {
          if (live) setPhase(step);
        },
      });
      if (!live) return;
      setKnowledge(resolved);
      const supported = supportedObjectives(resolved.objectives);
      // 🔴 ASKED OF THE CANVAS'S MATERIAL, NOT OF WHAT CAME OUT OF IT. The decision is made in
      // `policyOwnsCanvas` from what every source is made of, so a document holding one glossary
      // table and forty pages of prose keeps the runtime that can show the prose.
      //
      // 🔴 AND THE BYPASS DOES NOT REWRITE THE DECISION, IT OVERRIDES ACTING ON IT. `ownership.owns`
      // stays false on a forced canvas, and the surface reads it to say so. Flipping the verdict
      // itself would erase the only evidence that this session was not the ordinary path.
      if (!resolved.ownership.owns && !forced) {
        setPhase(null);
        setStatus("inactive");
        return;
      }
      // 🔴 A FORCED SESSION WITH NOTHING SUPPORTED IN IT HAS NO QUESTION TO ASK. Bypassing coverage
      // cannot conjure an association out of a lecture, so this refuses rather than painting an
      // empty runtime over a document the learner could otherwise read.
      if (supported.length === 0) {
        setPhase(null);
        setStatus("inactive");
        return;
      }
      setPhase("finding_gap");
      const rows = await loadEvidence(uid, supported.map((entry) => entry.objective));
      if (!live) return;
      setEvidence(rows);
      setDecidedAt(new Date());
      setPhase(null);
      setStatus("active");
    })();
    return () => {
      live = false;
    };
    // 🔴 Keyed on the SOURCES, not on `canvas`. The canvas object is replaced on every keystroke of
    // a rename and on every block edit; depending on it would re-resolve knowledge continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, forced, sources, uid]);

  const supported = useMemo(() => supportedObjectives(knowledge.objectives), [knowledge]);

  const decision = useMemo(
    () =>
      status === "active"
        ? decideNext({ actedOn, evidence, now: decidedAt, objectives: supported })
        : null,
    [actedOn, decidedAt, evidence, status, supported],
  );

  // ── One prompt per decision ────────────────────────────────────────────────
  //
  // 🔴 THE PROMPT ID IS THE IDEMPOTENCY KEY FOR THE EVIDENCE IT PRODUCES, so it must be minted
  // exactly once per decision and then held. Minting it at submit time would give a double click
  // two ids and two rows for one performance — and `demonstrationCount` is what the policy reads
  // to decide whether something has been shown repeatedly, so the learner would be credited with
  // practice they never did. A fresh random id per decision is also why a genuinely new attempt
  // after a reload lands rather than being swallowed as a duplicate.
  const decisionKey = decision
    ? `${decision.objective.identityKey}:${decision.action.type}:${decision.state.evidenceCount}:${round}`
    : null;
  const mintedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!decision || decision.action.type !== "retrieve" || !decisionKey) {
      if (!decision || decision.action.type !== "retrieve") setPrompt(null);
      return;
    }
    if (mintedFor.current === decisionKey) return;
    mintedFor.current = decisionKey;
    setPrompt(retrievalPromptFor(decision.objective, crypto.randomUUID()));
  }, [decision, decisionKey]);

  const refresh = useCallback(
    async (objectives: readonly StoredObjective[]) => {
      if (!uid) return;
      const rows = await loadEvidence(uid, objectives);
      setEvidence(rows);
      setDecidedAt(new Date());
    },
    [uid],
  );

  const record = useCallback(
    async (built: Parameters<typeof recordEvidence>[1]) => {
      const written = await recordEvidence(uid, built);
      if (!written) {
        setError("That answer was judged, but Nemesis could not save it. It won't count yet.");
        return;
      }
      // 🔴 THE POLICY RUNS AGAIN FROM RE-READ EVIDENCE, NOT FROM WHAT WE JUST SENT. Applying the
      // new row to local state would work right up until a write was rejected, and then the canvas
      // would teach from a learner model the database does not hold. Reading it back is what makes
      // "the log is the truth" true at runtime and not only in the type comments.
      await refresh(supported.map((entry) => entry.objective));
    },
    [refresh, supported, uid],
  );

  /** An opportunity that produced nothing — a reveal, a giving-up, a typed "I don't know".
   *
   *  🔴 `tookMs` TRAVELS DOWN THIS PATH TOO. Someone who typed "I don't know" spent time doing it,
   *  and that is an observation about the attempt worth keeping — dropping it here would make the
   *  admission look like an opportunity nobody watched. It stays absent when nothing typed it. */
  const admitNothing = useCallback(
    async (said: string | null, tookMs?: number) => {
      const active = prompt;
      if (!active || !decision || !uid) return;
      canvasCapture("canvas_unknown_admitted", canvas, { objective: decision.objective.identityKey });
      setFeedback(null);
      await record(
        unobtainedEvidence({
          canvasId: canvas.id || null,
          objectiveRowId: decision.objective.rowId,
          occurredAt: new Date().toISOString(),
          prompt: active,
          responseText: said,
          ...(tookMs !== undefined ? { tookMs } : {}),
        }),
      );
    },
    [canvas, decision, prompt, record, uid],
  );

  const submit = useCallback(
    async (text: string, via: "typed" | "spoken", tookMs?: number) => {
      const said = text.trim();
      const active = prompt;
      if (!said || !active || !decision || !uid || judging) return;
      setError(null);

      // 🔴 SAYING "I DON'T KNOW" IS NOT A WRONG ANSWER, AND THE JUDGE HAS NO WAY TO SAY SO. The
      // dedicated control for this was removed from the recall surface — it competed with the
      // question, and someone who does not know can simply type it. But the evaluator's verdicts
      // are all judgements of an ATTEMPT, so an admission would come back `incorrect` and the
      // learner would be recorded as having got it wrong when they told us they had nothing. Same
      // path as the old button: an opportunity given, no demonstration obtained, no verdict.
      if (isAdmissionOfNotKnowing(said)) {
        await admitNothing(said, tookMs);
        return;
      }

      setJudging(true);
      setPhase("reading_answer");
      const response = { text: said, via, ...(tookMs !== undefined ? { tookMs } : {}) };
      const result = await evaluateLearningResponse(
        uid,
        canvas,
        objectiveAsTask(decision.objective, active, response),
      );
      setJudging(false);
      setPhase(null);

      if (!result.value) {
        // 🔴 A JUDGE WE COULD NOT REACH IS NOT A LEARNER WHO FAILED. Writing `not_demonstrated`
        // here would charge someone for our outage — the same absence-as-evidence defect the whole
        // design exists to avoid — so nothing is recorded and the prompt stays put for another go.
        // The cost is honest and bounded: a flaky judge means no progress, never wrong progress.
        canvasCapture("canvas_judge_failed", canvas, { objective: decision.objective.identityKey });
        // 🔴 SAYS WHAT IS TRUE HERE, NOT WHAT THE SHARED STRING SAYS. The evaluator's own message
        // ends "Your response was saved" — true on the six-stage path, where the answer is written
        // to the canvas before the judge is called, and FALSE here, where evidence is written only
        // from a verdict. Passing it through would tell someone their work was kept when it was not.
        setError("Nemesis couldn't read that answer, so nothing was recorded. Try again.");
        return;
      }

      const evaluation = result.value;
      setFeedback({ answer: said, evaluation });
      canvasCapture("canvas_response_judged", canvas, {
        confidence: evaluation.confidence,
        objective: decision.objective.identityKey,
        stage: "policy",
        verdict: evaluation.verdict,
        via,
      });
      await record(
        evidenceFromEvaluation({
          canvasId: canvas.id || null,
          evaluation,
          objectiveRowId: decision.objective.rowId,
          occurredAt: new Date().toISOString(),
          prompt: active,
          response,
        }),
      );
    },
    [admitNothing, canvas, decision, judging, prompt, record, uid],
  );

  /** Kept as a capability with no control on the recall surface: the caller decides whether to
   *  offer a button for it, and the meaning is identical either way. */
  const admitUnknown = useCallback(async () => {
    if (judging) return;
    setError(null);
    await admitNothing(null);
  }, [admitNothing, judging]);

  const acknowledge = useCallback(() => {
    const seen = decision?.objective.identityKey;
    setFeedback(null);
    setRound((current) => current + 1);
    if (seen) setActedOn((current) => new Set(current).add(seen));
    setDecidedAt(new Date());
  }, [decision]);

  // 🔴 THE ONLY THING THAT DECIDES WHETHER AN INDICATOR APPEARS IS HOW LONG THE WORK ACTUALLY TOOK.
  // Everything in the recall path normally finishes well inside this window, so a learner drilling
  // facts sees no loading state at all — not a fast one, none. It surfaces only when there is
  // genuinely something to wait for.
  const thinking = useDelayedFlag(phase !== null, THINKING_VISIBLE_AFTER_MS);

  return {
    acknowledge,
    admitUnknown,
    coverage: knowledge.coverage,
    decision,
    error,
    feedback,
    // 🔴 FORCED MEANS "RUNNING WITHOUT OWNERSHIP", NOT "SOMEONE TYPED force". On a canvas the
    // policy owns anyway, the parameter changed nothing and there is nothing to disclose.
    forced: forced && !knowledge.ownership.owns,
    judging,
    outcome: knowledge.outcome,
    phase,
    prompt,
    status,
    submit,
    thinking,
  };
}
