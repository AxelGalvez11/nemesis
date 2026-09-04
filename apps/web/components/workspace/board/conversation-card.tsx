"use client";

// A chat card on the board: title above, answer inside, follow-up box below, a `+` on each side to
// branch from. Geometry and behaviour from docs/wondering-canvas-reference.md §4 and §5.

import { useReactFlow, useStore, type NodeProps } from "@xyflow/react";
import { ArrowUp, BookOpen, Bookmark, GitBranch, Highlighter, Image as ImageIcon, Maximize2, MessageCircle, Minimize2, Plus, Sparkles, StickyNote, Trash2, X } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { CARD_AUTO_MAX_HEIGHT, CARD_MIN_HEIGHT, CONTRACTED_CARD_MIN_HEIGHT } from "@/lib/board/board-layout";
import { BOARD_MESSAGE_TOO_LONG_REPLY, isMessageTooLong, messageLimitNotice, type BoardCard } from "@/lib/board/board-model";
import { deriveCardSummary, firstImage } from "@/lib/board/board-protocol";
import { cn } from "@/lib/utils";

import { AutoResizingTextarea, BRANCH_BUTTONS, IconTooltip, NodeHandles, NodeResizeControls, StreamingDots, measureBoardArea } from "./board-chrome";
import { useBoard, type RetryTarget } from "./board-provider";
import { CardMessage, DiveDeeperSourceMatcherContext } from "./card-message";
import { SelectionActions } from "./selection-actions";
import { SelectionMenu, SELECTION_ICONS } from "./selection-menu";
import {
  INLINE_BRANCH_HIGHLIGHT,
  INLINE_NOTE_HIGHLIGHT,
  findRangeRectAtPoint,
  findSelectedOccurrence,
  findTextRanges,
  supportsCssCustomHighlights,
  useInlineTextHighlights,
} from "./text-ranges";

export interface ConversationNodeData extends Record<string, unknown> {
  cardId: string;
  isPickedUp?: boolean;
}

const CONTENT_MASK = "linear-gradient(to bottom, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)";

