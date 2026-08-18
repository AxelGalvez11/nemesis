"use client";

// Nemesis policy versus the LLM teacher, on identical inputs — Nemesis Lab §12 and §13.
//
// 🔴🔴 IT BUILDS NO CONTEXT OF ITS OWN. The inputs come off the LAST REAL DECISION, carried on the
// trace: the same objectives, the same evidence, the same attention budget, the same instant. That
// is the only way the comparison means anything — a context assembled here would be a third thing
// neither arm ever sees, and the difference in their answers would be a fact about this component.
//
// 🔴 AND IT CALLS `controllerFor`, THE FUNCTION `use-policy-runtime.ts` CALLS. There is no third
// controller, no lab teacher, no reimplementation. §12's rule in the owner's words: "Do not create
// another teaching controller merely for this lab."
//
// 🔴 REPEATING THE SAME ARM ON FROZEN INPUTS IS THE POINT OF §13. If five runs of one arm over one
// unchanged context disagree with each other, the instability is the MODEL. If they agree and the
// product still wanders, the instability is upstream state. Nothing else separates those two.

import { useCallback, useMemo, useState } from "react";

import { isTracedContext, replayContext, type TracedContext } from "@/lib/lab/replay-context";
import { subscribeLabTrace, type LabTraceEvent } from "@/lib/lab/trace";
import { controllerFor } from "@/lib/learn/strategy-registry";
import type { StrategyOutcome, TeachingStrategyId } from "@/lib/learn/teaching-strategy";
import { useEffect } from "react";

interface Run {
  arm: TeachingStrategyId;
  attempt: number;
  action: string;
  objective: string;
  refusal: string | null;
  ms: number;
  rationale: unknown;
}

