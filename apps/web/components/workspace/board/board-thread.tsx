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
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { OUTPUT_KIND_MARKS } from "@/components/workspace/learn/artifact-card";
import { KIND_LABELS, MAKING_LABELS } from "@/lib/board/board-deliverables";
import { boardCitableFiles } from "@/lib/board/board-grounding";
import { isMessageTooLong, messageLimitNotice, type BoardCard, type BoardOutputCard } from "@/lib/board/board-model";
import { cn } from "@/lib/utils";

import { AutoResizingTextarea, IconTooltip } from "./board-chrome";
import { CardMessage } from "./card-message";
import { useDocumentDock } from "@/components/workspace/learn/document-dock";
import { useDeclareFullBleedSurface } from "@/components/workspace/shell/immersive-surface";

import { useBoard } from "./board-provider";

/** The column the chat reads at. */
const COLUMN = 768;

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

/**
 * One thing this conversation made, as a row in the conversation.
 *
 * 🔴 A TEST IS NOT OPENABLE IN THE PANEL AND THIS BUTTON SAYS SO. Every other kind carries a
 * `CanvasOutput` the reading pane knows how to draw; a check carries a `run` that lives in its own
 * card on the board, so "Open" on one would be a button that does nothing. Answering a test where
 * it stands is also the rule the owner set on 2026-09-04.
 */
function MadeRow({ onLeave, onOpen, output }: { onLeave: () => void; onOpen: (output: BoardOutputCard) => void; output: BoardOutputCard }) {
  const mark = OUTPUT_KIND_MARKS[output.kind as keyof typeof OUTPUT_KIND_MARKS];
  const title = output.output?.title || output.topic || KIND_LABELS[output.kind];
  const making = output.status === "making";
  return (
    <div
      className="flex items-center gap-[12px] rounded-[16px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-[14px] py-[12px]"
      data-thread-made-row={output.kind}
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
      {output.status === "ready" && (
        <button
          className="shrink-0 rounded-full bg-(--ui-action) px-[16px] py-[6px] text-[13px] font-medium text-(--ui-action-glyph) transition-opacity hover:opacity-90"
          data-thread-made-open={output.kind === "check" ? "canvas" : "panel"}
          onClick={() => (output.kind === "check" ? onLeave() : onOpen(output))}
          type="button"
        >
          {output.kind === "check" ? "Show on canvas" : "Open"}
        </button>
      )}
    </div>
  );
}

