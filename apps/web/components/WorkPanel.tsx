"use client";

import type { ResearchProgressStep } from "@nemesis/shared";
import { RunThinking, stageFromProgress, runStepCurrent } from "./RunThinking";

export interface WorkPanelProps {
  /** Live progress for the currently-active research run. Rendered while the run is in flight. */
  progress: ResearchProgressStep[];
  /** The run's question, threaded to the thinking preview for a focused current line. */
  question?: string;
}

/** The latest cumulative `sources_found` on the run, scanning from the end. The last progress step
 *  (writing/checking) may not carry a count, so we walk backwards to the most recent DEFINED value —
 *  never blanking the "N sources gathered" line mid-run. Returns null when no step has reported yet. */
function latestSourcesFound(progress: ResearchProgressStep[]): number | null {
  for (let i = progress.length - 1; i >= 0; i--) {
    const n = progress[i]?.sources_found;
    if (typeof n === "number") return n;
  }
  return null;
}

/** Manus's "computer" pane, reframed honestly for our evidence engine: the "watch the evidence
 *  assemble" panel. While a research run is LIVE it renders inside the right dock (the same `.evidence`
 *  aside EvidencePanel uses), showing the research ASSEMBLING — the current thinking-stage line and the
 *  ChatGPT thinking trail (Understand / Search / Answer / Verify + searched-source chips), plus a live
 *  "N sources gathered" line — NOT a fake compute terminal. Presentational only: it reads the same
 *  `progress` array that already drives ResearchProgress + the pinned AgentRunDock; it starts no polling. */
export function WorkPanel({ progress, question }: WorkPanelProps) {
  const stage = stageFromProgress(progress);
  const currentLine = runStepCurrent(stage);
  const sources = latestSourcesFound(progress);

  return (
    <>
      <div className="ev-head wp-head">
        <b>Nemesis is working</b>
        <div className="spacer" />
        <span className="wp-live"><span className="dot" />Live</span>
      </div>

      <div className="wp-current">{currentLine}</div>

      <div className="ev-body wp-body">
        <RunThinking progress={progress} question={question} />
      </div>

      <div className="ev-foot wp-foot">
        <span>{sources != null ? `${sources} source${sources === 1 ? "" : "s"} gathered` : "gathering sources…"}</span>
        <span className="wp-assembling">assembling evidence</span>
      </div>
    </>
  );
}
