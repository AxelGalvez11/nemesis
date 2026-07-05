"use client";

import { useEffect, useState } from "react";
import type { ResearchProgressStep } from "@pharmabro/shared";
import { AgentRunTracker, stepsFromProgress } from "./AgentRunTracker";
import { Icon } from "./icons";

export interface AgentRunDockProps {
  /** Live progress for the currently-active research run, or null when no run is active. */
  progress: ResearchProgressStep[] | null;
}

/** Format a live duration as `m:ss` — minutes un-padded, seconds zero-padded. Mirrors
 *  AgentRunTracker's private formatter; kept local because that one isn't exported. */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Manus-style pinned "Task progress" dock: a collapsible bar docked directly above the composer while
 *  a research run is live. Collapsed = a small state icon + the current step label + live elapsed + an
 *  "N / M" counter + a chevron; clicking expands to the full ordered tracker (reusing AgentRunTracker)
 *  under a small "Task progress" caption. Renders nothing when no run is active. Presentational only —
 *  it reads the same `progress` array that already drives ResearchProgress; it starts no polling. */
export function AgentRunDock({ progress }: AgentRunDockProps) {
  const [expanded, setExpanded] = useState(false);
  // Tick once a second so the collapsed bar's elapsed advances between the 1.5s run polls.
  const [, forceTick] = useState(0);
  const running = Boolean(progress && progress.length);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!progress || progress.length === 0) return null;

  const steps = stepsFromProgress(progress);
  const total = steps.length;
  const doneCount = steps.filter((s) => s.state === "done").length;
  // The current step is the active row if there is one, else the last (a just-finished run about to unmount).
  const current = steps.find((s) => s.state === "active") ?? steps[steps.length - 1];

  // Live elapsed for the active step: stepsFromProgress leaves the last step's elapsedMs undefined by
  // design, so compute it from the last progress entry's timestamp against the wall clock.
  const last = progress[progress.length - 1];
  const activeElapsed = last ? formatElapsed(Date.now() - new Date(last.at).getTime()) : "0:00";

  return (
    <div className="agent-run-dock">
      <button
        type="button"
        className="ard-bar"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse task progress" : "Expand task progress"}
      >
        <span className="ard-thumb" aria-hidden="true"><Icon name="sparkle" size={13} /></span>
        <span className="ard-current">{current?.label ?? "Working…"}</span>
        <span className="ard-elapsed">{activeElapsed}</span>
        <span className="ard-count">{doneCount} / {total}</span>
        <span className={`ard-chevron${expanded ? " open" : ""}`} aria-hidden="true">
          <Icon name="chevron-down" size={14} />
        </span>
      </button>
      {expanded ? (
        <div className="ard-body">
          <div className="ard-caption">Task progress</div>
          <AgentRunTracker steps={steps} />
        </div>
      ) : null}
    </div>
  );
}
