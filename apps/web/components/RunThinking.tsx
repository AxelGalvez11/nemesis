"use client";

import type { ResearchProgressStep } from "@nemesis/shared";
import { DomainChips } from "./DomainChips";
import { Icon } from "./icons";

export interface RunStep {
  label: string;
  current: string;
  detail: string;
}

// The run-view thinking trail, ordered to match the engine's REAL pipeline so a live run only ever
// moves forward: plan → gather → write → check. The last step is "Verify" (checking each claim against
// its source) — the engine fact-checks AFTER writing, and surfacing that verify beat reinforces the
// cited-evidence trust story better than a synthetic "rank" step would.
export const RESEARCH_STEPS: RunStep[] = [
  { label: "Understand", current: "Understanding what you are asking", detail: "Identify the topic, intent, and safety context." },
  { label: "Search", current: "Browsing trusted medical sources", detail: "Pull official labels, papers, trials, and health context." },
  { label: "Answer", current: "Writing the cited answer", detail: "Draft the answer, attaching citations only where sources support the text." },
  { label: "Verify", current: "Checking each claim against its source", detail: "Confirm every claim is supported before finishing." },
];

// Map the engine's live pipeline phase to a trail stage (0..3). Chronological on purpose — the engine
// emits planning → gathering → writing → checking, so the trail advances monotonically and never steps
// backward on a real run.
const STAGE_BY_PHASE: Record<ResearchProgressStep["step"], number> = {
  planning: 0, // Understand
  gathering: 1, // Search
  writing: 2, // Answer
  checking: 3, // Verify
  done: 3, // finished → hold on the final step
  error: 3, // safe default so a failed/unknown last step never crashes
};

/** Derive the trail stage (0..3) from a run's live progress (the latest phase). Shared by the pinned
 *  dock's collapsed bar + the work panel's current line so they never desync from the trail. */
export function stageFromProgress(progress: ResearchProgressStep[]): number {
  const last = progress[progress.length - 1];
  if (!last) return 0;
  const stage = STAGE_BY_PHASE[last.step];
  return typeof stage === "number" ? stage : 0;
}

/** The current-step line for a stage — used by the dock bar + the work-panel header so their label
 *  always matches the active row in the trail. */
export function runStepCurrent(stage: number): string {
  return (RESEARCH_STEPS[stage] ?? RESEARCH_STEPS[0]!).current;
}

export interface RunThinkingProps {
  /** Live progress for the currently-active research run. */
  progress: ResearchProgressStep[];
  /** Reserved for a future question-focused current line; not read today. */
  question?: string;
  /** Denser spacing (used inside the pinned dock). Right dock stays roomy. */
  compact?: boolean;
  /** Real cited/searched hostnames, shown under the Search step once available. Defaults to the
   *  sites this run actually reached; empty until it has reached one. */
  domains?: string[];
}

/** The ChatGPT-style "Thinking" trail, reused for a live research run. Renders the four ordered steps
 *  (Understand / Search / Answer / Verify) down the same quiet timeline rail as the answer's Thinking
 *  trail: steps before the derived stage are done (check), the stage step is active, later steps are
 *  pending. The searched-domain chips sit under the Search step. Presentational only — reads the same
 *  `progress` array; starts no polling. */
export function RunThinking({ progress, compact, domains }: RunThinkingProps) {
  const stage = stageFromProgress(progress);
  // 🔴 NO FALLBACK LIST. This read `domains?.length ? domains : SEARCH_DOMAINS`, drawing four
  // hardcoded medical domains as if they had been searched whenever the real list was empty. The
  // honest answer before anything is searched is "none", and DomainChips draws none as nothing.
  const chips = domains ?? [];

  return (
    <div className={`run-thinking${compact ? " run-thinking-compact" : ""}`}>
      <div className="activity-trail run-thinking-trail">
        {RESEARCH_STEPS.map((step, i) => {
          const state = i < stage ? "done" : i === stage ? "active" : "pending";
          return (
            <div className={`activity-step run-step ${state}`} key={step.label}>
              <span className="run-step-marker" aria-hidden="true">
                {state === "done" ? <Icon name="check" size={12} /> : null}
                {state === "active" ? <span className="run-step-dot" /> : null}
              </span>
              <div className="run-step-body">
                <div className="activity-step-title">{step.current}</div>
                {state !== "pending" ? <div className="activity-step-detail">{step.detail}</div> : null}
                {i === 1 && state !== "pending" ? <DomainChips domains={chips} /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
