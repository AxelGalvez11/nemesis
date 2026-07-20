"use client";

import { useState } from "react";

import { MessageResponse } from "@/components/ai-elements/message";
import { Codicon } from "@/components/desktop-ui/codicon";
import { SegmentedControl } from "@/components/desktop-ui/segmented-control";
import { cn } from "@/lib/utils";
import { formatLiveDuration } from "@/lib/workspace/live-audio-contract";

import { useLiveAudioSession } from "./use-live-audio";

interface RecordWorkspaceProps {
  accessToken?: string | null;
  active?: boolean;
  className?: string;
  context?: string;
  contextId?: string | null;
  keyterms?: string[];
  surface?: "sessions" | "notebook";
  uid?: string | null;
}

type InsightMode = "notes" | "explore";
const INSIGHT_MODES = [
  { id: "notes", label: "Notes" },
  { id: "explore", label: "Explore" },
] as const;
function statusCopy(status: ReturnType<typeof useLiveAudioSession>["status"]) {
  switch (status) {
    case "connecting": return "Connecting";
    case "listening": return "Listening";
    case "stopping": return "Finishing";
    case "quota": return "Monthly limit reached";
    case "error": return "Unavailable";
    default: return "Ready";
  }
}

function AudioMeter({ level, active }: { level: number; active: boolean }) {
  return (
    <div aria-hidden className="flex h-5 items-center gap-[2px]">
      {Array.from({ length: 12 }, (_, index) => {
        const emphasis = 0.35 + (1 - Math.abs(index - 5.5) / 6) * 0.65;
        const height = active ? Math.max(3, 4 + level * 16 * emphasis) : 3;
        return (
          <span
            className="w-[2px] rounded-full bg-current transition-[height,opacity] duration-100"
            key={index}
            style={{ height, opacity: active ? 0.45 + level * 0.5 : 0.28 }}
          />
        );
      })}
    </div>
  );
}

/** Full live transcription canvas shared by Sessions and active Notebook recordings. */
export function RecordWorkspace({
  accessToken = null,
  active = false,
  className,
  context,
  contextId,
  keyterms,
  surface = "sessions",
  uid = null,
}: RecordWorkspaceProps) {
  const live = useLiveAudioSession({ accessToken, active, context, contextId, keyterms, surface, uid });
  const [insightMode, setInsightMode] = useState<InsightMode>("notes");
  const activeListening = live.status === "listening";
  const used = live.usage?.usedSeconds ?? 0;
  const limit = live.usage?.limitSeconds ?? 0;

  return (
    <section
      aria-label="Live transcription workspace"
      className={cn(
        "grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)] divide-x divide-(--ui-stroke-tertiary) overflow-hidden rounded-[1.75rem] border border-(--ui-stroke-tertiary) bg-[color-mix(in_srgb,var(--ui-bg-elevated)_94%,transparent)] shadow-lg backdrop-blur-xl animate-in slide-in-from-bottom-8 fade-in-0 duration-500 ease-out motion-reduce:animate-none max-sm:grid-cols-1 max-sm:divide-x-0 max-sm:divide-y",
        className,
      )}
      data-slot="record-workspace"
    >
      <div className="flex min-h-0 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-(--ui-stroke-tertiary) px-5 py-3.5">
          <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-secondary)">Transcript</h2>
          <div className={cn("ml-auto flex items-center gap-2 text-(--ui-text-quaternary)", activeListening && "text-foreground")}>
            <span className="text-[0.6875rem]">{statusCopy(live.status)}</span>
            <AudioMeter active={activeListening} level={live.level} />
            <span className="min-w-10 text-right font-mono text-[0.6875rem] tabular-nums">{live.elapsedLabel}</span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-live="polite">
          {live.segments.length ? (
            <div className="space-y-3 text-[length:var(--conversation-text-font-size)] leading-relaxed text-foreground">
              {live.segments.map((segment) => (
                <p className={cn("transition-opacity", !segment.final && "text-(--ui-text-tertiary)")} key={segment.id}>
                  {segment.text}
                </p>
              ))}
            </div>
          ) : live.error ? (
            <div className="grid h-full min-h-40 place-items-center text-center">
              <div className="max-w-xs">
                <Codicon className="mx-auto mb-3 text-(--ui-text-quaternary)" name="warning" size="1.25rem" />
                <p className="text-sm leading-relaxed text-(--ui-text-secondary)">{live.error}</p>
                {live.status === "quota" && <a className="mt-3 inline-block text-xs text-[var(--theme-primary)] underline underline-offset-4" href="/pricing">View plans</a>}
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-40 place-items-center text-center">
              <div className="max-w-64">
                <Codicon className="mx-auto mb-3 text-(--ui-text-quaternary)" name="mic" size="1.25rem" />
                <p className="text-xs leading-relaxed text-(--ui-text-quaternary)">
                  {active ? "Start speaking. Committed transcript turns will collect here." : "Press record to begin live transcription."}
                </p>
              </div>
            </div>
          )}
        </div>

        {live.usage && (
          <footer className="shrink-0 border-t border-(--ui-stroke-tertiary) px-5 py-2.5 text-[0.6875rem] text-(--ui-text-quaternary)">
            Up to {formatLiveDuration(used)} of {formatLiveDuration(limit)} reserved this month · {live.usage.plan}
          </footer>
        )}
      </div>

      <div className="flex min-h-0 flex-col">
        <header className="flex min-h-[3.125rem] shrink-0 items-center border-b border-(--ui-stroke-tertiary) px-5 py-2.5">
          <SegmentedControl className="bg-(--ui-bg-quaternary)" onChange={setInsightMode} options={INSIGHT_MODES} value={insightMode} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {insightMode === "notes" ? (
            live.insights.notes.length ? (
              <MessageResponse className="text-sm leading-relaxed">{live.insights.notes.map((note) => `- ${note}`).join("\n")}</MessageResponse>
            ) : (
              <div className="grid h-full min-h-40 place-items-center text-center"><p className="max-w-64 text-xs leading-relaxed text-(--ui-text-quaternary)">Nemesis will build concise live notes once enough context has been spoken.</p></div>
            )
          ) : live.insights.suggestions.length || live.insights.explore.length ? (
            <div className="space-y-6">
              {live.insights.suggestions.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-secondary)">What to ask or say next</h3>
                  <div className="space-y-2">
                    {live.insights.suggestions.map((suggestion) => (
                      <div className="rounded-xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) px-3 py-2.5" key={suggestion}>
                        <MessageResponse className="text-xs leading-relaxed">{suggestion}</MessageResponse>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {live.insights.explore.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-secondary)">Explore</h3>
                  <MessageResponse className="text-xs leading-relaxed text-(--ui-text-secondary)">{live.insights.explore.map((item) => `- ${item}`).join("\n")}</MessageResponse>
                </section>
              )}
            </div>
          ) : (
            <div className="grid h-full min-h-40 place-items-center text-center">
              <p className="max-w-64 text-xs leading-relaxed text-(--ui-text-quaternary)">
                Suggestions and related directions will appear as the conversation develops.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
