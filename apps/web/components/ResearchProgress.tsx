"use client";

import type { ResearchProgressStep } from "@nemesis/shared";
import { Icon } from "./icons";
import { Orb } from "./Orb";

type PhaseKey = Exclude<ResearchProgressStep["step"], "done" | "error">;

// The engine's phases, in order. `done` is terminal and handled separately.
const PHASES: Array<{ key: PhaseKey; label: string; description: string }> = [
  { key: "planning", label: "Planning", description: "Framing the question and evidence route" },
  { key: "gathering", label: "Searching", description: "Retrieving label, literature, and trial sources" },
  { key: "writing", label: "Drafting", description: "Building the answer from cited evidence" },
  { key: "checking", label: "Checking", description: "Verifying claims before the report is saved" },
];
const ORDER = PHASES.map((p) => p.key);

function isPhaseStep(step: ResearchProgressStep["step"]): step is PhaseKey {
  return ORDER.includes(step as PhaseKey);
}

function formatStepTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Live "thinking" panel for an in-flight deep-research run. Reads the streamed progress steps and
 *  lights up the phase checklist; holds the active phase on a spinner until the run completes. */
export function ResearchProgress({ steps, done }: { steps: ResearchProgressStep[]; done: boolean }) {
  const last = steps[steps.length - 1];
  const terminalDone = done || last?.step === "done";
  const errored = last?.step === "error";
  const reachedIdx = terminalDone ? PHASES.length - 1 : last && isPhaseStep(last.step) ? ORDER.indexOf(last.step) : 0;
  const sources = [...steps].reverse().find((s) => typeof s.sources_found === "number")?.sources_found;
  const detail = errored
    ? last?.detail ?? "The run stopped"
    : terminalDone
      ? "Finishing the evidence package"
      : last?.detail ?? "Starting the evidence search";
  const activity = steps.filter((s) => isPhaseStep(s.step)).slice(-4);

  return (
    <details className="thinking research-progress engine-preview" open>
      <summary className="engine-preview-head">
        <Orb size={28} busy={!terminalDone && !errored} />
        <span className="engine-preview-titleblock">
          <span className="engine-preview-title">
            {terminalDone ? "Research complete" : errored ? "Research paused" : "Thinking"}
            {!terminalDone && !errored ? (
              <span className="engine-dots" aria-hidden="true"><span /><span /><span /></span>
            ) : null}
          </span>
          <span className="engine-preview-subtitle">Evidence engine · retrieval · citation checking</span>
        </span>
        {typeof sources === "number" && sources > 0 ? (
          <span className="src-count">{sources} source{sources === 1 ? "" : "s"}</span>
        ) : null}
      </summary>

      <div className={`engine-live-line${errored ? " warn" : ""}`} aria-live="polite">
        <span className="engine-live-dot" aria-hidden="true" />
        <span>{detail}</span>
      </div>

      <div className="engine-step-list">
        {PHASES.map((phase, i) => {
          // done if a later phase started (or the run finished); active = current phase; else pending.
          const state = terminalDone || i < reachedIdx ? "done" : i === reachedIdx && !errored ? "active" : "pending";
          return (
            <div key={phase.key} className={`engine-step ${state}`}>
              <span className="engine-step-icon"><Icon name="check" size={11} /></span>
              <span className="engine-step-copy">
                <span className="engine-step-label">{phase.label}</span>
                <span className="engine-step-desc">{phase.description}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="engine-activity">
        <div className="engine-section-label">Activity</div>
        {activity.length ? activity.map((step, i) => (
          <div key={`${step.at}-${i}`} className="engine-activity-row">
            <span className="engine-activity-time">{formatStepTime(step.at)}</span>
            <span>{step.detail}</span>
            {typeof step.sources_found === "number" ? <span className="engine-activity-count">{step.sources_found} src</span> : null}
          </div>
        )) : (
          <div className="engine-activity-row muted">
            <span className="engine-activity-time">now</span>
            <span>Starting source map</span>
          </div>
        )}
      </div>

      <p className="research-progress-note">Showing engine activity, not private reasoning. Clinical claims are held until citations support them.</p>
    </details>
  );
}
