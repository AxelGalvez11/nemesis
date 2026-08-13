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
import {
  applyFocus,
  availableTerritories,
  WHOLE_CANVAS,
  type FocusScope,
} from "@/lib/learn/canvas-focus";
import { tempoFor, type HostedTask } from "@/lib/learn/canvas-hosting";
import { emptyCoverage } from "@/lib/learn/knowledge-coverage";
import { policyAllowed, policyForced, type PolicyOverride } from "@/lib/learn/policy-override";
import { loadEvidence, recordEvidence, type StoredObjective } from "@/lib/learn/learner-store";
import type { LearnerEvidence } from "@/lib/learn/learner-evidence";
import {
  evidenceForSubmission,
  judgementOf,
  objectiveAsTask,
  outcomeFor,
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
   *  "unavailable" while it runs would paint the legacy stage — and run its effects — for a canvas
   *  the policy is about to contribute to. A flash of the wrong runtime is not cosmetic here: the
   *  six-stage machine starts generating a lesson.
   *
   *  🔴 `ready` REPLACED `active`, AND THE RENAME IS THE WHOLE OF STEP 7b. "Active" meant *this
   *  runtime has taken the page*; there is no such state any more. `ready` means *this runtime can
   *  contribute a task* — the Canvas owns the surface and decides where to put it. Ownership is
   *  still computed and still reported (`ownership`), it just no longer decides whether a question
   *  may appear. See docs/canvas-task-hosting.md §1. */
  status: "loading" | "ready" | "unavailable";
  /**
   * What the policy is contributing right now, or null when it has nothing to ask.
   *
   * 🔴 THE THING THE CANVAS HOSTS, AND IT IS SEPARATE FROM `status` ON PURPOSE. Three different
   * facts used to collapse into "inactive": the policy is off, coverage refused the canvas, and
   * there is nothing supported to ask. Only the first and last mean "no task". Merging them is how
   * an empty task shell gets hosted over a document.
   */
  task: HostedTask | null;
  /**
   * Could the policy have taken this whole canvas? Reported, never gating presentation.
   *
   * 🔴 IT KEEPS ITS EXACT MEANING. `policyOwnsCanvas` still runs, still requires
   * `unrepresented === 0`, and is still what `forced` discloses against. What changed is that a
   * `false` here no longer hides the canvas's supported knowledge from the learner — that was
   * whole-page scaffolding, and §14.1 says the answer to "it owns nothing" is composition, never a
   * lower bar.
   */
  ownership: CanvasKnowledge["ownership"];
  /** The territory the learner is working in. Session-local; never persisted (§11). */
  focus: FocusScope;
  setFocus: (scope: FocusScope) => void;
  /** What the learner could focus on, built from knowledge this canvas actually holds. */
  territories: readonly { label: string; identityKeys: readonly string[] }[];
  decision: PolicyDecision | null;
  /** The question on screen, when the policy asked for one. */
  prompt: RetrievalPrompt | null;
  /** What the judge said about the last answer, held until the learner moves on. */
  feedback: { evaluation: ResponseEvaluation; answer: string } | null;
  judging: boolean;
  /**
   * This answer's evidence is written but not yet read back — do not decide the next prompt yet.
   *
   * 🔴 GATE AUTO-ADVANCE ON THIS, NOT ON A TIMER. `judging` is already `false` when the write
   * starts, so it cannot be used for this. While `recording` is true, `evidence` still lacks the row
   * this answer just produced, and any next-prompt decision computed from it can re-ask the question
   * that was just answered — with its answer on screen. `acknowledge()` refuses while it is true, so
   * forgetting costs a missed advance rather than a fabricated demonstration.
   */
  recording: boolean;
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

  const [status, setStatus] = useState<PolicyRuntime["status"]>(enabled ? "loading" : "unavailable");
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
  /**
   * This answer's evidence is written but not yet read back.
   *
   * 🔴 A DIFFERENT QUESTION FROM `judging`, AND THE GAP BETWEEN THEM WAS THE BUG. `judging` covers
   * the evaluator call and is already `false` when the write begins, so between the verdict
   * appearing and the re-read landing there was NO signal at all — and in exactly that window,
   * `evidence` still lacks the row this very answer produced.
   *
   * 🔴 WHY IT IS NOT A FLICKER. `task` is null while feedback is on screen, so the learner cannot
   * answer anything — until `acknowledge()` clears it. If that runs inside this window, the next
   * task is built from a `decision` computed WITHOUT the answer just given. Because `actedOn`
   * reorders and never filters, that resolves to the same objective whenever it is the only one
   * still owed something. The learner is told they were right and immediately asked the identical
   * question with the answer on screen — and nothing stops them answering it. That submission is
   * real: it writes a durable demonstration of working memory against a prompt whose answer was
   * visible. §M3's echo, arriving through a race rather than through a policy.
   */
  const [recording, setRecording] = useState(false);
  const [phase, setPhase] = useState<ThinkingPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Bumped when the learner reads a correction, so the same state can produce a fresh prompt. */
  const [round, setRound] = useState(0);
  /** 🔴 SESSION-LOCAL, NEVER PERSISTED. Reading a correction says nothing about what the learner
   *  can now do, so it is not evidence and must not be stored as any. It exists only to stop the
   *  same card being served twice in a row — see `decideNext`'s `actedOn`. */
  const [actedOn, setActedOn] = useState<ReadonlySet<string>>(() => new Set());
  /**
   * Objectives whose CORRECTION has actually been put on the screen this session.
   *
   * 🔴 SESSION-LOCAL, NEVER PERSISTED, for the same reason as `actedOn`: receiving a correction is
   * not a demonstration, so it must never be written as evidence.
   *
   * 🔴 AND IT IS NOT `actedOn`, THOUGH BOTH ARE FILLED IN THE SAME PLACE. `acknowledge()` runs when
   * the learner clears the FEEDBACK screen after answering, which is before any correction has been
   * displayed — so `actedOn` is already set at the moment the correction is first owed. This set is
   * added to ONLY when the thing being acknowledged was the correction itself, which is what makes
   * it able to answer "have they been told?" rather than "have we been here?".
   */
  const [correctionsShown, setCorrectionsShown] = useState<ReadonlySet<string>>(() => new Set());
  /** Frozen per evidence change rather than read per render: the policy takes `now`, and a clock
   *  that moved on every render would make the decision unstable for no reason. */
  const [decidedAt, setDecidedAt] = useState(() => new Date());
  /** 🔴 SESSION-LOCAL, NEVER PERSISTED. Where the learner is looking is not a fact about what they
   *  know; storing it would put a UI preference inside the learner model where the next reader
   *  could not tell it from evidence. */
  const [focus, setFocus] = useState<FocusScope>(WHOLE_CANVAS);

  const sources = durableSignature(canvas);

  useEffect(() => {
    if (!enabled || !uid) {
      setStatus("unavailable");
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
      // 🔴 OWNERSHIP NO LONGER DECIDES WHETHER A QUESTION MAY APPEAR — THIS IS STEP 7b.
      //
      // The refusal that used to live here (`!resolved.ownership.owns && !forced` → inactive) was
      // whole-page scaffolding: because ownership was all-or-nothing, a canvas holding one glossary
      // table and forty pages of prose had to be refused entirely, and §12 measured the result as
      // owning 0 of 6 production canvases. The Canvas now owns the surface and hosts the task
      // beside the prose, so a partly-supported canvas gets BOTH.
      //
      // `resolved.ownership` is still computed, still carried out on the return value, and still
      // what `forced` discloses against. Deleting the computation — rather than the gate — would
      // have thrown away the one fact that tells a bypassed session from an ordinary one.
      //
      // 🔴 THE REMAINING REFUSAL IS THE ONE THAT IS STILL TRUE. Nothing supported means nothing to
      // ask, on any canvas, owned or not. Hosting an empty task shell over a document is the
      // failure this guard exists to prevent, and it is why `supported.length` was never the same
      // question as ownership.
      if (supported.length === 0) {
        setPhase(null);
        setStatus("unavailable");
        return;
      }
      setPhase("finding_gap");
      const rows = await loadEvidence(uid, supported.map((entry) => entry.objective));
      if (!live) return;
      setEvidence(rows);
      setDecidedAt(new Date());
      setPhase(null);
      setStatus("ready");
    })();
    return () => {
      live = false;
    };
    // 🔴 Keyed on the SOURCES, not on `canvas`. The canvas object is replaced on every keystroke of
    // a rename and on every block edit; depending on it would re-resolve knowledge continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, forced, sources, uid]);

  const supported = useMemo(() => supportedObjectives(knowledge.objectives), [knowledge]);

  // 🔴 THE SCOPE NARROWS THE CANDIDATES, THEN THE POLICY CHOOSES FREELY INSIDE IT. Selecting a
  // territory sets `focus_scope`; it does not set an operation, a difficulty or a kind of card
  // (§11). Filtering the list `decideNext` arbitrates over is the whole of the constraint — reaching
  // any further in would be a curriculum wearing a Minimap's clothes (§14.7).
  const inFocus = useMemo(() => applyFocus(supported, focus), [focus, supported]);

  const decision = useMemo(
    () =>
      status === "ready"
        ? decideNext({ actedOn, correctionsShown, evidence, now: decidedAt, objectives: inFocus })
        : null,
    [actedOn, correctionsShown, decidedAt, evidence, inFocus, status],
  );

  // ── One prompt per decision ────────────────────────────────────────────────
  //
  // 🔴 THE PROMPT ID IS THE IDEMPOTENCY KEY FOR THE EVIDENCE IT PRODUCES, so it must be minted
  // exactly once per decision and then held. Minting it at submit time would give a double click
  // two ids and two rows for one performance — and `demonstrationCount` is what the policy reads
  // to decide whether something has been shown repeatedly, so the learner would be credited with
  // practice they never did. A fresh random id per decision is also why a genuinely new attempt
  // after a reload lands rather than being swallowed as a duplicate.
  //
  // 🔴 THIS IS NOW THE LAST PLACE "ONE SUBMISSION → ONE PROMPT" CAN BREAK, AND IT IS THE ONE PLACE
  // NO TEST CAN SEE IT. The fan-out below holds the other half by construction: a prompt carries a
  // SET of targets, so however many objectives one answer touches, they share its id because they
  // share its prompt.
  //
  // What is not structural is up here. `decideNext` returns exactly one objective today, so one
  // decision is one key and one key is one prompt. The moment a `PolicyDecision` carries a set —
  // which is what `BRAIN-003` exists to make possible — the tempting edit is to build a key per
  // objective, and that mints a prompt per objective, and each prompt gets its own
  // `crypto.randomUUID()`. One 20-second explanation is then four performances of 20 seconds each.
  //
  // That failure arrives from ABOVE the layer that guards against it, so nothing in
  // `objective-task.ts` can catch it and no test asserts on it — there is no multi-objective
  // decision to test with yet. THE KEY MUST IDENTIFY THE SUBMISSION, NEVER AN OBJECTIVE WITHIN IT:
  // a decision covering four objectives is ONE key, and `retrievalPromptFor` gives way to
  // `promptTargeting` with all four targets on the single prompt it returns.
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

  /**
   * Write everything one submission produced, then re-read.
   *
   * 🔴 IT TAKES THE WHOLE PERFORMANCE, NOT A ROW. One answer covering four objectives is four rows
   * sharing one response identity, and they succeed or fail as one thing as far as the learner is
   * concerned — so the error is reported once, about the answer, rather than four times about rows
   * they never knew existed.
   *
   * 🔴 THE WRITES ARE SEQUENTIAL AND NOT ATOMIC, WHICH IS A REAL AND ACCEPTED LIMITATION. A failure
   * partway leaves the earlier rows written. That never over-claims — the rows that landed are
   * things the judge genuinely established — and because every row's `(objective, responseId)` pair
   * is stable, re-submitting the same answer re-attempts all of them and the ones already stored
   * are no-ops, so a retry converges rather than duplicating. The clean fix is a batched upsert in
   * `learner-store.ts`, which is Brain's file; requested rather than reached into.
   */
  const record = useCallback(
    async (built: readonly Parameters<typeof recordEvidence>[1][]) => {
      // 🔴 NOTHING TO WRITE IS NOT A FAILURE TO WRITE, AND RUNTIME-006 MADE THIS REACHABLE.
      //
      // `written` used to start as `built.length > 0`, so an empty array fell straight into the
      // error below and told the learner *"That answer was judged, but Nemesis could not save it"* —
      // both halves false when the judge was never reached. It was unreachable before, because
      // every path returned one row per target. `noJudgement()` now legitimately produces zero rows
      // for any prompt, and it is a value a caller is invited to construct and hand down here.
      //
      // So the guard lives at the writer rather than at the one call site that currently avoids it:
      // an outage writes nothing AND claims nothing. No error, and no refresh — nothing changed, so
      // re-reading would be a round trip that can only tell us what we already know.
      if (built.length === 0) return;

      // 🔴 RAISED BEFORE THE FIRST WRITE, LOWERED ONLY AFTER THE RE-READ — see `recording`. It spans
      // the whole window in which `evidence` disagrees with what the learner just did, and it is a
      // `finally` because the failure paths are part of that window too: a flag left raised would
      // freeze the surface, and one dropped early would reopen the race it exists to close.
      setRecording(true);
      try {
        let written = true;
        for (const row of built) {
          // Sequential rather than concurrent: they conflict on the same index, and a burst of
          // parallel upserts for one answer is exactly the shape that makes a duplicate look like a
          // race rather than the no-op it is meant to be.
          if (!(await recordEvidence(uid, row))) written = false;
        }
        if (!written) {
          setError("That answer was judged, but Nemesis could not save it. It won't count yet.");
          // 🔴 NO REFRESH ON FAILURE. Re-reading here would let the policy decide its next move from
          // a half-written performance, teaching from a learner model that is missing exactly the
          // rows the write dropped.
          return;
        }
        // 🔴 THE POLICY RUNS AGAIN FROM RE-READ EVIDENCE, NOT FROM WHAT WE JUST SENT. Applying the
        // new row to local state would work right up until a write was rejected, and then the canvas
        // would teach from a learner model the database does not hold. Reading it back is what makes
        // "the log is the truth" true at runtime and not only in the type comments.
        await refresh(supported.map((entry) => entry.objective));
      } finally {
        setRecording(false);
      }
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
        //
        // 🔴 THIS BRANCH IS `noJudgement()` — AND IT IS NO LONGER THE ONLY THING HOLDING THE LINE.
        // Until RUNTIME-006 the invariant lived entirely in this early return: pass `[]` further
        // down and every target would have been written as "asked, showed nothing". `Judgement` now
        // carries the distinction, so a future caller that deletes this guard cannot silently get
        // the wrong behaviour — it has to say which case it is in. The return stays because the
        // UI differs too: `record()` reports a save failure, which is not what happened here.
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
        evidenceForSubmission({
          canvasId: canvas.id || null,
          occurredAt: new Date().toISOString(),
          // 🔴 THE JUDGE ASSESSED THE OBJECTIVE IT WAS ASKED ABOUT, AND THAT IS WHAT IS NAMED HERE.
          // This surface stages one objective per question, so one verdict covers one target. When
          // a multi-objective judge exists it returns one of these per objective it actually
          // assessed, and the fan-out routes them unchanged — nothing here has to spread a verdict
          // across a set, which is the one thing that would record demonstrations nobody made.
          //
          // 🔴 `judged(...)` RATHER THAN A BARE ARRAY — RUNTIME-006. Reaching this line is itself
          // the claim that we have an account of the performance. The unreachable-judge case is
          // `noJudgement()` and writes nothing; it is handled above, before anything is built.
          judgement: judgementOf([outcomeFor(decision.objective, evaluation)]),
          prompt: active,
          responseText: said,
          ...(tookMs !== undefined ? { tookMs } : {}),
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
    // 🔴 REFUSED WHILE THE ANSWER IS STILL SETTLING, AND THE DIRECTION OF ERROR IS DELIBERATE.
    //
    // A caller is expected to wait for `recording` to clear — but this must not depend on every
    // caller remembering, because the cost of forgetting is not symmetric. Acknowledging early
    // clears the feedback and lets a task be built from a `decision` that predates this answer,
    // which can put the same question back with its answer on screen and record the echo as a
    // demonstration: invisible, durable, and a false claim about a learner.
    //
    // Refusing costs an auto-advance that does not happen — visible, recoverable, and immediately
    // obvious to whoever is testing. A missed advance is a much smaller failure than a fabricated
    // demonstration, so the guard lives here as well as in the caller.
    if (recording) return;
    const seen = decision?.objective.identityKey;
    setFeedback(null);
    setRound((current) => current + 1);
    if (seen) setActedOn((current) => new Set(current).add(seen));
    // 🔴 ONLY WHEN WHAT WAS ACKNOWLEDGED WAS THE CORRECTION ITSELF. This runs for the feedback
    // screen too, and recording that as "the answer has been shown" would make the policy defer at
    // the exact moment the correction is owed — a learner who got something wrong would never be
    // shown the answer at all. The action that was on screen is the only thing that distinguishes
    // them, and it is right here.
    if (seen && decision?.action.type === "show_correction") {
      setCorrectionsShown((current) => new Set(current).add(seen));
    }
    setDecidedAt(new Date());
  }, [decision, recording]);

  // 🔴 THE ONLY THING THAT DECIDES WHETHER AN INDICATOR APPEARS IS HOW LONG THE WORK ACTUALLY TOOK.
  // Everything in the recall path normally finishes well inside this window, so a learner drilling
  // facts sees no loading state at all — not a fast one, none. It surfaces only when there is
  // genuinely something to wait for.
  const thinking = useDelayedFlag(phase !== null, THINKING_VISIBLE_AFTER_MS);

  // ── What the Canvas can host right now ──────────────────────────────────────
  //
  // 🔴 A TASK EXISTS ONLY WHEN THERE IS SOMETHING TO ANSWER, AND FEEDBACK IS NOT THAT. While a
  // verdict is on screen the learner is reading, not answering — hosting a task through it would
  // put the next question up before they had seen what the last one showed, and the composer would
  // start routing answers to a prompt that had replaced the one they were looking at.
  //
  // 🔴 IT ALSO CARRIES THE BRAIN'S OWN PAIR OUT UNTOUCHED. `operation` and `knowledgeType` are the
  // policy's decision; the runtime hands them to the surface so a presentation can differ by
  // cognitive demand (§9, §14.6) without re-deriving what the demand IS.
  const task: HostedTask | null = useMemo(() => {
    if (status !== "ready" || feedback || !decision || !prompt) return null;
    if (decision.action.type !== "retrieve") return null;
    const knowledgeType = decision.knowledge.type;
    const operation = prompt.operation;
    return {
      knowledgeType,
      operation,
      task: {
        answered: false,
        id: prompt.id,
        index: 0,
        kind: "question",
        placeholder: "Type your answer…",
        prompt: prompt.prompt,
        total: 1,
      },
      tempo: tempoFor({ knowledgeType, operation }),
    };
  }, [decision, feedback, prompt, status]);

  const territories = useMemo(() => availableTerritories(supported), [supported]);

  return {
    acknowledge,
    admitUnknown,
    coverage: knowledge.coverage,
    decision,
    error,
    feedback,
    focus,
    // 🔴 FORCED MEANS "RUNNING WITHOUT OWNERSHIP", NOT "SOMEONE TYPED force". On a canvas the
    // policy owns anyway, the parameter changed nothing and there is nothing to disclose.
    forced: forced && !knowledge.ownership.owns,
    judging,
    outcome: knowledge.outcome,
    ownership: knowledge.ownership,
    phase,
    prompt,
    recording,
    setFocus,
    status,
    submit,
    task,
    territories,
    thinking,
  };
}
