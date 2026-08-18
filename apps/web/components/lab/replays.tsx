"use client";

// Saved failures, run again — Nemesis Lab §14.
//
// 🔴 PARSER CASES RERUN ON THE SERVER; TEACHING CASES RERUN HERE. That split is not arbitrary. A
// parse is bytes in, structure out, and the server holds the file. A teaching turn needs the
// learner's own JWT to reach the metered model door and to satisfy row-level security, so running
// it anywhere but a real browser session would exercise a path no learner ever takes.
//
// 🔴 AND EVERY RERUN REPORTS DRIFT, NEVER PASS OR FAIL. A case is saved because the behaviour was
// WRONG; treating the recorded observation as the expected result would build a guard that goes red
// the day someone fixes it.

import { useCallback, useEffect, useState } from "react";

import type { LabCase } from "@/lib/lab/cases";
import { driftBetween, tutorFacts, type ReplayResult } from "@/lib/lab/replay";
import { isTracedContext, replayContext, type TracedContext } from "@/lib/lab/replay-context";
import type { LabTurn } from "@/lib/lab/turns";
import { evaluateLearningResponse } from "@/lib/learn/canvas-api";
import type { LearningCanvas } from "@/lib/learn/canvas-model";
import { controllerFor } from "@/lib/learn/strategy-registry";
import type { TeachingStrategyId } from "@/lib/learn/teaching-strategy";
import { supabase } from "@/lib/supabase";

export function Replays() {
  const [cases, setCases] = useState<LabCase[]>([]);
  const [results, setResults] = useState<Record<string, ReplayResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/dev/lab/cases");
    const json = (await response.json()) as { cases?: LabCase[] };
    setCases(json.cases ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rerun = useCallback(
    async (entry: LabCase) => {
      setBusy(entry.id);
      setError(null);
      try {
        const result =
          entry.kind === "parser" ? await rerunParser(entry) : await rerunTutor(entry);
        setResults((current) => ({ ...current, [entry.id]: result }));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The rerun failed.");
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  return (
    <main className="p-5">
      <h1 className="text-sm font-semibold">Replays</h1>
      <p className="mt-1 max-w-prose text-xs text-neutral-400">
        Every bad parse and bad teaching moment you saved. Running one again tells you what changed
        since you saved it. It never says “pass” — you saved these because they were wrong, so a
        rerun that matched the old behaviour exactly would be the bad news.
      </p>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {cases.length === 0 ? (
          <p className="text-xs text-neutral-500">
            Nothing saved yet. Press “Save as regression” in the Parser tab, or “save as regression” on a
            turn in the Tutor tab.
          </p>
        ) : null}
        {cases.map((entry) => (
          <div key={entry.id} className="rounded border border-neutral-800 bg-neutral-900 p-3 text-xs">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="rounded bg-neutral-800 px-1 py-0.5 text-[10px] uppercase text-neutral-400">
                {entry.kind}
              </span>
              <span className="text-neutral-200">{entry.note}</span>
              <span className="text-neutral-600">{new Date(entry.savedAt).toLocaleString()}</span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void rerun(entry)}
                className="ml-auto rounded border border-neutral-700 px-2 py-0.5 hover:border-neutral-500 disabled:opacity-40"
              >
                {busy === entry.id ? "Running…" : "Run it again"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`Delete case ${entry.id}?`)) return;
                  await fetch(`/api/dev/lab/cases/${entry.id}`, { method: "DELETE" });
                  void load();
                }}
                className="rounded border border-neutral-800 px-2 py-0.5 text-neutral-500 hover:border-neutral-600"
              >
                delete
              </button>
            </div>
            <p className="mt-1 text-[11px] text-neutral-600">
              {entry.id}
              {entry.file ? ` · ${entry.file.name} (${(entry.file.bytes / 1024).toFixed(0)} KB, stored with the case)` : ""}
              {entry.unit !== undefined ? ` · unit ${entry.unit + 1}` : ""}
            </p>
            <Result result={results[entry.id]} />
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-neutral-500">what was observed when you saved it</summary>
              <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[10px] text-neutral-500">
                {JSON.stringify(entry.observed, null, 2)}
              </pre>
            </details>
          </div>
        ))}
      </div>
    </main>
  );
}

