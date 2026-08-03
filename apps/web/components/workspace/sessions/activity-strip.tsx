// ActivityStrip — desktop's ChatGPT-style "thinking preview" (shell spec §B5,
// student build), simplified for the non-streaming v1 wire recipe: no
// per-token phrase derivation and no intent line (there is no reasoning
// stream to extract one from) — just a live "Thinking" shimmer + timer while
// a turn is in flight, and a settled "Thought for Xs" caption once it lands
// (shown only past 2s, non-expandable — no reasoning trail is kept in v1).

/** "21s" under a minute, "1m 2s" at or above — matches desktop's formatDuration. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

interface ActivityStripProps {
  placement: "live" | "header";
  seconds: number | null;
}

export function ActivityStrip({ placement, seconds }: ActivityStripProps) {
  if (placement === "live") {
    return (
      <div
        aria-live="polite"
        className="mt-1.5 mb-1 flex min-w-0 max-w-full flex-col gap-1"
        data-slot="aui_activity-phrase"
        role="status"
      >
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <span className="nemesis-activity-phrase flex min-w-0 text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)">
            <span className="shimmer min-w-0 truncate">Thinking</span>
          </span>
          {/* No running count while it thinks (owner 2026-08-01). A number
              ticking up invites the student to watch it, and turns a wait into
              a stopwatch. The elapsed time still appears once — as "Thought
              for Xs" below — where it reads as a fact, not a countdown. */}
        </div>
      </div>
    );
  }

  if (seconds === null || seconds < 2) return null;

  return (
    <p className="mb-1 flex items-center gap-1 text-[length:var(--conversation-tool-font-size)] text-(--ui-text-tertiary)">
      {`Thought for ${formatDuration(seconds)}`}
    </p>
  );
}
