"use client";

// Review history — collapsed by default (library-study spec §3.4). Expanding
// reveals the all-empty 12-month heatmap. De-carded per the spec's "minimal
// look" diff (no rounded/bordered/bg-card wrapper).

import { useState } from "react";

import { ChevronDown } from "@/lib/workspace/icons";
import { cn } from "@/lib/utils";

import { StudyHeatmap } from "./heatmap";

export function ReviewHistory() {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="px-8 pb-2 pt-8">
      <div>
        <button
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          <div>
            <h2 className="text-sm font-semibold">Review history</h2>
            <p className="mt-1 flex flex-wrap gap-x-2 text-[0.6875rem] tabular-nums text-muted-foreground">
              0 day streak · —% 30-day retention · 0 reviews this week
            </p>
          </div>
          <ChevronDown className={cn(!expanded && "-rotate-90")} size={15} />
        </button>
        {expanded && (
          <div className="border-t border-(--ui-stroke-tertiary) px-4 pb-4 pt-3">
            <p className="mb-3 text-[0.6875rem] tabular-nums text-muted-foreground">
              0 day longest streak · 0% days active · 0 reviews · past 12 months
            </p>
            <StudyHeatmap />
          </div>
        )}
      </div>
    </section>
  );
}
