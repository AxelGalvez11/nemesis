"use client";

// Nemesis Lab — the Tutor Lab.
//
// 🔴🔴 THE CENTRE IS THE REAL `LearningCanvas`, NOT A HARNESS AROUND IT. Same component, same
// `usePolicyRuntime`, same knowledge extraction, same objectives, same retrieval, same controller,
// same judge, same evidence writer, same next-action policy. The Lab supplies three things and
// nothing else: a throwaway learner to be, a canvas built from a source the owner just inspected,
// and a panel listening to the trace.
//
// 🔴 IF THIS PAGE EVER NEEDS ITS OWN TEACHING CODE TO WORK, THE PAGE IS WRONG. The owner's rule is
// that the Lab observes the system and must not become a second system, and the only defence is
// that everything cognitive here is imported from where production imports it.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { LearningCanvas } from "@/components/workspace/learn/learning-canvas";
import { WorkspacePreviewProvider } from "@/components/workspace/preview-context";
import { conditionEvidence, LAB_CONDITIONS, type LabCondition } from "@/lib/lab/learner-conditions";
import { ensureLabCanvas, labObjectiveRows } from "@/lib/lab/tutor-canvas";
import type { LabTurn } from "@/lib/lab/turns";
import { recordEvidence } from "@/lib/learn/learner-store";
import { policyOverrideFrom } from "@/lib/learn/policy-override";
import { strategyOverrideFrom, TEACHING_STRATEGIES, type TeachingStrategyId } from "@/lib/learn/teaching-strategy";
import { supabase } from "@/lib/supabase";

import { ControllerCompare } from "./controller-compare";
import { DebugPanel, useLabTrace } from "./debug-panel";

interface LabSession {
  userId: string;
  canvasId: string;
  reused: boolean;
}