function ConversationCardInner({ data, selected }: NodeProps & { data: ConversationNodeData }) {
  const {
    cards,
    lastAddedCardId,
    noteFocusRequest,
    sendCardMessage,
    createBranchCard,
    sendBranchQuestion,
    branchFromSelection,
    removeCardHighlight,
    removeCardImage,
    addCardNote,
    setCardCollapsed,
    deleteNode,
  } = useBoard();
  const card = cards.find((item) => item.id === data.cardId);
  const shell = useRef<HTMLDivElement | null>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState("");
  const [retry, setRetry] = useState<RetryTarget | null>(null);
  const limitNotice = messageLimitNotice(draft);
  const tooLong = isMessageTooLong(draft);
  /** The ceiling a streaming card may grow to before it starts to scroll: the composer's top. */
  const [autoMax, setAutoMax] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const [resizeHeight, setResizeHeight] = useState<number | null>(null);
  /** Height pinned the moment a second turn starts streaming, so the card stops growing. */
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);
  const [highlightMenu, setHighlightMenu] = useState<{ highlightId: string; top: number; bottom: number; left: number } | null>(null);
  const [openSuggestion, setOpenSuggestion] = useState<string | null>(null);
  const suggestionButtons = useRef(new Map<string, HTMLButtonElement>());
  const cancelButton = useRef<HTMLButtonElement | null>(null);
  const returnFocusTo = useRef<string | null>(null);
  const measuredHeightKnown = useStore((state) => state.nodeLookup.get(data.cardId)?.height !== undefined);
  const { getInternalNode, getZoom } = useReactFlow();

  const streaming = card?.status === "streaming";
  const messageCount = card?.messages.length ?? 0;
  const lastLength = card?.messages[card.messages.length - 1]?.content.length ?? 0;
  const last = card?.messages[card.messages.length - 1];
  const suggested = !streaming && last?.role === "assistant" && !last.isError ? last.suggestedQuestions : undefined;
  const suggestions = useMemo(
    () => Array.from(new Set([...(suggested?.followUps ?? []), ...(suggested?.branches ?? [])])).slice(0, 4),
    [suggested],
  );

  useEffect(() => {
    if (!retry || !card) return;
    const index = card.messages.findIndex((message) => message.id === retry.assistantMessageId);
    const user = card.messages[index - 1];
    const assistant = card.messages[index];
    if (index < 1 || !user || !assistant || user.id !== retry.userMessageId || user.role !== "user" || assistant.role !== "assistant" || !assistant.isError) setRetry(null);
  }, [card, retry]);

  const heightFixed = card?.height !== undefined || resizing || lockedHeight !== null;
  const previous = useRef({ status: card?.status, messageCount });
  useLayoutEffect(() => {
    const was = previous.current;
    previous.current = { status: card?.status, messageCount };
    if (card?.status !== "streaming" || was.status === "streaming" || was.messageCount === 0 || card.height !== undefined || resizing || lockedHeight !== null) return;
    const height = getInternalNode(data.cardId)?.measured?.height ?? shell.current?.offsetHeight ?? null;
    if (height) setLockedHeight(height);
  }, [card?.height, card?.status, data.cardId, lockedHeight, getInternalNode, resizing, messageCount]);

  const fitToComposer = useCallback(() => {
    const node = shell.current;
    const area = measureBoardArea();
    if (!node || !area) return;
    const room = area.composerTop - node.getBoundingClientRect().top;
    const zoom = getZoom() || 1;
    setAutoMax(Math.min(Math.max(room / zoom, CARD_MIN_HEIGHT), CARD_AUTO_MAX_HEIGHT));
  }, [getZoom]);

  useLayoutEffect(() => {
    if (!streaming || heightFixed) return;
    fitToComposer();
    const composer = document.querySelector("[data-board-composer]");
    const observer = composer && typeof ResizeObserver !== "undefined" ? new ResizeObserver(fitToComposer) : null;
    if (composer && observer) observer.observe(composer);
    window.addEventListener("resize", fitToComposer);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fitToComposer);
    };
  }, [fitToComposer, heightFixed, streaming]);

  useLayoutEffect(() => {
    if (!streaming && !heightFixed && autoMax === null) fitToComposer();
  }, [autoMax, fitToComposer, heightFixed, streaming]);

  // Follow the answer as it streams, and the suggestions as they land.
  useEffect(() => {
    const node = content.current;
    if (node && (streaming || suggestions.length > 0)) node.scrollTop = node.scrollHeight;
  }, [streaming, lastLength, messageCount, suggestions.length]);

  useLayoutEffect(() => {
    if (openSuggestion) {
      cancelButton.current?.focus();
      return;
    }
    const back = returnFocusTo.current;
    if (back) {
      returnFocusTo.current = null;
      suggestionButtons.current.get(back)?.focus();
    }
  }, [openSuggestion]);

  // A brand-new empty branch card takes the cursor.
  useEffect(() => {
    if (card?.id === lastAddedCardId && card.messages.length === 0) textarea.current?.focus();
  }, [card, lastAddedCardId]);

  // A note's excerpt was clicked: scroll the card to that sentence.
  useEffect(() => {
    if (!noteFocusRequest || noteFocusRequest.cardId !== data.cardId) return;
    const root = content.current;
    if (!root) return;
    const ranges = findTextRanges(root, noteFocusRequest.excerpt);
    const range = ranges[noteFocusRequest.occurrence ?? 0] ?? ranges[0];
    if (!range) return;
    const rect = range.getBoundingClientRect();
    const bounds = root.getBoundingClientRect();
    const scale = bounds.height / root.offsetHeight || 1;
    const target = root.scrollTop + (rect.top - bounds.top) / scale;
    root.scrollTo({ top: target - (root.clientHeight - rect.height / scale) / 2, behavior: "smooth" });
  }, [data.cardId, noteFocusRequest]);

  const noteTargets = useMemo(
    () => card?.notes.flatMap((note) => (note.contextExcerpt ? [{ id: note.id, text: note.contextExcerpt, occurrence: note.contextOccurrence }] : [])) ?? [],
    [card?.notes],
  );
  const noteTexts = useMemo(() => new Set(noteTargets.map((target) => target.text)), [noteTargets]);
  const savedTargets = useMemo(
    () => card?.highlights.filter((highlight) => highlight.kind !== "branch" && highlight.noteIds.length === 0).map((h) => ({ id: h.id, text: h.text, occurrence: h.occurrence })) ?? [],
    [card?.highlights],
  );
  const branchTargets = useMemo(
    () => card?.highlights.filter((highlight) => highlight.kind === "branch").map((h) => ({ id: h.id, text: h.text, occurrence: h.occurrence })) ?? [],
    [card?.highlights],
  );
  const removable = useMemo(() => new Set(savedTargets.map((target) => target.id)), [savedTargets]);
  const paints = supportsCssCustomHighlights();
  const savedRanges = useInlineTextHighlights(content, savedTargets);
  const branchRanges = useInlineTextHighlights(content, branchTargets, INLINE_BRANCH_HIGHLIGHT);
  useInlineTextHighlights(content, noteTargets, INLINE_NOTE_HIGHLIGHT);

  const isBranchedTerm = useCallback(
    (text: string, element: HTMLElement) => {
      const root = element.closest("[data-board-card-content]");
      if (!root) return false;
      const range = document.createRange();
      range.selectNodeContents(element);
      const occurrence = findSelectedOccurrence(root, text, range);
      if (occurrence === null) return false;
      const flat = text.replace(/\s+/g, "");
      return branchTargets.some((target) => target.text.replace(/\s+/g, "") === flat && (target.occurrence ?? 0) === occurrence);
    },
    [branchTargets],
  );

  const diveDeeper = useCallback(
    (term: string, element: HTMLElement) => {
      const root = content.current;
      if (!root) {
        branchFromSelection(data.cardId, term);
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(element);
      const occurrence = findSelectedOccurrence(root, term, range);
      branchFromSelection(data.cardId, term, occurrence ?? undefined);
    },
    [branchFromSelection, data.cardId],
  );

  if (!card) return null;

  const send = (text: string, withRetry = true): boolean => {
    const value = text.trim();
    if (!value || streaming || isMessageTooLong(value)) return false;
    const ok = withRetry && retry ? sendCardMessage(card.id, value, retry) : sendCardMessage(card.id, value);
    if (!ok) return false;
    setRetry(null);
    if (card.height === undefined && lockedHeight === null && card.messages.length > 0 && shell.current) setLockedHeight(shell.current.offsetHeight || null);
    return true;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || streaming) return;
    if (send(draft)) setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit(event);
    }
  };

  const onContentClick = (event: React.MouseEvent) => {
    if (window.getSelection()?.toString().trim() || (event.target as Element).closest("button, a")) return;
    for (const [id, range] of [...savedRanges.current, ...branchRanges.current]) {
      const rect = findRangeRectAtPoint(range, event.clientX, event.clientY);
      if (rect) {
        event.stopPropagation();
        setHighlightMenu(removable.has(id) ? { highlightId: id, top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 } : null);
        return;
      }
    }
    setHighlightMenu(null);
  };

  const blurOnDrag = (event: React.PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest("button, a, input, textarea, select, [contenteditable]")) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  const hasAnswer = card.messages.some((message) => message.content.trim() && !message.isError);
  const onlyCard = cards.length === 1 && !selected;

  const branchButtons = BRANCH_BUTTONS.map(({ side, positionClassName }) => (
    <div
      className={cn(
        "absolute z-10 transition-opacity",
        selected || onlyCard
          ? ""
          : "[@media(hover:hover)]:pointer-events-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/card:pointer-events-auto [@media(hover:hover)]:group-focus-within/card:opacity-100 [@media(hover:hover)]:group-hover/card:pointer-events-auto [@media(hover:hover)]:group-hover/card:opacity-100",
        onlyCard && side !== "right" && "md:hidden",
        positionClassName,
      )}
      key={side}
    >
      <IconTooltip label={`Create a card from the ${side} side`} side={side}>
        <button
          aria-label={`Create a card from the ${side} side`}
          className="group/branch flex size-[40px] items-center justify-center outline-none disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!hasAnswer}
          onClick={(event) => {
            event.stopPropagation();
            createBranchCard(card.id, side);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <span
            className={cn(
              "flex items-center justify-center rounded-full border border-(--ui-action)/60 bg-(--ui-action)/40 text-(--ui-action-glyph) shadow-sm transition-all duration-200 ease-out group-hover/branch:size-[36px] group-hover/branch:border-(--ui-action) group-hover/branch:bg-(--ui-action) group-hover/branch:shadow-md group-focus-visible/branch:size-[36px] group-focus-visible/branch:bg-(--ui-action) group-focus-visible/branch:ring-2 group-focus-visible/branch:ring-(--ui-action) group-focus-visible/branch:ring-offset-2",
              onlyCard && side === "right" ? "size-[32px] shadow-md" : "size-[20px]",
            )}
          >
            <Plus className={cn("shrink-0 transition-all duration-200 ease-out group-hover/branch:size-[16px] group-focus-visible/branch:size-[16px]", onlyCard && side === "right" ? "size-[16px]" : "size-[12px]")} />
          </span>
        </button>
      </IconTooltip>
    </div>
  ));

  const titleBar = (
    <div className="absolute bottom-full left-[4px] right-[4px] mb-[6px] flex items-center gap-[8px]">
      {card.kind === "lesson" && <BookOpen className="size-[16px] shrink-0 text-(--ui-action)" />}
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-[20px] text-foreground">{card.title}</span>
      <IconTooltip label={card.collapsed ? "Expand card" : "Collapse card"}>
        <button
          aria-label={card.collapsed ? "Expand card" : "Collapse card"}
          aria-pressed={card.collapsed === true}
          className="nodrag nopan hidden shrink-0 rounded-[6px] p-[4px] text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-secondary) md:block"
          onClick={(event) => {
            event.stopPropagation();
            setCardCollapsed(card.id, !card.collapsed);
          }}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          {card.collapsed ? <Maximize2 className="size-[16px]" /> : <Minimize2 className="size-[16px]" />}
        </button>
      </IconTooltip>
      <span className="flex size-[24px] shrink-0 items-center justify-center">
        <IconTooltip label="Delete card">
          <button
            aria-label="Delete card"
            className="nodrag nopan rounded-[6px] p-[4px] text-(--board-error) transition-colors hover:bg-(--board-error-bg)"
            onClick={(event) => {
              event.stopPropagation();
              deleteNode(card.id);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <Trash2 className="size-[16px]" />
          </button>
        </IconTooltip>
      </span>
      <IconTooltip label="Add note">
        <button
          aria-label="Add note"
          className="flex shrink-0 cursor-pointer items-center gap-[4px] rounded-[6px] p-[4px] text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-(--ui-text-secondary)"
          onClick={() => addCardNote(card.id)}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <StickyNote className="size-[16px]" />
          {card.notes.length > 0 && <span className="text-[12px] font-medium">{card.notes.length}</span>}
        </button>
      </IconTooltip>
    </div>
  );

  if (card.collapsed) {
    const summary = card.summary?.trim() || deriveCardSummary(card.messages);
    const image = firstImage(card.messages);
    return (
      <div
        className={cn(
          "group/card relative flex w-full cursor-grab select-none flex-col rounded-[16px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) shadow-sm transition-[transform,box-shadow] duration-150 ease-out motion-reduce:transition-none",
          data.isPickedUp ? "-translate-y-[4px] scale-[1.02] cursor-grabbing shadow-xl" : "hover:shadow-md active:cursor-grabbing",
          selected && "ring-2 ring-foreground",
        )}
        onPointerDownCapture={blurOnDrag}
        ref={shell}
        style={{ minHeight: CONTRACTED_CARD_MIN_HEIGHT }}
      >
        {branchButtons}
        {titleBar}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[12px] overflow-hidden px-[20px] py-[20px] text-center">
          <h3 className="line-clamp-2 shrink-0 text-[24px] font-semibold leading-[32px] text-foreground" dir="auto">
            {card.title}
          </h3>
          {summary ? (
            <p className="line-clamp-2 shrink-0 text-[18px] leading-[1.625] text-(--ui-text-secondary)" dir="auto">
              {summary}
            </p>
          ) : (
            !streaming && <p className="shrink-0 text-[16px] text-(--ui-text-tertiary)">Expand to start the conversation</p>
          )}
          {streaming && <StreamingDots />}
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- an address the model wrote.
            <img alt={image.alt} className="pointer-events-none max-h-[224px] min-h-0 w-auto max-w-full rounded-[12px] border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) object-contain" decoding="async" draggable={false} loading="lazy" src={image.url} />
          )}
          {card.messages.length > 0 && (
            <button
              className="nodrag nopan shrink-0 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-[16px] py-[8px] text-[14px] font-medium text-(--ui-text-secondary) shadow-sm transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                setCardCollapsed(card.id, false);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              See the full conversation
            </button>
          )}
        </div>
        <NodeHandles target />
      </div>
    );
  }

  const style =
    lockedHeight !== null
      ? { height: lockedHeight }
      : heightFixed
        ? measuredHeightKnown
          ? undefined
          : { height: resizeHeight ?? card.height }
        : { minHeight: CARD_MIN_HEIGHT, ...(autoMax !== null ? { maxHeight: autoMax } : {}) };

  return (
    <div
      className={cn(
        "group/card relative flex w-full cursor-grab flex-col rounded-[16px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) shadow-sm transition-[transform,box-shadow] duration-150 ease-out motion-reduce:transition-none",
        data.isPickedUp ? "-translate-y-[4px] scale-[1.02] cursor-grabbing shadow-xl" : "hover:shadow-md active:cursor-grabbing",
        heightFixed && "h-full",
        selected && "ring-2 ring-foreground",
      )}
      onPointerDownCapture={blurOnDrag}
      ref={shell}
      style={style}
    >
      <NodeResizeControls
        onVerticalResizeEnd={() => {
          setResizing(false);
          setResizeHeight(null);
        }}
        onVerticalResizeStart={() => {
          setResizeHeight(shell.current?.offsetHeight || getInternalNode(card.id)?.measured?.height || null);
          setResizing(true);
        }}
      />
      {branchButtons}
      {titleBar}
      <div className="contents">
        <div
          className={cn(
            "min-h-0 space-y-[12px] overflow-y-auto overscroll-contain px-[16px] py-[12px]",
            heightFixed && "flex-1",
            selected ? "nodrag nopan cursor-auto select-text" : "select-none",
          )}
          data-board-card-content=""
          data-board-card-id={card.id}
          onClick={onContentClick}
          ref={content}
          style={{ WebkitMaskImage: CONTENT_MASK, maskImage: CONTENT_MASK }}
        >
          <DiveDeeperSourceMatcherContext.Provider value={isBranchedTerm}>
            {card.messages.map((message, index) => {
              const failedUser = message.isError ? card.messages[index - 1] : undefined;
              const retryable = failedUser?.role === "user";
              const notice = retryable && isMessageTooLong(failedUser.content) ? BOARD_MESSAGE_TOO_LONG_REPLY : undefined;
              return (
                <CardMessage
                  errorNotice={notice}
                  hideContextExcerpt={index === 0 && message.contextExcerpt === (card.contextExcerpt ?? undefined)}
                  key={message.id}
                  message={message}
                  onDiveDeeper={diveDeeper}
                  onRetry={
                    retryable
                      ? () => {
                          setDraft(failedUser.content);
                          setRetry({ userMessageId: failedUser.id, assistantMessageId: message.id });
                          textarea.current?.focus();
                        }
                      : undefined
                  }
                />
              );
            })}
            {suggestions.length > 0 && (
              <div aria-label="Suggested questions" className="nodrag nopan flex flex-col gap-[8px]" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                {suggestions.map((suggestion) => {
                  const open = openSuggestion === suggestion;
                  return (
                    <div className="relative min-h-[40px]" key={suggestion}>
                      <button
                        aria-expanded={open}
                        aria-hidden={open || undefined}
                        className={cn(
                          "min-h-[40px] w-full whitespace-normal break-words rounded-[8px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-[16px] py-[8px] text-start text-[16px] leading-[24px] text-foreground transition-[opacity,transform,background-color,border-color] duration-200 hover:bg-(--ui-bg-secondary)",
                          open && "pointer-events-none scale-[0.98] opacity-0",
                        )}
                        dir="auto"
                        onClick={() => setOpenSuggestion(suggestion)}
                        ref={(node) => {
                          if (node) suggestionButtons.current.set(suggestion, node);
                          else suggestionButtons.current.delete(suggestion);
                        }}
                        tabIndex={open ? -1 : undefined}
                        type="button"
                      >
                        {suggestion}
                      </button>
                      {open && (
                        <div aria-label={`Actions for ${suggestion}`} className="board-menu-pop absolute inset-0 grid grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)] gap-[6px]">
                          <IconTooltip label="Cancel">
                            <button
                              aria-label="Cancel suggestion actions"
                              className="flex min-h-[40px] items-center justify-center rounded-[8px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-secondary) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ui-action)"
                              onClick={() => {
                                returnFocusTo.current = suggestion;
                                setOpenSuggestion(null);
                              }}
                              ref={cancelButton}
                              type="button"
                            >
                              <X className="size-[14px]" />
                            </button>
                          </IconTooltip>
                          <IconTooltip label="Ask here">
                            <button
                              aria-label="Ask here"
                              className="flex min-w-0 items-center justify-center gap-[6px] rounded-[8px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-[8px] py-[4px] text-[14px] font-medium text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-secondary) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ui-action)"
                              onClick={() => {
                                setOpenSuggestion(null);
                                send(suggestion, false);
                              }}
                              type="button"
                            >
                              <MessageCircle className="size-[16px] shrink-0" />
                              <span className="min-w-0 leading-none">Ask here</span>
                            </button>
                          </IconTooltip>
                          <IconTooltip label="Ask in a new branch">
                            <button
                              aria-label="Ask in a new branch"
                              className="flex min-w-0 items-center justify-center gap-[6px] rounded-[8px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-[8px] py-[4px] text-[14px] font-medium text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-secondary) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ui-action)"
                              onClick={() => {
                                setOpenSuggestion(null);
                                if (sendBranchQuestion(card.id, suggestion)) window.getSelection()?.removeAllRanges();
                              }}
                              type="button"
                            >
                              <GitBranch className="size-[16px] shrink-0" />
                              <span className="min-w-0 leading-none">Ask in a new branch</span>
                            </button>
                          </IconTooltip>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </DiveDeeperSourceMatcherContext.Provider>
        </div>
        {(card.savedImages.length > 0 || (!paints && card.highlights.length > 0)) && (
          <section aria-label="Saved items" className="min-h-0 overflow-y-auto overscroll-contain border-t border-(--ui-stroke-secondary) px-[16px] py-[12px]">
            <div className="mb-[8px] flex items-center gap-[6px] text-[12px] font-semibold text-(--ui-text-secondary)">
              <Bookmark className="size-[14px] text-(--ui-action)" />
              <span>Saved items</span>
            </div>
            <ul className="space-y-[8px]">
              {!paints &&
                card.highlights.map((highlight) => (
                  <li
                    className={cn(
                      "group flex items-start gap-[8px] rounded-[8px] px-[12px] py-[8px]",
                      highlight.kind === "branch" ? "bg-(--board-branch-highlight) text-foreground" : noteTexts.has(highlight.text) ? "bg-(--ui-bg-secondary)" : "bg-(--board-text-highlight)/40",
                    )}
                    key={highlight.id}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-[4px] flex items-center gap-[4px] text-[10px] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">
                        {highlight.kind === "branch" ? <Sparkles className="size-[12px] text-foreground" /> : <Highlighter className="size-[12px]" />}
                        <span>{highlight.kind === "branch" ? "Dive deeper source" : "Highlighted text"}</span>
                      </div>
                      <p className="text-[12px] leading-[1.625] text-foreground" dir="auto">
                        {highlight.text}
                      </p>
                    </div>
                    {highlight.kind !== "branch" && highlight.noteIds.length === 0 && (
                      <IconTooltip label="Remove highlight">
                        <button aria-label="Remove highlight" className="shrink-0 rounded p-[2px] text-(--ui-text-tertiary) opacity-60 transition-opacity hover:text-(--board-error-text) focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => removeCardHighlight(card.id, highlight.id)} type="button">
                          <X className="size-[14px]" />
                        </button>
                      </IconTooltip>
                    )}
                  </li>
                ))}
              {card.savedImages.map((image) => (
                <li className="group rounded-[8px] border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-[8px]" key={image.id}>
                  <div className="mb-[6px] flex items-center gap-[4px] text-[10px] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">
                    <ImageIcon className="size-[12px] text-(--ui-action)" />
                    <span className="flex-1">Saved image</span>
                    <IconTooltip label="Remove saved image">
                      <button aria-label="Remove saved image" className="rounded p-[2px] text-(--ui-text-tertiary) opacity-60 transition-opacity hover:text-(--board-error-text) focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => removeCardImage(card.id, image.id)} type="button">
                        <X className="size-[14px]" />
                      </button>
                    </IconTooltip>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element -- an address the model wrote. */}
                  <img alt={image.alt} className="max-h-[144px] w-full rounded-[6px] object-contain" src={image.url} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <form className="mt-auto flex shrink-0 items-center gap-[8px] rounded-b-[16px] px-[12px] py-[10px]" onSubmit={submit}>
        <div className="min-w-0 flex-1">
          <AutoResizingTextarea
            aria-describedby={limitNotice ? `board-card-${card.id}-limit` : undefined}
            aria-invalid={tooLong || undefined}
            className="nodrag nopan block min-h-[48px] w-full resize-none rounded-[16px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-[16px] py-[12px] text-[16px] leading-[24px] text-foreground transition-none placeholder:text-(--ui-text-tertiary) focus:outline-none focus:ring-0 focus-visible:outline-none"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask a follow-up…"
            ref={textarea}
            value={draft}
          />
          {limitNotice && (
            <p className="mt-[4px] px-[4px] text-[12px] text-(--board-error-text)" id={`board-card-${card.id}-limit`} role="alert">
              {limitNotice}
            </p>
          )}
        </div>
        <IconTooltip label="Send follow-up">
          <button
            aria-label="Send follow-up"
            className="nodrag nopan flex size-[48px] shrink-0 items-center justify-center rounded-[8px] bg-(--ui-action) text-(--ui-action-glyph) transition-opacity disabled:opacity-40"
            disabled={!draft.trim() || streaming || tooLong}
            type="submit"
          >
            <ArrowUp className="size-[16px]" />
          </button>
        </IconTooltip>
      </form>
      <NodeHandles target />
      <SelectionActions cardId={card.id} contentRef={content} />
      {highlightMenu && removable.has(highlightMenu.highlightId) && (
        <SelectionMenu
          actions={[
            {
              label: "Remove highlight",
              icon: SELECTION_ICONS.remove,
              onClick: () => {
                removeCardHighlight(card.id, highlightMenu.highlightId);
                setHighlightMenu(null);
              },
            },
          ]}
          label="Highlight actions"
          onDismiss={() => setHighlightMenu(null)}
          position={highlightMenu}
        />
      )}
    </div>
  );
}

export const ConversationCard = memo(
  ConversationCardInner,
  (a, b) => a.data.cardId === b.data.cardId && a.data.isPickedUp === b.data.isPickedUp && a.selected === b.selected,
);
