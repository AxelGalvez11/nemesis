"use client";

// The board's own composer, floating at the bottom (docs/wondering-canvas-reference.md §7).
// Two shapes: the "full" one on an empty board (672 wide, a two-row card) and the "compact" one
// once cards exist (576 wide, one row). Above it, the new-thread chips the last root answer
// suggested.

import { ArrowUp, Earth, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { isMessageTooLong, messageLimitNotice } from "@/lib/board/board-model";
import { cn } from "@/lib/utils";

import { AutoResizingTextarea, IconTooltip } from "./board-chrome";
import { useBoard } from "./board-provider";

export function BoardComposer() {
  const { cards, sources, selectedSourceIds, toggleSourceSelection, sendRootMessage, newThreadSuggestions, useWebSearch, setUseWebSearch } = useBoard();
  const [text, setText] = useState("");
  const notice = messageLimitNotice(text);
  const tooLong = isMessageTooLong(text);
  const compact = cards.length > 0;
  const chosen = selectedSourceIds.flatMap((id) => {
    const source = sources.find((item) => item.id === id);
    return source ? [source] : [];
  });

  const submit = () => {
    if (!text.trim() || tooLong) return;
    if (sendRootMessage(text)) setText("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const search = (
    <button
      aria-label={`Web search ${useWebSearch ? "enabled. Turn off" : "disabled. Turn on"}`}
      aria-pressed={useWebSearch}
      className={
        compact
          ? cn("flex size-[36px] items-center justify-center rounded-[8px] transition-colors", useWebSearch ? "text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground" : "bg-(--ui-bg-secondary) text-foreground hover:bg-(--ui-control-hover-background)")
          : cn("inline-flex h-[28px] shrink-0 items-center gap-[4px] rounded-[6px] px-[8px] text-[12px] font-medium transition-colors", useWebSearch ? "bg-transparent text-(--ui-text-secondary) hover:text-foreground" : "bg-(--ui-bg-secondary) text-foreground hover:bg-(--ui-control-hover-background)")
      }
      onClick={() => setUseWebSearch(!useWebSearch)}
      type="button"
    >
      <Earth className={compact ? "size-[16px]" : "size-[14px]"} />
      {!compact && <span>Web search {useWebSearch ? "on" : "off"}</span>}
    </button>
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[24px] z-40 flex justify-center px-[16px]" data-board-composer="" data-composer-mode={compact ? "compact" : "full"}>
      <div className={cn("pointer-events-auto w-full", compact ? "max-w-[576px]" : "max-w-[672px]")}>
        {newThreadSuggestions.length > 0 && (
          <div aria-label="Suggested new topics" className="pointer-events-auto mb-[8px] flex flex-wrap justify-center gap-[6px]">
            {newThreadSuggestions.map((suggestion) => (
              <button
                className="max-w-full whitespace-normal break-words rounded-full border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)/85 px-[12px] py-[6px] text-center text-[12px] leading-[16px] text-(--ui-text-secondary) shadow-sm backdrop-blur-xl transition-colors hover:bg-(--ui-bg-secondary) hover:text-foreground"
                key={suggestion}
                onClick={() => sendRootMessage(suggestion)}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <div className={compact ? "relative min-h-[48px] overflow-hidden rounded-[12px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)/80 shadow-sm backdrop-blur-xl" : "w-full"} data-board-composer-surface="">
          <form
            className={cn("pointer-events-auto w-full overflow-hidden", compact ? "bg-transparent" : "rounded-[16px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)/75 backdrop-blur-xl")}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {chosen.length > 0 && (
              <div className="flex flex-wrap gap-[6px] border-b border-(--ui-stroke-secondary) px-[12px] py-[8px]">
                {chosen.map((source) => (
                  <span className="inline-flex max-w-[208px] items-center gap-[4px] rounded-[6px] bg-(--ui-bg-secondary) px-[8px] py-[4px] text-[12px] font-medium text-foreground" key={source.id}>
                    <span className="truncate">{source.name}</span>
                    <IconTooltip label={`Remove ${source.name} from question`}>
                      <button aria-label={`Remove ${source.name} from question`} className="shrink-0 rounded p-[2px] hover:bg-(--ui-control-hover-background)" onClick={() => toggleSourceSelection(source.id)} type="button">
                        <X className="size-[12px]" />
                      </button>
                    </IconTooltip>
                  </span>
                ))}
              </div>
            )}
            <div className={compact ? "flex items-center gap-[4px] p-[6px]" : "block"}>
              <div className="min-w-0 flex-1">
                <AutoResizingTextarea
                  aria-describedby={notice ? "board-composer-limit" : undefined}
                  aria-invalid={tooLong || undefined}
                  className={cn(
                    "w-full resize-none bg-transparent text-[16px] leading-[24px] text-foreground outline-none transition-none placeholder:text-(--ui-text-tertiary) focus:shadow-none focus:ring-0",
                    compact ? "min-h-[36px] min-w-0 px-[10px] py-[8px]" : "min-h-[56px] px-[16px] pb-[8px] pt-[12px]",
                  )}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={chosen.length > 0 ? "Ask about the selected source…" : compact ? "Start another thread…" : "What do you want to understand?"}
                  value={text}
                />
                {notice && (
                  <p className={cn("text-[12px] text-(--board-error-text)", compact ? "px-[10px] pb-[8px]" : "px-[16px] pb-[8px]")} id="board-composer-limit" role="alert">
                    {notice}
                  </p>
                )}
              </div>
              <div className={cn("flex shrink-0 items-center justify-between gap-[8px]", !compact && "px-[12px] pb-[12px]")}>
                <div className="flex items-center gap-[4px]">
                  {compact ? <IconTooltip label={`Web search ${useWebSearch ? "on" : "off"}`}>{search}</IconTooltip> : search}
                </div>
                <IconTooltip label="Send message">
                  <button
                    aria-label="Send message"
                    className={cn("flex shrink-0 items-center justify-center bg-(--ui-action) text-(--ui-action-glyph) transition-all enabled:hover:opacity-90 disabled:opacity-40", compact ? "size-[36px] rounded-[8px]" : "size-[40px] rounded-[12px]")}
                    disabled={!text.trim() || tooLong}
                    type="submit"
                  >
                    <ArrowUp className={compact ? "size-[16px]" : "size-[20px]"} />
                  </button>
                </IconTooltip>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
