"use client";

import { useEffect, useState } from "react";
import type { ResearchProgressStep } from "@pharmabro/shared";
import { RunThinking, stageFromProgress, runStepCurrent, RESEARCH_STEPS } from "./RunThinking";
import { Icon } from "./icons";

export interface AgentRunDockProps {
  /** Live progress for the currently-active research run, or null when no run is active. */
  progress: ResearchProgressStep[] | null;
  /** The run's question, threaded to the thinking preview for a focused current line. */
  question?: string;
}

/** Format a live duration as `m:ss` — minutes un-padded, seconds zero-padded. */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Manus-style pinned "Task progress" dock: a collapsible bar docked directly above the composer while
 *  a research run is live. Collapsed = a small state icon + the current thinking-stage line + live
 *  elapsed + an "N / 4" stage counter + a chevron; clicking expands to the ChatGPT thinking trail
 *  (Understand / Search / Answer / Verify + searched-source chips) via RunThinking. Renders nothing when
 *  no run is active. Presentational only — it reads the same `progress` array that already drives
 *  ResearchProgress; it starts no polling. */
export function AgentRunDock({ progress, question }: AgentRunDockProps) {
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

  // Derive the thinking stage (0..3) from the latest progress phase, then source the collapsed bar's
  // current line from the SAME shared helper RunThinking uses, so the bar can never desync from the trail.
  const last = progress[progress.length - 1];
  const stage = stageFromProgress(progress);
  const currentLine = runStepCurrent(stage);
  // "N / 4" over the four ordered thinking steps: steps strictly before the active stage are done.
  const total = RESEARCH_STEPS.length;
  const doneCount = Math.min(stage, total);

  // Live elapsed for the active step: computed from the last progress entry's timestamp.
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
        <span className="ard-current">{currentLine}</span>
        <span className="ard-elapsed">{activeElapsed}</span>
        <span className="ard-count">{doneCount} / {total}</span>
        <span className={`ard-chevron${expanded ? " open" : ""}`} aria-hidden="true">
          <Icon name="chevron-down" size={14} />
        </span>
      </button>
      {expanded ? (
        <div className="ard-body">
          <div className="ard-caption">Task progress</div>
          <RunThinking progress={progress} question={question} compact />
        </div>
      ) : null}
    </div>
  );
}