function Result({ result }: { result: ReplayResult | undefined }) {
  if (!result) return null;
  if (!result.ran) {
    return (
      <p className="mt-2 text-amber-400">
        This did not run. {result.note} An empty list of differences here would look exactly like
        “nothing changed”.
      </p>
    );
  }
  if (result.drift.length === 0) {
    return <p className="mt-2 text-neutral-300">Ran, and behaves exactly as it did when you saved it.</p>;
  }
  return (
    <table className="mt-2 text-[11px]">
      <tbody>
        <tr className="text-neutral-500">
          <td className="pr-3">what</td>
          <td className="pr-3">when you saved it</td>
          <td>now</td>
        </tr>
        {result.drift.map((entry) => (
          <tr key={entry.field}>
            <td className="pr-3 text-neutral-500">{entry.field}</td>
            <td className="pr-3 text-neutral-400">{entry.before}</td>
            <td className="text-emerald-300">{entry.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

async function rerunParser(entry: LabCase): Promise<ReplayResult> {
  const response = await fetch(`/api/dev/lab/cases/${entry.id}/rerun`, { method: "POST" });
  return (await response.json()) as ReplayResult;
}

/**
 * Rerun one saved teaching turn, as the Lab learner.
 *
 * Two halves, and either may be absent from a given case — an absent half is REPORTED rather than
 * skipped, because "the controller was not rerun" and "the controller chose the same thing" are
 * opposite conclusions.
 */
async function rerunTutor(entry: LabCase): Promise<ReplayResult> {
  const signIn = await fetch("/api/dev/lab/learner", { method: "POST" });
  const learner = (await signIn.json()) as { userId?: string; accessToken?: string; refreshToken?: string; error?: string };
  if (!learner.userId || !learner.accessToken || !learner.refreshToken) {
    return { drift: [], note: learner.error ?? "Could not sign in as the Lab learner.", ran: false };
  }
  await supabase.auth.setSession({ access_token: learner.accessToken, refresh_token: learner.refreshToken });

  const turn = (entry.observed as { turn?: LabTurn }).turn;
  if (!turn) return { drift: [], note: "This case holds no turn to replay.", ran: false };

  const controllerEvent = turn.events.find((event) => event.kind === "controller");
  const judgeEvent = turn.events.find((event) => event.kind === "judge");
  const context = (controllerEvent?.detail as { context?: Record<string, unknown> } | undefined)?.context;

  let action: string | null = null;
  let objective: string | null = null;
  let refusal: string | null = null;
  if (isTracedContext(context)) {
    const abort = new AbortController();
    // 🔴 THE SHARED REBUILD, so a saved case replays against exactly what production passes.
    const replay = replayContext(context as TracedContext, learner.userId, abort.signal);
    const outcome = await controllerFor((turn.strategy ?? "llm_teacher") as TeachingStrategyId, replay);
    action = outcome.decision?.action.type ?? null;
    objective = outcome.decision?.objective.identityKey ?? null;
    refusal = outcome.refusal ?? null;
  }

  let verdict: string | null = null;
  let errorType: string | null = null;
  const judgeInput = (judgeEvent?.detail as { judgeInput?: unknown; concepts?: unknown } | undefined) ?? {};
  if (judgeInput.judgeInput) {
    // 🔴 `evaluateLearningResponse` READS EXACTLY ONE FIELD OFF THE CANVAS — `concepts` — which is
    // why the saved concepts are enough and why nothing here has to resurrect a whole canvas. If it
    // ever reads a second field, this line is the one that has to change with it.
    const evaluated = await evaluateLearningResponse(
      learner.userId,
      { concepts: judgeInput.concepts ?? [] } as unknown as LearningCanvas,
      judgeInput.judgeInput as Parameters<typeof evaluateLearningResponse>[2],
    );
    verdict = evaluated.value?.verdict ?? null;
    errorType = evaluated.value?.errorType ?? null;
  }

  if (!isTracedContext(context) && !judgeInput.judgeInput) {
    return {
      drift: [],
      note: "This turn recorded neither a controller context nor a judge input, so there is nothing to run again.",
      ran: false,
    };
  }

  const before = tutorFacts({
    action: turn.action,
    errorType: turn.errorType,
    objective: turn.objective,
    refusal: turn.refusal,
    strategy: turn.strategy,
    verdict: turn.verdict,
  });
  const replayedController = isTracedContext(context);
  const after = tutorFacts({
    action: replayedController ? action : turn.action,
    errorType: judgeInput.judgeInput ? errorType : turn.errorType,
    objective: replayedController ? objective : turn.objective,
    refusal: replayedController ? refusal : turn.refusal,
    strategy: turn.strategy,
    verdict: judgeInput.judgeInput ? verdict : turn.verdict,
  });

  return {
    drift: driftBetween(before, after),
    note: replayedController && judgeInput.judgeInput ? null : replayedController ? "Only the controller was rerun; this turn recorded no judge input." : "Only the judge was rerun; this turn recorded no controller context.",
    ran: true,
  };
}
