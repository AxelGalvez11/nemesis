"use client";

// One thread, entered: the canvas steps back and this conversation takes the reading column.
//
// Owner, 2026-09-06: *"i feel like the canvas is nice to visualize and organize but having a chat is
// nice to focus on … could there be a way to allow users to enter individual chats in the canvas so
// chat and canvas converge into one? like having canvas be the top layer, and chat be inner layer
// with sidebar functionality?"*
//
// 🔴🔴 THE BOARD NEVER UNMOUNTS. This is a layer over it, not a route: the camera, the streaming
// answer and every card stay exactly as they were, and leaving is a state change with nothing to
// restore. The canvas has already been reported once as a blank screen on exit, and every version of
// that bug came from a real navigation happening under a running turn.
//
// 🔴 IT IS THE SAME THREAD, NOT A COPY. `card.messages` is the card's own list and `sendCardMessage`
// is the card's own send, so a question asked here appears on the board's card and the other way
// round. There is no second store and nothing to keep in step.
//
// 🔴🔴 THE SOURCES AND CREATE PANEL FLOATS OVER THIS, WHICH IS THE "sidebar functionality" HALF OF
// the owner's ask. This layer sits at z-30 and `board-studio.tsx` at z-40 so the toolbar and the
// panel stay reachable from inside a thread; drawn the other way round the panel is still in the
// DOM, still answering, and completely invisible, which is how it first shipped.
//
// 🔴 WHAT CHANGES IS THE READING, WHICH IS THE WHOLE POINT. A card is 640 wide on a surface the
// learner may have zoomed to 55%; the column here is the chat's own 768 at 100%, with the answer's
// full typography (chat-markdown.tsx) rather than a card's compressed one.