export function ControllerCompare({ userId, canvasId }: { userId: string | null; canvasId: string | null }) {
  const [frozen, setFrozen] = useState<{ context: Record<string, unknown>; at: number } | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);
  const [repeats, setRepeats] = useState(3);
  const [error, setError] = useState<string | null>(null);

  // Keep the most recent real decision's context, so "freeze" is always available.
  const [latest, setLatest] = useState<Record<string, unknown> | null>(null);
  useEffect(
    () =>
      subscribeLabTrace((event: LabTraceEvent) => {
        if (event.kind !== "controller") return;
        const context = (event.detail as { context?: Record<string, unknown> }).context;
        if (context) setLatest(context);
      }),
    [],
  );

  const run = useCallback(
    async (arms: readonly TeachingStrategyId[]) => {
      const context = frozen?.context ?? latest;
      if (!context || !userId) {
        setError("Nothing to compare yet. Let the canvas make one real decision first.");
        return;
      }
      if (!isTracedContext(context)) {
        setError("The last decision did not record a context this can replay.");
        return;
      }
      setBusy(true);
      setError(null);
      const collected: Run[] = [];
      try {
        for (const arm of arms) {
          for (let attempt = 1; attempt <= repeats; attempt += 1) {
            const abort = new AbortController();
            const startedAt = Date.now();
            // 🔴 ONE SHARED REBUILD — see lib/lab/replay-context.ts. Doing it inline here is how the
            // two Sets arrived as arrays and made `nemesis_policy` throw on every run while
            // `llm_teacher` worked, which read as a difference between the controllers.
            const replay = replayContext(context as TracedContext, userId, abort.signal);
            let outcome: StrategyOutcome;
            try {
              outcome = await controllerFor(arm, replay);
            } catch (cause) {
              collected.push({
                action: "threw",
                arm,
                attempt,
                ms: Date.now() - startedAt,
                objective: "",
                rationale: cause instanceof Error ? cause.message : String(cause),
                refusal: "exception",
              });
              continue;
            }
            collected.push({
              action: outcome.decision?.action.type ?? "none",
              arm: outcome.strategy,
              attempt,
              ms: Date.now() - startedAt,
              objective: outcome.decision?.objective.identityKey ?? "",
              rationale: outcome.decision?.rationale ?? null,
              refusal: outcome.refusal ?? null,
            });
            setRuns([...collected]);
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [frozen, latest, repeats, userId],
  );

  const agreement = useMemo(() => {
    const byArm = new Map<string, Set<string>>();
    for (const entry of runs) {
      const key = `${entry.action}@${entry.objective}`;
      byArm.set(entry.arm, (byArm.get(entry.arm) ?? new Set()).add(key));
    }
    return [...byArm.entries()].map(([arm, choices]) => ({ arm, choices: [...choices] }));
  }, [runs]);

  return (
    <div className="border-b border-neutral-800 bg-neutral-950 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Compare controllers</p>
        <button
          type="button"
          disabled={!latest}
          onClick={() => setFrozen(latest ? { at: Date.now(), context: latest } : null)}
          className="rounded border border-neutral-700 px-2 py-0.5 hover:border-neutral-500 disabled:opacity-40"
          title="Hold these exact inputs, so repeated runs cannot differ because the learner state moved underneath them."
        >
          {frozen ? "Re-freeze inputs" : "Freeze inputs"}
        </button>
        <label className="flex items-center gap-1 text-neutral-500">
          runs each
          <input
            type="number"
            min={1}
            max={10}
            value={repeats}
            onChange={(event) => setRepeats(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
            className="w-12 rounded border border-neutral-700 bg-neutral-900 px-1"
          />
        </label>
        <button
          type="button"
          disabled={busy || !latest}
          onClick={() => void run(["nemesis_policy", "llm_teacher"])}
          className="rounded border border-neutral-700 px-2 py-0.5 hover:border-neutral-500 disabled:opacity-40"
        >
          {busy ? "Running…" : "Both arms"}
        </button>
        <button
          type="button"
          disabled={busy || !latest}
          onClick={() => void run(["llm_teacher"])}
          className="rounded border border-neutral-700 px-2 py-0.5 hover:border-neutral-500 disabled:opacity-40"
          title="Same inputs, same arm, several times. Disagreement here is the model being unstable, not the state changing."
        >
          LLM teacher only
        </button>
        {canvasId ? null : <span className="text-neutral-600">no canvas</span>}
      </div>

      {error ? <p className="mt-1 text-amber-400">{error}</p> : null}
      {!latest ? (
        <p className="mt-1 text-neutral-500">
          Waiting for the canvas to make its first real decision. Everything compared here is taken from
          it, so there is nothing to run until one has happened.
        </p>
      ) : null}
      {frozen ? (
        <p className="mt-1 text-neutral-500">
          Inputs frozen. Every run below sees the same objectives, the same evidence and the same instant.
        </p>
      ) : null}

      {runs.length > 0 ? (
        <>
          <table className="mt-2 w-full text-[11px]">
            <tbody>
              {runs.map((entry, index) => (
                <tr key={index}>
                  <td className="pr-2 text-neutral-500">{entry.arm}</td>
                  <td className="pr-2 text-neutral-600">#{entry.attempt}</td>
                  <td className={`pr-2 ${entry.refusal ? "text-red-400" : "text-neutral-200"}`}>
                    {/* 🔴 THE MESSAGE, NOT JUST THE WORD. "refused: exception" with the cause hidden
                        behind a disclosure is a debug tool that makes you open the console — which is
                        exactly what §18 says the owner must never have to do. */}
                    {entry.refusal
                      ? `refused: ${entry.refusal}${entry.refusal === "exception" && typeof entry.rationale === "string" ? ` — ${entry.rationale}` : ""}`
                      : entry.action}
                  </td>
                  <td className="pr-2 text-neutral-400">{entry.objective || "—"}</td>
                  <td className="text-neutral-600">{entry.ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1 space-y-0.5">
            {agreement.map((entry) => (
              <p key={entry.arm} className={entry.choices.length > 1 ? "text-amber-400" : "text-neutral-500"}>
                {entry.arm}: {entry.choices.length === 1 ? "chose the same thing every time" : `chose ${entry.choices.length} different things on identical inputs`}
              </p>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
