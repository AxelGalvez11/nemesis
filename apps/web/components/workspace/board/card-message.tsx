"use client";

// One turn inside a card: the learner's bubble on the right, the answer as markdown on the left,
// key terms as pills that open a definition (docs/wondering-canvas-reference.md §4).
//
// 🔴 THE LEARNER'S BUBBLE WEARS THE LEARNER'S COLOUR (`--ui-learner-bubble`), not the reference's
// black: the 2026-09-03 ruling that the bubble is one of the three accent homes stands here too.

import { PencilLine, TextQuote } from "lucide-react";
import { memo, useMemo, useState } from "react";

import { BOARD_MESSAGE_TOO_LONG_REPLY, BOARD_REPLY_ERROR_FALLBACK, type BoardCitation, type BoardMessage } from "@/lib/board/board-model";
import { cn } from "@/lib/utils";
import { AssistantMarkdown } from "@/lib/workspace/chat-markdown";
import type { FileCitation } from "@/lib/workspace/chat-citations";

import { IconTooltip, StreamingDots } from "./board-chrome";

/**
 * Card prose: THE CHAT'S OWN RENDERER, so a board answer and a chat answer are one typography.
 *
 * 🔴 OWNER 2026-09-03: "there is a discrepancy between canvas and chat font styles". The card used
 * to draw the reference's 14px on its own react-markdown; the chat draws 16px on a 26px line with
 * block gaps measured against ChatGPT (app/styles/desktop-chrome.css). Same component now, so the
 * key-term pills, the file citation pills and the web citation pills all come along for free.
 */
export function CardMarkdown({
  text,
  files,
  onOpenFile,
  citations,
}: {
  text: string;
  files?: ReadonlyArray<FileCitation>;
  onOpenFile?: (file: FileCitation) => void;
  citations?: readonly BoardCitation[];
}) {
  const sources = useMemo(() => citations?.map((citation) => ({ title: citation.title, url: citation.url })), [citations]);
  return (
    <div className="w-full overflow-hidden">
      <AssistantMarkdown files={files} namedCitations onOpenFile={onOpenFile} singleDollarMath sources={sources} text={text} />
    </div>
  );
}

export const CardMessage = memo(function CardMessage({
  message,
  errorNotice,
  hideContextExcerpt,
  onRetry,
  files,
  onOpenFile,
}: {
  message: BoardMessage;
  errorNotice?: string;
  /** The board's sources, so a `[s1:e4]` marker becomes a pill that names its document. */
  files?: ReadonlyArray<FileCitation>;
  onOpenFile?: (file: FileCitation) => void;
  hideContextExcerpt?: boolean;
  /** Present on the errored reply of a turn the learner may edit and resend. */
  onRetry?: () => void;
}) {
  const [showExcerpt, setShowExcerpt] = useState(false);

  if (message.role === "user") {
    const hasExcerpt = Boolean(message.contextExcerpt) && !hideContextExcerpt;
    const label = showExcerpt ? "Hide referenced text" : "Show referenced text";
    return (
      <div className="flex items-start justify-end gap-[4px]">
        {hasExcerpt && (
          <IconTooltip label={label}>
            <button
              aria-expanded={showExcerpt}
              aria-label={label}
              className="nodrag nopan mt-[6px] shrink-0 rounded-[6px] p-[4px] text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
              onClick={() => setShowExcerpt((was) => !was)}
              type="button"
            >
              <TextQuote className="size-[14px]" />
            </button>
          </IconTooltip>
        )}
        <div className="max-w-[85%] rounded-[16px] bg-(--ui-learner-bubble) px-[14px] py-[10px]">
          {hasExcerpt && showExcerpt && (
            <p className="mb-[6px] border-l-2 border-(--ui-learner-bubble-glyph) pl-[8px] text-[12px] italic leading-[1.625] text-(--ui-learner-bubble-glyph) opacity-70" dir="auto">
              {message.contextExcerpt}
            </p>
          )}
          <p className="whitespace-pre-wrap break-words text-[16px] leading-[1.5] text-(--ui-learner-bubble-glyph)" dir="auto">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  const canned = Boolean(message.isError) && (message.content === BOARD_REPLY_ERROR_FALLBACK || message.content === BOARD_MESSAGE_TOO_LONG_REPLY);
  const body = canned ? "" : message.content;
  const notice = errorNotice || (canned ? message.content : "This reply hit an error. Edit your message and try again.");
  return (
    <div className="text-[16px] text-foreground" dir="auto">
      {body ? <CardMarkdown citations={message.citations} files={files} onOpenFile={onOpenFile} text={body} /> : message.isStreaming ? <StreamingDots /> : null}
      {message.citations && message.citations.length > 0 && (
        <div className="mt-[12px] space-y-[4px]">
          <p className="text-[12px] font-medium text-(--ui-text-secondary)">Sources:</p>
          {message.citations.map((citation, index) => (
            <div key={`${citation.url}-${index}`}>
              <a className="text-[12px] text-(--ui-text-secondary) underline-offset-2 hover:underline" href={citation.url} rel="noopener noreferrer" target="_blank">
                [{index + 1}] {citation.title}
              </a>
            </div>
          ))}
        </div>
      )}
      {message.isError && (
        <>
          <p className={cn("text-[12px] text-(--board-error-text)", body && "mt-[8px]")}>{notice}</p>
          {onRetry && (
            <button
              className="nodrag nopan mt-[8px] inline-flex w-fit items-center gap-[6px] rounded-[6px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-[10px] py-[6px] text-[12px] font-medium text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
              onClick={onRetry}
              type="button"
            >
              <PencilLine className="size-[14px]" />
              Edit and retry
            </button>
          )}
        </>
      )}
    </div>
  );
});