import { ArrowLeft, ArrowUp, GitBranch, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { OUTPUT_KIND_MARKS } from "@/components/workspace/learn/artifact-card";
import { KIND_LABELS, MAKING_LABELS } from "@/lib/board/board-deliverables";
import { boardCitableFiles } from "@/lib/board/board-grounding";
import { isMessageTooLong, messageLimitNotice, type BoardCard } from "@/lib/board/board-model";
import { cn } from "@/lib/utils";

import { AutoResizingTextarea, IconTooltip } from "./board-chrome";
import { CardMessage } from "./card-message";
import { useDeclareFullBleedSurface } from "@/components/workspace/shell/immersive-surface";

import { useBoard } from "./board-provider";

/** The column the chat reads at. */
const COLUMN = 768;
/** Room kept clear on the right for the board's own toolbar, which stays where it is. */
const TOOLBAR_RESERVE = 80;

/**
 * 🔴🔴 A FULL-SIZE CHAT OWNS THE WHOLE WINDOW, RAIL AND ALL. Owner, 2026-09-06, of the first build:
 * *"the left rail sidebar still shows in full size view"*. Mounted only inside this layer, so the
 * claim is released the instant the learner presses Canvas — which is the exit this claim's own
 * note requires, and it is drawn unconditionally below.
 */
function FullBleed() {
  useDeclareFullBleedSurface();
  return null;
}

export function BoardThread() {
  const { cards, sources, outputs, enteredCardId, leaveCard, openOutput, sendCardMessage, createBranchCard } = useBoard();
  const card = cards.find((item) => item.id === enteredCardId) ?? null;
  const [text, setText] = useState("");
  // Everything this conversation has made, oldest first, so it reads as the thread's own history.
  const made = outputs.filter((output) => output.cardId === enteredCardId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const foot = useRef<HTMLDivElement>(null);

  // 🔴 ESCAPE LEAVES, unless the learner is typing: a composer with words in it owns its own Escape.
  useEffect(() => {
    if (!card) return;
    const onKey = (event: KeyboardEvent<Document> | globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT") && text.trim()) return;
      leaveCard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, leaveCard, text]);

  // A new turn lands at the foot, the way a conversation does.
  useEffect(() => {
    foot.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [card?.messages.length]);

  if (!card) return null;

  const files = boardCitableFiles(sources);
  const notice = messageLimitNotice(text);
  const tooLong = isMessageTooLong(text);
  const busy = card.status === "streaming";

  const submit = () => {
    if (!text.trim() || tooLong) return;
    if (sendCardMessage(card.id, text)) setText("");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div
      aria-label={card.title}
      className="board-thread-in absolute inset-0 z-30 flex flex-col bg-(--ui-bg-editor)"
      data-board-thread={card.id}
      role="region"
    >
      <FullBleed />
      {/* 🔴 ONE WAY OUT, IN ONE PLACE, ALWAYS VISIBLE. The owner's own worry about stacking two ways
          of moving: "the way out has to be one control, in one place". It never scrolls away and it
          says where it goes rather than only pointing. */}
      <header className="flex h-[52px] shrink-0 items-center gap-[8px] px-[12px]">
        <IconTooltip label="Back to the canvas (Esc)">
          <button
            aria-label="Back to the canvas"
            className="flex h-[36px] items-center gap-[6px] rounded-[10px] px-[10px] text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            data-testid="board-thread-back"
            onClick={leaveCard}
            type="button"
          >
            <ArrowLeft aria-hidden className="size-[16px]" />
            Canvas
          </button>
        </IconTooltip>
        <h1 className="min-w-0 flex-1 truncate text-[length:var(--canvas-text-small)] leading-[20px] text-(--ui-text-primary)" title={card.title}>
          {card.title}
        </h1>
        {/* 🔴🔴 BRANCHING FROM IN HERE PUTS YOU BACK ON THE BOARD. Owner, 2026-09-07: *"when user
            wants to branch off in fullscreen view the chat escapes fullscreen view and shows the
            newly branched chat"*. The exit is not this button's doing — every branch path leaves
            full screen (board-provider.tsx) — so branching by any other route behaves the same. */}
        <IconTooltip label="Start a new chat from this one">
          <button
            aria-label="Branch off this chat"
            className="flex h-[36px] items-center gap-[6px] rounded-[10px] px-[10px] text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
            data-thread-branch=""
            onClick={() => createBranchCard(card.id)}
            type="button"
          >
            <GitBranch aria-hidden className="size-[16px]" />
            Branch
          </button>
        </IconTooltip>
      </header>

      <div className="scrollbar-dt min-h-0 flex-1 overflow-y-auto" style={{ paddingRight: TOOLBAR_RESERVE }}>
        <div className="mx-auto flex flex-col gap-[24px] px-[16px] pb-[24px]" style={{ width: COLUMN, maxWidth: "100%" }}>
          {/* 🔴 NO `onOpenFile` ON THESE MESSAGES. On the board a citation flies the camera to the
              source card; inside a thread there is no camera to fly, and opening the document is the
              reading pane's job, which the Sources panel already reaches. */}
          {card.messages.map((message, index) => {
            const failed = message.isError ? card.messages[index - 1] : undefined;
            return (
              <CardMessage
                files={files}
                hideContextExcerpt={index === 0 && message.contextExcerpt === (card.contextExcerpt ?? undefined)}
                key={message.id}
                message={message}
                {...(failed?.role === "user" ? { onRetry: () => setText(failed.content) } : {})}
              />
            );
          })}
          {/* 🔴🔴 WHAT THIS CONVERSATION MADE, SHOWN IN THE CONVERSATION. Owner, 2026-09-06, of the
              Gemini thread he linked: *"you basically have a chat and you prompt it to create
              flashcard … i like that functionality"*. Measured in it: the reply is followed by a
              small card carrying the thing's name, the time it was made and one **Open** button,
              and Open fills the panel beside the chat (865 wide at 1470, radius 40).

              Asking in words already MADE the thing here — `sendCardMessage` reads
              "make me flashcards on this" and calls `makeDeliverable` (board-provider.tsx). What was
              missing is that it landed on the board BEHIND this layer, so from inside a full-size
              chat you asked for a deck and nothing appeared to happen. */}
          {made.length > 0 && (
            <div className="flex flex-col gap-[8px]" data-thread-made="">
              {made.map((output) => {
                const mark = OUTPUT_KIND_MARKS[output.kind as keyof typeof OUTPUT_KIND_MARKS];
                const title = output.output?.title || output.topic || KIND_LABELS[output.kind];
                const making = output.status === "making";
                return (
                  <div
                    className="flex items-center gap-[12px] rounded-[16px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-[14px] py-[12px]"
                    data-thread-made-row={output.kind}
                    key={output.id}
                  >
                    {making ? (
                      <LoaderCircle aria-hidden className="size-[18px] shrink-0 animate-spin text-(--ui-text-tertiary)" />
                    ) : (
                      <Codicon aria-hidden name={mark?.icon ?? "file"} size="18px" style={{ color: `var(${mark?.tint ?? "--ui-kind-blue"})` }} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] leading-[20px] text-foreground">{making ? `${MAKING_LABELS[output.kind]}…` : title}</span>
                      <span className="block truncate text-[12px] leading-[16px] text-(--ui-text-tertiary)">
                        {output.status === "error" ? output.error || "Could not be made" : KIND_LABELS[output.kind]}
                      </span>
                    </span>
                    {/* 🔴 A TEST IS NOT OPENABLE IN THE PANEL AND THIS BUTTON SAYS SO. Every other
                        kind carries a `CanvasOutput` the reading pane knows how to draw; a check
                        carries a `run` that lives in its own card on the board, so "Open" on one
                        would be a button that does nothing — which is exactly what it did when this
                        row was first built and every kind got the same label. Answering a test where
                        it stands is also the rule the owner set on 2026-09-04 ("tests should show
                        results in their own card node"). */}
                    {output.status === "ready" && (
                      <button
                        className="shrink-0 rounded-full bg-(--ui-action) px-[16px] py-[6px] text-[13px] font-medium text-(--ui-action-glyph) transition-opacity hover:opacity-90"
                        data-thread-made-open={output.kind === "check" ? "canvas" : "panel"}
                        onClick={() => {
                          if (output.kind === "check") leaveCard();
                          else openOutput(output.id);
                        }}
                        type="button"
                      >
                        {output.kind === "check" ? "Show on canvas" : "Open"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div ref={foot} />
        </div>
      </div>

      {/* The board's own composer shape, sending to this thread rather than opening a new one. */}
      <div className="shrink-0 px-[16px] pb-[24px]" style={{ paddingRight: TOOLBAR_RESERVE }}>
        <form
          className="mx-auto overflow-hidden rounded-[16px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)/75 backdrop-blur-xl"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          style={{ width: COLUMN, maxWidth: "100%" }}
        >
          <AutoResizingTextarea
            aria-invalid={tooLong || undefined}
            className="min-h-[56px] w-full resize-none bg-transparent px-[16px] pb-[8px] pt-[12px] text-[16px] leading-[24px] text-foreground outline-none placeholder:text-(--ui-text-tertiary) focus:shadow-none focus:ring-0"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Ask about ${card.title}…`}
            value={text}
          />
          {notice && <p className="px-[16px] pb-[8px] text-[12px] text-(--board-error-text)" role="alert">{notice}</p>}
          <div className="flex items-center justify-end px-[12px] pb-[12px]">
            <IconTooltip label="Send message">
              <button
                aria-label="Send message"
                className={cn("flex size-[40px] shrink-0 items-center justify-center rounded-[12px] bg-(--ui-action) text-(--ui-action-glyph) transition-all enabled:hover:opacity-90 disabled:opacity-40")}
                disabled={!text.trim() || tooLong || busy}
                type="submit"
              >
                <ArrowUp className="size-[20px]" />
              </button>
            </IconTooltip>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Whether this card is the one being read, for the card's own chrome. */
export function useEnteredCard(): BoardCard | null {
  const { cards, enteredCardId } = useBoard();
  return cards.find((card) => card.id === enteredCardId) ?? null;
}