export function BoardThread() {
  const { cards, sources, outputs, enteredCardId, leaveCard, openOutput, sendCardMessage, createBranchCard } = useBoard();
  /**
   * 🔴🔴 NOTHING IS RESERVED FOR THE TOOLBAR, AND THAT IS WHY THE CHAT IS CENTRED. Owner,
   * 2026-09-07: *"I feel like the chat is kind of to the left ... I want a full chat to be
   * centered"*. It was: an 80px `paddingRight` was kept clear for the board's controls, so the
   * 768px column was centred in the room LEFT OVER and sat 40px left of the window's middle.
   *
   * The reserve was never needed. The toolbar is a pill in the top-right CORNER, in the same band
   * as this layer's own header, and that header's right half is empty — so it overlaps nothing.
   * Reserving a strip down the full height to clear something 40px tall was the mistake.
   *
   * 🔴 THIS LAYER STILL DOES NOT POSITION ITSELF AGAINST THE READING PANEL, and one build tried.
   * `BoardArea` carries the inset and this layer is `inset-0` inside it, so it narrows for free:
   * measured in headless Chrome at 1470, the chat is 525 wide and the panel starts at exactly 525.
   * Setting `right` here as well applied the inset twice and collapsed the chat to nothing. And it
   * was the Browser pane that made it LOOK like an overlap: its window is hidden, which freezes the
   * `transition-[right]` at `currentTime: 0`, and a transition outranks an inline style. Measure
   * this surface in Playwright, never in the pane.
   */
  const card = cards.find((item) => item.id === enteredCardId) ?? null;
  const [text, setText] = useState("");
  // Everything this conversation has made, oldest first, so it reads as the thread's own history.
  const made = outputs.filter((output) => output.cardId === enteredCardId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  /** Made things that know which turn asked for them, keyed by that message. */
  const anchored = new Map<string, typeof made>();
  const orphaned: typeof made = [];
  for (const output of made) {
    const at = output.afterMessageId;
    if (at && card?.messages.some((message) => message.id === at)) anchored.set(at, [...(anchored.get(at) ?? []), output]);
    else orphaned.push(output);
  }
  const foot = useRef<HTMLDivElement>(null);
  const dock = useDocumentDock();
  /**
   * 🔴 A MIND MAP IS NOT A `CanvasOutput`, SO IT CANNOT GO THROUGH `openOutput`. It carries a tree
   * rather than a file (board-model.ts), and the dock has its own door for one. Owner, 2026-09-07:
   * *"I would reserve the mind maps for the sidebar"*.
   */
  const open = (output: BoardOutputCard) => {
    if (output.kind === "mindmap") {
      if (output.mindmap) dock.openMindmap(output.mindmap, output.output?.title || output.topic || "Mind map");
      return;
    }
    openOutput(output.id);
  };

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

      {/* 🔴🔴 THE 80px RESERVE IS FOR THE BOARD'S OWN TOOLBAR, WHICH ONLY SITS OVER THIS LAYER WHILE
          NOTHING IS DOCKED. Owner, 2026-09-07: *"chats should be centered and they should move to
          left to make room for the panel"*. The moving-left half was already true; the centring half
          was not, because this reserve stayed at 80 once the panel took the right edge and pushed
          the conversation off-centre in the room left over. The toolbar has moved with the panel by
          then, so there is nothing to keep clear of. */}
      <div className="scrollbar-dt min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex flex-col gap-[24px] px-[16px] pb-[24px]" style={{ width: COLUMN, maxWidth: "100%" }}>
          {/* 🔴 NO `onOpenFile` ON THESE MESSAGES. On the board a citation flies the camera to the
              source card; inside a thread there is no camera to fly, and opening the document is the
              reading pane's job, which the Sources panel already reaches. */}
          {card.messages.map((message, index) => {
            const failed = message.isError ? card.messages[index - 1] : undefined;
            return (
              <Fragment key={message.id}>
                <CardMessage
                  files={files}
                  hideContextExcerpt={index === 0 && message.contextExcerpt === (card.contextExcerpt ?? undefined)}
                  message={message}
                  {...(failed?.role === "user" ? { onRetry: () => setText(failed.content) } : {})}
                />
                {/* 🔴🔴 THE THING IS DRAWN WHERE IT WAS MADE. Owner, 2026-09-07: *"the node or the
                    artifact inline chip continues to persist like downward"*. Every made thing used
                    to be listed at the FOOT of the whole conversation, so a note made in the first
                    exchange sat under the tenth answer and the eleventh, reading as part of every
                    turn rather than as the result of one. */}
                {(anchored.get(message.id) ?? []).map((output) => (
                  <MadeRow key={output.id} onLeave={leaveCard} onOpen={open} output={output} />
                ))}
              </Fragment>
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
          {/* 🔴🔴 EVERYTHING MADE BEFORE THIS FEATURE EXISTED, AND ANYTHING ASKED FOR FROM THE
              PANEL, STILL LANDS AT THE FOOT. Those have no message to hang off (`afterMessageId`
              is absent) and putting them nowhere would lose them. Everything asked for in words
              is drawn against its own turn, above. */}
          {orphaned.length > 0 && (
            <div className="flex flex-col gap-[8px]" data-thread-made="">
              {orphaned.map((output) => (
                <MadeRow key={output.id} onLeave={leaveCard} onOpen={open} output={output} />
              ))}
            </div>
          )}
          <div ref={foot} />
        </div>
      </div>

      {/* 🔴🔴 ONE ROW, NOT TWO. Owner, 2026-09-07: *"make the chat composer smaller in fullscreen
          chats"*. Measured at rest before the change: 114px tall, from a 56px text area stacked over
          a 51px row that held one button. The button had a row of its own because the board's
          composer carries attachments, a microphone and a web-search toggle beside it; this one
          never had any of those, so the second row was 51px of air under a single-line prompt.
          Now the button sits IN the row, and the box is the height of the button plus its padding.

          🔴 `items-end`, SO IT STILL GROWS. Type three lines and the text area takes them and the
          send button stays on the last one, which is ChatGPT's behaviour and the reason this is not
          simply a fixed-height input. The cap is 200px, after which it scrolls rather than eating
          the conversation. */}
      <div className="shrink-0 px-[16px] pb-[16px]">
        <form
          className="mx-auto overflow-hidden rounded-[16px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)/75 backdrop-blur-xl"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          style={{ width: COLUMN, maxWidth: "100%" }}
        >
          {notice && <p className="px-[16px] pt-[10px] text-[12px] text-(--board-error-text)" role="alert">{notice}</p>}
          <div className="flex items-end gap-[8px] px-[12px] py-[10px]">
            <AutoResizingTextarea
              aria-invalid={tooLong || undefined}
              maxHeight={200}
              className="min-h-[24px] flex-1 resize-none bg-transparent px-[4px] py-[6px] text-[16px] leading-[24px] text-foreground outline-none placeholder:text-(--ui-text-tertiary) focus:shadow-none focus:ring-0"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Ask about ${card.title}…`}
              value={text}
            />
            <IconTooltip label="Send message">
              <button
                aria-label="Send message"
                className={cn("flex size-[36px] shrink-0 items-center justify-center rounded-[10px] bg-(--ui-action) text-(--ui-action-glyph) transition-all enabled:hover:opacity-90 disabled:opacity-40")}
                disabled={!text.trim() || tooLong || busy}
                type="submit"
              >
                <ArrowUp className="size-[18px]" />
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
