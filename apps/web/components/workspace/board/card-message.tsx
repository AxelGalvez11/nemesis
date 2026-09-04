"use client";

// One turn inside a card: the learner's bubble on the right, the answer as markdown on the left,
// key terms as pills that open a definition (docs/wondering-canvas-reference.md §4).
//
// 🔴 THE LEARNER'S BUBBLE WEARS THE LEARNER'S COLOUR (`--ui-learner-bubble`), not the reference's
// black: the 2026-09-03 ruling that the bubble is one of the three accent homes stands here too.

import { PencilLine, Sparkles, TextQuote } from "lucide-react";
import { createContext, memo, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/desktop-ui/popover";
import { BOARD_MESSAGE_TOO_LONG_REPLY, BOARD_REPLY_ERROR_FALLBACK, type BoardMessage } from "@/lib/board/board-model";
import { cn } from "@/lib/utils";
import { normalizeMathDelimiters } from "@/lib/workspace/markdown-math";

import { IconTooltip, StreamingDots } from "./board-chrome";

/** Whether a term has already been branched from (its pill turns purple). Supplied by the card. */
export const DiveDeeperSourceMatcherContext = createContext<(text: string, element: HTMLElement) => boolean>(() => false);

function nodeText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(nodeText).join("");
  if (children && typeof children === "object" && "props" in children) {
    return nodeText((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

/** A key term: a pill with a one-line meaning behind it and a "Dive deeper" that opens a card. */
export function ConceptKeyword({
  explanation,
  onDiveDeeper,
  children,
}: {
  explanation: string;
  onDiveDeeper: (term: string, element: HTMLElement) => void;
  children: ReactNode;
}) {
  const isBranched = useContext(DiveDeeperSourceMatcherContext);
  const anchor = useRef<HTMLSpanElement | null>(null);
  const action = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [branched, setBranched] = useState(false);
  const term = nodeText(children).trim();
  useLayoutEffect(() => {
    const element = anchor.current;
    setBranched(element ? isBranched(term, element) : false);
  }, [isBranched, term]);
  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-label={`Key concept: ${term}`}
          className={cn(
            "nodrag nopan inline-flex max-w-full items-center gap-[4px] rounded-[6px] border px-[6px] align-baseline text-[0.92em] font-medium leading-snug text-foreground transition-colors",
            branched
              ? "border-(--board-branch-highlight) bg-(--board-branch-highlight)"
              : "border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) hover:border-(--ui-stroke-primary) hover:bg-(--ui-control-hover-background)",
          )}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <Sparkles className="size-[12px] shrink-0 text-foreground" />
          <span className="truncate" ref={anchor}>
            {children}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={`About ${term}`}
        className="board-menu-pop w-[288px] rounded-[12px] border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-[12px] shadow-xl [--popover-surface:var(--ui-bg-elevated)]"
        collisionPadding={8}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          action.current?.focus();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        side="top"
        sideOffset={8}
      >
        <p className="text-[14px] font-semibold leading-[20px] text-foreground">{term}</p>
        {explanation && <p className="mt-[4px] text-[14px] leading-[1.625] text-(--ui-text-secondary)">{explanation}</p>}
        <button
          className="mt-[10px] inline-flex items-center gap-[6px] rounded-[8px] bg-(--ui-action) px-[10px] py-[6px] text-[12px] font-semibold text-(--ui-action-glyph) transition-opacity hover:opacity-90"
          onClick={() => {
            const element = anchor.current;
            setOpen(false);
            if (element) onDiveDeeper(term, element);
          }}
          ref={action}
          type="button"
        >
          <Sparkles className="size-[14px]" />
          <span>Dive deeper</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

const REMARK = [remarkGfm, remarkMath];
const REHYPE = [rehypeKatex];

/** Card prose: 14px on the app's prose rules, fluid to the card's width. */
export function CardMarkdown({ text, components }: { text: string; components?: Components }) {
  const prepared = useMemo(() => normalizeMathDelimiters(text), [text]);
  return (
    <div className="aui-md prose w-full max-w-none overflow-hidden text-[14px] leading-[1.625] text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:my-[8px] prose-li:my-[2px] prose-ul:my-[6px] prose-ol:my-[6px] prose-headings:my-[10px] prose-pre:my-[8px] prose-table:my-[8px] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown components={components} rehypePlugins={REHYPE} remarkPlugins={REMARK}>
        {prepared}
      </ReactMarkdown>
    </div>
  );
}

export const CardMessage = memo(function CardMessage({
  message,
  onDiveDeeper,
  errorNotice,
  hideContextExcerpt,
  onRetry,
}: {
  message: BoardMessage;
  onDiveDeeper: (term: string, element: HTMLElement) => void;
  errorNotice?: string;
  hideContextExcerpt?: boolean;
  /** Present on the errored reply of a turn the learner may edit and resend. */
  onRetry?: () => void;
}) {
  const [showExcerpt, setShowExcerpt] = useState(false);
  const components = useMemo<Components>(
    () => ({
      a: ({ href, title, children, ...rest }) =>
        href?.startsWith("#concept") ? (
          <ConceptKeyword explanation={title ?? ""} onDiveDeeper={onDiveDeeper}>
            {children}
          </ConceptKeyword>
        ) : (
          <a href={href} rel="noopener noreferrer" target="_blank" title={title} {...rest}>
            {children}
          </a>
        ),
      img: ({ src, alt }) =>
        typeof src === "string" ? (
          <span className="relative my-[16px] block overflow-hidden rounded-[12px] border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary)">
            {/* eslint-disable-next-line @next/next/no-img-element -- an address the model wrote, not a static asset. */}
            <img alt={alt ?? ""} className="m-0 max-h-[360px] w-full object-contain" decoding="async" src={src} />
          </span>
        ) : null,
    }),
    [onDiveDeeper],
  );

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
          <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.625] text-(--ui-learner-bubble-glyph)" dir="auto">
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
    <div className="text-[14px] text-foreground" dir="auto">
      {body ? <CardMarkdown components={components} text={body} /> : message.isStreaming ? <StreamingDots /> : null}
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
