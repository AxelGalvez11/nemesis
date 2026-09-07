"use client";

// The front door: what a learner sees on an empty board, before anything is on the canvas.
//
// Owner, 2026-09-05: *"the thing im worried about is the landing page, its a chat composer so it
// invites chatting, where as notebook lm invites dropping in documents."* Then, 2026-09-06: *"make
// new landing and workspace canvas based on stitch and wondering canvas, where users are invited
// to drop in material."*
//
// The shape is Stitch's home, measured in his Chrome at 1470 on 2026-09-06: one line of welcome,
// then a 998x216 box whose own bottom row says what you are making (their App | Web control,
// beside the +). The words are NotebookLM's: its first control on an empty notebook is "Add
// sources", and that is the button in this box's bottom row. Type and it is a question, the way
// Wondering's board starts; drop or add material and the board opens around it with the sources
// and the create panel beside it (board-studio.tsx).
//
// 🔴 NOT A DASHBOARD, NOT A FILE BROWSER. The same two rules the chat's front door lives by
// (canvas-home.tsx): nothing above the title, nothing under the hint line. Stitch's example chips
// and inspiration gallery are not here; the sidebar already lists the learner's canvases.
//
// 🔴 THE BOX CARRIES `data-board-composer`. `measureBoardArea` (board-chrome.ts) reads the
// composer's top edge to know how much board is free above it; the first card is centred in that
// space before it exists. The landing's box is the composer on an empty board, so it must answer
// to the same stamp or the first card lands under it.

import { ArrowUp, Earth, FilePlus2 } from "lucide-react";
import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";

import { isMessageTooLong, messageLimitNotice } from "@/lib/board/board-model";
import { cn } from "@/lib/utils";

import { AutoResizingTextarea, IconTooltip } from "./board-chrome";
import { useBoard } from "./board-provider";

export const LANDING_TITLE = "What are you studying?";
export const LANDING_PLACEHOLDER = "Drop your lecture, notes or slides here, or ask a question";
export const LANDING_HINT = "Add material first, then ask about it, or make flashcards, a test or a study guide from it.";
/** What the file picker offers: everything the reader opens (memory: "drop anything, it reads everything"). */
export const LANDING_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.markdown,.html,.htm,.rtf,.odt,.epub,image/*";

export function BoardLanding() {
  const { sendRootMessage, addSourceFiles, useWebSearch, setUseWebSearch } = useBoard();
  const [text, setText] = useState("");
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const notice = messageLimitNotice(text);
  const tooLong = isMessageTooLong(text);

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
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length) void addSourceFiles(files);
  };

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center px-[24px]"
      data-board-landing=""
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setOver(false);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setOver(true);
        }
      }}
      onDrop={onDrop}
    >
      <h1 className="mb-[24px] text-[length:var(--canvas-text-title)] font-medium tracking-[-0.01em] text-(--ui-text-primary)">{LANDING_TITLE}</h1>
      <form
        className="w-full max-w-[896px] rounded-[16px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)/75 shadow-sm backdrop-blur-xl"
        data-board-composer=""
        data-composer-mode="landing"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <AutoResizingTextarea
          aria-describedby={notice ? "board-landing-limit" : undefined}
          aria-invalid={tooLong || undefined}
          aria-label={LANDING_TITLE}
          className="min-h-[96px] w-full resize-none bg-transparent px-[20px] pb-[8px] pt-[16px] text-[16px] leading-[24px] text-foreground outline-none transition-none placeholder:text-(--ui-text-tertiary) focus:shadow-none focus:ring-0"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={LANDING_PLACEHOLDER}
          value={text}
        />
        {notice && (
          <p className="px-[20px] pb-[8px] text-[12px] text-(--board-error-text)" id="board-landing-limit" role="alert">
            {notice}
          </p>
        )}
        <div className="flex items-center justify-between gap-[8px] px-[12px] pb-[12px]">
          <div className="flex items-center gap-[4px]">
            {/* 🔴 A WORD, NOT A SYMBOL. The chat's front door adds material through a `+` and a
                drag, and reads as a chat for it. "Add sources" is NotebookLM's first control and
                says what the box is for. */}
            <button
              className="inline-flex h-[36px] items-center gap-[6px] rounded-full bg-(--ui-bg-secondary) px-[12px] text-[14px] font-medium text-foreground transition-colors hover:bg-(--ui-control-hover-background)"
              onClick={() => picker.current?.click()}
              type="button"
            >
              <FilePlus2 aria-hidden className="size-[16px]" />
              Add sources
            </button>
            <input
              accept={LANDING_ACCEPT}
              className="hidden"
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length) void addSourceFiles(files);
              }}
              ref={picker}
              type="file"
            />
            <IconTooltip label={`Web search ${useWebSearch ? "on" : "off"}`}>
              <button
                aria-label={`Web search ${useWebSearch ? "enabled. Turn off" : "disabled. Turn on"}`}
                aria-pressed={useWebSearch}
                className={cn(
                  "flex size-[36px] items-center justify-center rounded-full transition-colors",
                  useWebSearch ? "bg-(--ui-bg-secondary) text-foreground hover:bg-(--ui-control-hover-background)" : "text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground",
                )}
                onClick={() => setUseWebSearch(!useWebSearch)}
                type="button"
              >
                <Earth aria-hidden className="size-[16px]" />
              </button>
            </IconTooltip>
          </div>
          <IconTooltip label="Send message">
            <button
              aria-label="Send message"
              className="flex size-[40px] shrink-0 items-center justify-center rounded-[12px] bg-(--ui-action) text-(--ui-action-glyph) transition-all enabled:hover:opacity-90 disabled:opacity-40"
              disabled={!text.trim() || tooLong}
              type="submit"
            >
              <ArrowUp aria-hidden className="size-[20px]" />
            </button>
          </IconTooltip>
        </div>
      </form>
      <p className="mt-[16px] max-w-[896px] text-center text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">{LANDING_HINT}</p>
      {over && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-(--ui-bg-editor)/60 backdrop-blur-[1px]">
          <div className="rounded-[12px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-[16px] py-[10px] text-[14px] font-medium text-foreground shadow-md">Drop to add as a source</div>
        </div>
      )}
    </div>
  );
}
