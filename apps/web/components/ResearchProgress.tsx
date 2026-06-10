"use client";

import type { ResearchProgressStep } from "@pharmabro/shared";
import { Icon } from "./icons";
import { Orb } from "./Orb";

// The engine's phases, in order. `done` is terminal and handled separately.
const PHASES: Array<{ key: ResearchProgressStep["step"]; label: string }> = [
  { key: "planning", label: "Planning the research" },
  { key: "gathering", label: "Gathering evidence" },
  { key: "writing", label: "Writing the cited report" },
  { key: "checking", label: "Fact-checking each claim" },
];
const ORDER = PHASES.map((p) => p.key);

/** Live "thinking" panel for an in-flight deep-research run. Reads the streamed progress steps and
 *  lights up the phase checklist; holds the active phase on a spinner until the run completes. */
export function ResearchProgress({ steps, done }: { steps: ResearchProgressStep[]; done: boolean }) {
  const last = steps[steps.length - 1];
  const reachedIdx = last ? Math.max(ORDER.indexOf(last.step), 0) : 0;
  const sources = [...steps].reverse().find((s) => typeof s.sources_found === "number")?.sources_found;
  const detail = last?.detail ?? "Starting…";

  return (
    <div className="thinking research-progress">
      <div className="think-row">
        <Orb size={26} busy={!done} />
        <span className="shimmer">{done ? "Finishing…" : `${detail}…`}</span>
        {typeof sources === "number" && sources > 0 ? (
          <span className="src-count">{sources} source{sources === 1 ? "" : "s"}</span>
        ) : null}
      </div>
      <div className="qsearch">
        {PHASES.map((phase, i) => {
          // done if a later phase started (or the run finished); active = current phase; else pending.
          const state = done || i < reachedIdx ? "done" : i === reachedIdx ? "active" : "";
          return (
            <div key={phase.key} className={`qchip ${state}`.trimEnd()}>
              <span className="tick"><Icon name="check" size={10} /></span>
              {phase.label}
            </div>
          );
        })}
      </div>
      <p className="research-progress-note">Deep research runs several searches and fact-checks every claim — this takes a little longer than a chat answer.</p>
    </div>
  );
}