export function TutorLab() {
  const params = useSearchParams();
  const router = useRouter();
  const sourceId = params.get("source");
  const teacher = params.get("teacher");
  const [session, setSession] = useState<LabSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Signing in as the Lab's own learner…");
  const { events, clear } = useLabTrace();
  const [seeding, setSeeding] = useState(false);
  const [seedNote, setSeedNote] = useState<string | null>(null);

  const strategy: TeachingStrategyId | null = useMemo(() => strategyOverrideFrom(teacher), [teacher]);

  useEffect(() => {
    if (!sourceId) return;
    let live = true;
    void (async () => {
      try {
        const response = await fetch("/api/dev/lab/learner", { method: "POST" });
        const learner = (await response.json()) as {
          userId?: string;
          accessToken?: string;
          refreshToken?: string;
          error?: string;
        };
        if (!response.ok || !learner.userId || !learner.accessToken || !learner.refreshToken) {
          if (live) setError(learner.error ?? "Could not sign in as the Lab learner.");
          return;
        }
        // 🔴 A REAL SESSION, SO EVERY WRITE BELOW IS SUBJECT TO ROW-LEVEL SECURITY EXACTLY AS A
        // STUDENT'S IS. A service-key shortcut here would make the Tutor Lab prove nothing about
        // whether the real evidence path works.
        const { error: authError } = await supabase.auth.setSession({
          access_token: learner.accessToken,
          refresh_token: learner.refreshToken,
        });
        if (authError) {
          if (live) setError(`Could not start the Lab session: ${authError.message}`);
          return;
        }
        if (!live) return;
        setStatus("Building the canvas from the stored parse…");
        const built = await ensureLabCanvas(learner.userId, sourceId);
        if (!live) return;
        if (!built.ok) {
          setError(built.error);
          return;
        }
        setSession({ canvasId: built.canvas.id, reused: built.reused, userId: learner.userId });
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : "Could not open the Tutor Lab.");
      }
    })();
    return () => {
      live = false;
    };
  }, [sourceId]);

  /** §11 — put the learner into a chosen starting condition, through the real evidence writer. */
  const seed = useCallback(
    async (condition: LabCondition) => {
      if (!session) return;
      setSeeding(true);
      setSeedNote(null);
      try {
        const objectives = await labObjectiveRows(session.userId);
        if (objectives.length === 0) {
          setSeedNote("No objectives exist yet. Let the canvas finish reading the source, then try again.");
          return;
        }
        const now = new Date();
        let written = 0;
        for (const objective of objectives) {
          const rows = conditionEvidence({
            canvasId: session.canvasId,
            condition,
            now,
            objectiveRowId: objective.id,
          });
          for (const row of rows) {
            if (await recordEvidence(session.userId, row)) written += 1;
          }
        }
        setSeedNote(
          condition === "unknown"
            ? "“Unknown” writes nothing. To clear existing evidence use Reset in the header."
            : `Wrote ${written} seeded row(s) across ${objectives.length} objective(s). Reload to let the controller decide again from them.`,
        );
      } finally {
        setSeeding(false);
      }
    },
    [session],
  );

  const reset = useCallback(async () => {
    if (!window.confirm("Delete everything the Lab learner owns? Your own account is untouched.")) return;
    const response = await fetch("/api/dev/lab/reset", {
      body: JSON.stringify({ keepLearner: true }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const json = (await response.json()) as { deleted?: Record<string, number | string>; error?: string };
    if (json.error) {
      setError(json.error);
      return;
    }
    setSeedNote(`Deleted: ${Object.entries(json.deleted ?? {}).map(([table, n]) => `${table} ${n}`).join(", ")}`);
    setSession(null);
    router.refresh();
    window.location.reload();
  }, [router]);

  const saveCase = useCallback(
    async (turn: LabTurn) => {
      const note = window.prompt("What went wrong on this turn?");
      if (!note) return;
      const body = new FormData();
      body.set("kind", "tutor");
      body.set("note", note);
      body.set("turn", JSON.stringify(turn));
      body.set("sourceId", sourceId ?? "");
      body.set("canvasId", session?.canvasId ?? "");
      const response = await fetch("/api/dev/lab/cases", { body, method: "POST" });
      const json = (await response.json()) as { id?: string; error?: string };
      setSeedNote(json.id ? `Saved regression case ${json.id}` : (json.error ?? "Could not save the case."));
    },
    [session, sourceId],
  );

  if (!sourceId) {
    return (
      <main className="p-8 text-sm text-neutral-400">
        <p>The Tutor Lab teaches from a source you have already inspected.</p>
        <p className="mt-2">
          Open the <a className="underline" href="/dev/lab/parser">Parser</a> tab, drop a file in, and press
          “Open in Tutor Lab”.
        </p>
      </main>
    );
  }

  return (
    <div className="flex h-[calc(100vh-45px)] min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-2 text-xs">
        <span className="text-neutral-500">Controller:</span>
        {TEACHING_STRATEGIES.filter((id) => id !== "nemesis_policy_fallback").map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => router.push(`/dev/lab/tutor?source=${sourceId}&teacher=${id}`)}
            className={`rounded border px-2 py-1 ${
              (strategy ?? "default") === id ? "border-neutral-300 bg-neutral-700" : "border-neutral-700 hover:border-neutral-500"
            }`}
          >
            {id === "llm_teacher" ? "LLM teacher" : "Nemesis policy"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => router.push(`/dev/lab/tutor?source=${sourceId}`)}
          className={`rounded border px-2 py-1 ${strategy === null ? "border-neutral-300 bg-neutral-700" : "border-neutral-700 hover:border-neutral-500"}`}
          title="Whatever a real learner would get: the default arm, or their randomised assignment."
        >
          Default
        </button>

        <span className="ml-4 text-neutral-500">Start the learner as:</span>
        {LAB_CONDITIONS.map((condition) => (
          <button
            key={condition.id}
            type="button"
            disabled={!session || seeding}
            onClick={() => void seed(condition.id)}
            title={condition.blurb}
            className="rounded border border-neutral-700 px-2 py-1 hover:border-neutral-500 disabled:opacity-40"
          >
            {condition.label}
          </button>
        ))}

        <button type="button" onClick={() => void reset()} className="ml-auto rounded border border-red-800 px-2 py-1 text-red-300 hover:border-red-600">
          Reset the Lab learner
        </button>
      </div>

      {seedNote ? <p className="border-b border-neutral-800 px-4 py-1 text-xs text-amber-300">{seedNote}</p> : null}
      {error ? <p className="px-4 py-3 text-sm text-red-400">{error}</p> : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_460px]">
        <div className="min-h-0 overflow-hidden" data-workspace="">
          {session ? (
            <WorkspacePreviewProvider value={{ email: "nemesis-lab@nemesis.test" }}>
              <LearningCanvas
                canvasId={session.canvasId}
                policyOverride={policyOverrideFrom(params.get("policy"))}
                {...(strategy ? { strategyOverride: strategy } : {})}
              />
            </WorkspacePreviewProvider>
          ) : (
            <p className="p-6 text-sm text-neutral-500">{error ? "" : status}</p>
          )}
        </div>
        <div className="flex min-h-0 flex-col">
          <ControllerCompare userId={session?.userId ?? null} canvasId={session?.canvasId ?? null} />
          <div className="min-h-0 flex-1">
            <DebugPanel events={events} onClear={clear} onSaveCase={(turn) => void saveCase(turn)} />
          </div>
        </div>
      </div>
    </div>
  );
}
