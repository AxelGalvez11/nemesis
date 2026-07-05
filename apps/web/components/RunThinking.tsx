"use client";

import type { ResearchProgressStep } from "@pharmabro/shared";
import { buildThinkingPreview, THINKING_STEPS } from "@/lib/thinking-preview";
import { SEARCH_DOMAINS } from "@/lib/favicon";
import { DomainChips } from "./DomainChips";
import { Icon } from "./icons";

export interface RunThinkingProps {
  /** Live progress for the currently-active research run. */
  progress: ResearchProgressStep[];
  /** The run's question, used to focus the thinking-preview lines. Falls back to a generic focus. */
  question?: string;
  /** Denser spacing (used inside the pinned dock). Right dock stays roomy. */
  compact?: boolean;
  /** Real cited/searched hostnames, shown under the Search step once available. Defaults to the
   *  honest search surface (the databases we actually query) while the run is still gathering. */
  domains?: string[];
}

// Map the engine's live pipeline phase to a ChatGPT thinking stage (0..3): the four THINKING_STEPS
// are Understand / Search / Rank / Answer. NOTE the deliberate non-chronological mapping — the real
// pipeline emits `writing` (synthesis) before `checking` (fact-check), but the owner's presentation
// puts Rank (checking→2) before Answer (writing→3). This is a presentational choice, not a bug.
const STAGE_BY_PHASE: Record<ResearchProgressStep["step"], number> = {
  planning: 0, // Understand
  gathering: 1, // Search
  checking: 2, // Rank
  writing: 3, // Answer
  done: 3, // finished → hold on the final step
  error: 3, // safe default so a failed/unknown last step never crashes
};

/** Derive the ChatGPT thinking stage (0..3) from a run's live progress (the latest phase). Shared by
 *  the pinned dock's collapsed bar + the work panel's current line so they never desync from the trail. */
export function stageFromProgress(progress: ResearchProgressStep[]): number {
  const last = progress[progress.length - 1];
  if (!last) return 0;
  const stage = STAGE_BY_PHASE[last.step];
  return typeof stage === "number" ? stage : 0;
}

/** The ChatGPT "Thinking" trail, reused for a live research run. Renders the four fixed thinking
 *  steps (Understand / Search / Rank / Answer) down the same quiet timeline rail as the answer's
 *  Thinking trail: steps before the derived stage are done (check), the stage step is active (with
 *  its `current` line + `detail`), later steps are pending. The searched-domain chips sit under the
 *  Search step. Presentational only — reads the same `progress` array; starts no polling. */
export function RunThinking({ progress, question, compact, domains }: RunThinkingProps) {
  const stage = stageFromProgress(progress);
  const preview = buildThinkingPreview(question ?? "", stage);
  const chips = domains?.length ? domains : SEARCH_DOMAINS;

  return (
    <div className={`run-thinking${compact ? " run-thinking-compact" : ""}`}>
      <div className="activity-trail run-thinking-trail">
        {THINKING_STEPS.map((step, i) => {
          const state = i < stage ? "done" : i === stage ? "active" : "pending";
          // The active step gets the live-focused `current` line from the preview; done/pending
          // rows keep the fixed step copy so the trail reads consistently at any stage.
          const title = state === "active" ? preview.current : step.current;
          return (
            <div className={`activity-step run-step ${state}`} key={step.label}>
              <span className="run-step-marker" aria-hidden="true">
                {state === "done" ? <Icon name="check" size={12} /> : null}
                {state === "active" ? <span className="run-step-dot" /> : null}
              </span>
              <div className="run-step-body">
                <div className="activity-step-title">{title}</div>
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
