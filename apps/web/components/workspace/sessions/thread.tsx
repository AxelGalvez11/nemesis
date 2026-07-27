"use client";

// Thread — message list + scroll container, desktop src/components/assistant-ui/thread/{index,list}.tsx
// (shell spec §B2). v1: plain scrollTop auto-follow instead of the
// use-stick-to-bottom package (not an approved dependency for this build).

import { useCallback, useEffect, useRef, useState } from "react";

import { ArrowDown } from "@/lib/workspace/icons";
import type { SessionMessage } from "@/lib/workspace/sessions-store";
import { cn } from "@/lib/utils";

import { AssistantMessage, type TurnError } from "./assistant-message";
import { Intro } from "./intro";
import { UserMessage } from "./user-message";

export interface ThreadTurn {
  user: SessionMessage;
  assistant: SessionMessage | null;
}

interface ThreadProps {
  turns: ThreadTurn[];
  busy: boolean;
  liveSeconds: number | null;
  error: TurnError | null;
  centeredComposer?: boolean;
  onEditMessage: (at: string, content: string) => void;
  onOpenSources?: () => void;
}

/** How far from the end the transcript has to be, in pixels, before the
 *  jump-to-bottom button appears. Roughly a line of prose plus the composer fade:
 *  far enough that a small overscroll never flashes it, near enough that it shows
 *  as soon as there is genuinely unread answer below. */
const JUMP_TO_BOTTOM_AT = 160;

function turnDurationSeconds(turn: ThreadTurn): number | null {
  if (!turn.assistant) return null;
  return Math.round((Date.parse(turn.assistant.at) - Date.parse(turn.user.at)) / 1000);
}

export function Thread({ turns, busy, liveSeconds, error, centeredComposer = false, onEditMessage, onOpenSources }: ThreadProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const initialAssistantMessages = useRef(new Set(turns.flatMap((turn) => turn.assistant ? [turn.assistant.at] : [])));
  const isEmpty = turns.length === 0;
  const lastTurn = turns[turns.length - 1];
  const assistantScrollKey = `${turns.length}:${lastTurn?.assistant?.content.length ?? 0}`;

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const lastPair = el.querySelector<HTMLElement>("[data-turn-pair]:last-child");
    if (lastPair) el.scrollTo({ top: Math.max(0, lastPair.offsetTop - 8), behavior: "smooth" });
  }, [turns.length]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !lastTurn?.assistant) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [assistantScrollKey, lastTurn?.assistant]);

  // Jump to the newest message (owner 2026-07-24). Absent, not disabled, while
  // the transcript is already at the end — a control that cannot do anything
  // should not be on screen. The threshold keeps it from blinking on the tail of
  // a momentum scroll or a rubber-band.
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const onViewportScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setAwayFromBottom(el.scrollHeight - (el.scrollTop + el.clientHeight) > JUMP_TO_BOTTOM_AT);
  }, []);

  // Re-check whenever the content grows: a streaming answer lengthens the page
  // under a reader who has scrolled up, and a scroll event never fires for that.
  useEffect(() => {
    onViewportScroll();
  }, [assistantScrollKey, turns.length, onViewportScroll]);

  const jumpToBottom = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTo({ behavior: "smooth", top: el.scrollHeight });
    setAwayFromBottom(false);
  }, []);

  return (
    <div className="relative grid h-full min-h-0 max-w-full grid-rows-[minmax(0,1fr)] overflow-hidden bg-transparent contain-[layout_paint]">
      <div className="relative min-h-0 max-w-full overflow-hidden contain-[layout_paint]" style={{ height: "100%" }}>
        <div
          className="size-full overflow-x-hidden overflow-y-auto overscroll-contain"
          data-slot="aui_thread-viewport"
          onScroll={onViewportScroll}
          ref={viewportRef}
        >
          {isEmpty ? (
            <div
              className="mx-auto grid h-full w-full max-w-(--composer-width) grid-rows-[minmax(0,1fr)_auto] min-w-0 gap-(--conversation-turn-gap) px-6 py-8"
              data-slot="aui_thread-content"
            >
              <div className={cn("flex min-h-0 w-full flex-col items-center transition-[padding] duration-300", centeredComposer ? "justify-center pb-40" : "justify-center pt-[var(--composer-measured-height)]")}>
                <Intro />
              </div>
            </div>
          ) : (
            <div
              className="mx-auto flex w-full max-w-(--composer-width) min-w-0 flex-col px-6 pb-[calc(var(--composer-measured-height)+2rem)] pt-4"
              data-slot="aui_thread-content"
            >
              {turns.map((turn, index) => {
                const isLast = index === turns.length - 1;

                return (
                  <div className="flex min-w-0 flex-col gap-(--conversation-turn-gap) pb-(--conversation-turn-gap)" data-turn-pair key={turn.user.at}>
                    <div
                      className="composer-human-ai-pair-container relative flex min-w-0 flex-col gap-(--conversation-turn-gap)"
                      data-slot="aui_turn-pair"
                    >
                      <UserMessage message={turn.user} onEdit={onEditMessage} />
                      <AssistantMessage
                        durationSeconds={turnDurationSeconds(turn)}
                        error={isLast ? error : null}
                        liveSeconds={isLast && busy ? liveSeconds : null}
                        message={turn.assistant}
                        animateReveal={isLast && Boolean(turn.assistant) && !initialAssistantMessages.current.has(turn.assistant?.at ?? "")}
                        onOpenSources={turn.assistant?.sources?.length ? onOpenSources : undefined}
                        pending={isLast && busy}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* Sits just above the composer, whose height the shell already publishes
            as --composer-measured-height — so the button follows a growing draft
            instead of guessing at a fixed offset. Not rendered at all when the
            transcript is at the end or empty. */}
        {!isEmpty && awayFromBottom ? (
          <button
            aria-label="Jump to the newest message"
            className="absolute left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-card p-2 text-muted-foreground shadow-md transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            data-slot="aui_thread-jump-to-bottom"
            onClick={jumpToBottom}
            style={{ bottom: "calc(var(--composer-measured-height) + 1rem)" }}
            type="button"
          >
            <ArrowDown aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
