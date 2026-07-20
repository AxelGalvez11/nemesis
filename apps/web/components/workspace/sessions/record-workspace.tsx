"use client";

import { cn } from "@/lib/utils";

interface RecordWorkspaceProps {
  className?: string;
}

/** Full recording canvas shared by Sessions and active Notebook recordings. */
export function RecordWorkspace({ className }: RecordWorkspaceProps) {
  return (
    <section
      aria-label="Recording workspace"
      className={cn(
        "grid min-h-0 grid-cols-2 divide-x divide-(--ui-stroke-tertiary) overflow-hidden rounded-[1.75rem] border border-(--ui-stroke-tertiary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_94%,transparent)] shadow-lg backdrop-blur-xl animate-in slide-in-from-bottom-3 fade-in-0 duration-300 motion-reduce:animate-none max-sm:grid-cols-1 max-sm:divide-x-0 max-sm:divide-y",
        className,
      )}
      data-slot="record-workspace"
    >
      <div className="flex min-h-0 flex-col p-5">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-secondary)">Transcript</h2>
        <div className="grid min-h-0 flex-1 place-items-center text-center">
          <p className="max-w-64 text-xs leading-relaxed text-(--ui-text-quaternary)">Live transcription will appear here while you record.</p>
        </div>
      </div>
      <div className="flex min-h-0 flex-col p-5">
        <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-secondary)">Suggestion</h2>
        <div className="grid min-h-0 flex-1 place-items-center text-center">
          <p className="max-w-64 text-xs leading-relaxed text-(--ui-text-quaternary)">Prompts such as what to say next or what to explore will appear here.</p>
        </div>
      </div>
    </section>
  );
}
