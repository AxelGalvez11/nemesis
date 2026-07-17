"use client";

import type { ResearchProgressStep } from "@nemesis/shared";
import { Icon } from "./icons";

/** One row in the run checklist. `done` steps are calm/tinted, `active` is the emphasized "you are
 *  here" row (and the only one that can expand its `detail` narration), `pending` is a hollow ring. */
export interface AgentRunStep {
  label: string;
  state: "done" | "active" | "pending";
  detail?: string;
  /** Elapsed wall-clock for this step, rendered right-aligned as `m:ss`. */
  elapsedMs?: number;
}

export interface AgentRunTrackerProps {
  steps: AgentRunStep[];
  className?: string;
}

/** Format a duration as `m:ss` — minutes un-padded, seconds zero-padded (215000 → "3:35", 5000 → "0:05"). */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Manus-style ordered task-progress checklist. Quiet, tight rows — a leading state icon, the step
 *  label, and a right-aligned elapsed timer. The active row is an expandable disclosure whose `detail`
 *  narration renders indented below the label (open by default so the current work is always visible). */
export function AgentRunTracker({ steps, className }: AgentRunTrackerProps) {
  return (
    <ol className={`agent-run-tracker${className ? ` ${className}` : ""}`}>
      {steps.map((step, i) => {
        const time = typeof step.elapsedMs === "number" ? formatElapsed(step.elapsedMs) : null;
        const canExpand = step.state === "active" && Boolean(step.detail);

        if (canExpand) {
          return (
            <li key={`${step.label}-${i}`} className="art-row active">
              <details className="art-disclosure" open>
                <summary className="art-summary">
                  <span className="art-icon" aria-hidden="true"><span className="art-dot" /></span>
                  <span className="art-label">{step.label}</span>
                  {time ? <span className="art-time">{time}</span> : null}
                  <span className="art-chevron" aria-hidden="true"><Icon name="chevron-down" size={13} /></span>
                </summary>
                <p className="art-detail">{step.detail}</p>
              </details>
            </li>
          );
        }

        return (
          <li key={`${step.label}-${i}`} className={`art-row ${step.state}`}>
            <span className="art-icon" aria-hidden="true">
              {step.state === "done" ? <Icon name="check" size={12} /> : null}
              {/* active (no detail) shows the solid dot; pending shows an empty ring via border. */}
              {step.state === "active" ? <span className="art-dot" /> : null}
            </span>
            <span className="art-label">{step.label}</span>
            {time ? <span className="art-time">{time}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Derive ordered checklist steps (with per-step elapsed) from the engine's live progress array.
 *
 *  Each `ResearchProgressStep` carries an ISO `at`; the elapsed for a step is the gap to the NEXT
 *  step's timestamp (the last/active step has no successor, so its `elapsedMs` is left undefined).
 *  State: every step before the last is `done`; the last is `active` unless it's a terminal
 *  `done`/`error` phase, in which case the whole run is finished and every row shows `done`.
 *
 *  `names` optionally overrides the display label per index (falls back to the step's own `detail`,
 *  then a title-cased phase name). NOT wired into ask/page.tsx — that is a later task. */
export function stepsFromProgress(progress: ResearchProgressStep[], names?: string[]): AgentRunStep[] {
  const last = progress[progress.length - 1];
  if (!last) return [];
  const runFinished = last.step === "done" || last.step === "error";

  return progress.map((p, i) => {
    const next = progress[i + 1];
    const elapsedMs = next ? Math.max(0, new Date(next.at).getTime() - new Date(p.at).getTime()) : undefined;
    const isLast = i === progress.length - 1;
    const state: AgentRunStep["state"] = isLast && !runFinished ? "active" : "done";
    const label = names?.[i] ?? p.detail ?? titleCasePhase(p.step);
    // The active row shows the live narration; done rows are quiet (no detail).
    const detail = state === "active" ? p.detail : undefined;
    return { label, state, detail, elapsedMs };
  });
}

function titleCasePhase(step: ResearchProgressStep["step"]): string {
  return step.charAt(0).toUpperCase() + step.slice(1);
}
