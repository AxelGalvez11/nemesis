"use client";

// The little bar that appears over selected text in a card (docs/wondering-canvas-reference.md §5):
// an "Ask about this…" field, then Create note and Highlight. Typing turns the two actions into
// "Reply here" and "New thread ↑". Enter is a new thread. Portalled to `body` so a card's own
// overflow cannot clip it.

import { GitBranch, Highlighter, MessageCircle, StickyNote, ArrowUp, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const MENU_WIDTH = 184;
const PROMPT_MENU_WIDTH = 420;
const ACTION_HEIGHT = 44;
const SELECTION_GAP = 10;
const VIEWPORT_MARGIN = 8;

export interface SelectionMenuAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

export interface SelectionPromptAction {
  placeholder: string;
  autoFocus?: boolean;
  destination?: "reply" | "newThread";
  replyDisabled?: boolean;
  newThreadDisabled?: boolean;
  onReply: (text: string) => void;
  onNewThread: (text: string) => void;
}

export function SelectionMenu({
  position,
  anchorHidden = false,
  actions,
  onDismiss,
  label = "Selection actions",
  promptAction,
}: {
  position: { top: number; bottom: number; left: number };
  anchorHidden?: boolean;
  actions: SelectionMenuAction[];
  onDismiss: () => void;
  label?: string;
  promptAction?: SelectionPromptAction;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const pressing = useRef(false);
  const release = useRef<number | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        const selection = window.getSelection();
        if (!selection || !selection.toString().trim()) onDismiss();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointer);
      document.addEventListener("keydown", onKey);
    }, 100);
    return () => {
      window.clearTimeout(timer);
      if (release.current !== null) window.clearTimeout(release.current);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  const hasText = Boolean(text.trim());
  const needed = promptAction ? ACTION_HEIGHT : actions.length * ACTION_HEIGHT;
  const floor = Math.max(VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN);
  const above = position.top - SELECTION_GAP;
  const below = position.bottom + SELECTION_GAP;
  const roomAbove = above - VIEWPORT_MARGIN;
  const roomBelow = floor - below;
  const placeAbove = roomAbove >= needed || (roomBelow < needed && roomAbove >= roomBelow);
  const room = placeAbove ? roomAbove : roomBelow;
  const maxHeight = room >= needed ? undefined : Math.max(ACTION_HEIGHT, room);
  const width = Math.min(promptAction ? PROMPT_MENU_WIDTH : MENU_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
  const left = Math.min(Math.max(position.left, width / 2 + VIEWPORT_MARGIN), window.innerWidth - width / 2 - VIEWPORT_MARGIN);
  const top = placeAbove ? above : below;

  const newThread = () => {
    const value = text.trim();
    if (!value || promptAction?.newThreadDisabled) return;
    promptAction?.onNewThread(value);
  };
  const reply = () => {
    const value = text.trim();
    if (!value || promptAction?.replyDisabled) return;
    promptAction?.onReply(value);
  };
  const submit = () => (promptAction?.destination === "reply" ? reply() : newThread());

  const actionButton = (props: { onClick: () => void; disabled?: boolean; primary?: boolean; children: ReactNode }) => (
    <button
      className={cn(
        "inline-flex h-[36px] shrink-0 items-center gap-[6px] rounded-[8px] px-[10px] text-[12px] font-medium outline-none transition-colors disabled:opacity-40",
        props.primary
          ? "bg-(--ui-action) text-(--ui-action-glyph) hover:opacity-90 focus-visible:ring-2 focus-visible:ring-(--ui-action) focus-visible:ring-offset-1"
          : "text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground focus-visible:bg-(--ui-control-hover-background)",
      )}
      disabled={props.disabled}
      onClick={props.onClick}
      type="button"
    >
      {props.children}
    </button>
  );

  return createPortal(
    <div
      aria-label={label}
      className="board-menu-pop z-[80]"
      data-selection-menu=""
      data-workspace=""
      onBlurCapture={(event) => {
        if (!pressing.current && !event.currentTarget.contains(event.relatedTarget as Node | null)) onDismiss();
      }}
      onPointerCancelCapture={() => {
        release.current = window.setTimeout(() => {
          pressing.current = false;
          release.current = null;
        }, 0);
      }}
      onPointerDownCapture={() => {
        if (release.current !== null) window.clearTimeout(release.current);
        pressing.current = true;
      }}
      onPointerUpCapture={() => {
        release.current = window.setTimeout(() => {
          pressing.current = false;
          release.current = null;
        }, 0);
      }}
      ref={box}
      role={promptAction ? "group" : "menu"}
      style={{
        position: promptAction ? "absolute" : "fixed",
        top: `${top + (promptAction ? window.scrollY : 0)}px`,
        left: `${left + (promptAction ? window.scrollX : 0)}px`,
        transform: placeAbove ? "translate(-50%, -100%)" : "translateX(-50%)",
        width: `${width}px`,
        maxHeight: maxHeight === undefined ? undefined : `${maxHeight}px`,
        visibility: anchorHidden ? "hidden" : undefined,
      }}
    >
      <div
        className={cn(
          "flex max-h-[inherit] overflow-hidden rounded-[12px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) shadow-xl backdrop-blur-xl",
          promptAction ? "h-[44px] items-center p-[4px]" : "flex-col overflow-y-auto",
          placeAbove ? "origin-bottom" : "origin-top",
        )}
      >
        {promptAction && (
          <form
            className="flex min-w-0 flex-1 items-center"
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
            }}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <input
              aria-label={promptAction.placeholder}
              autoFocus={promptAction.autoFocus}
              className="h-[36px] min-w-0 flex-1 bg-transparent px-[10px] text-[16px] text-foreground outline-none placeholder:text-(--ui-text-tertiary) focus:ring-0"
              onChange={(event) => setText(event.target.value)}
              placeholder={promptAction.placeholder}
              value={text}
            />
          </form>
        )}
        {promptAction && hasText ? (
          <div className="flex shrink-0 items-center gap-[4px]">
            {promptAction.destination === "reply" ? (
              actionButton({ onClick: reply, disabled: promptAction.replyDisabled, primary: true, children: (<><MessageCircle className="size-[14px]" />Follow up<ArrowUp className="size-[14px]" /></>) })
            ) : promptAction.destination === "newThread" ? (
              actionButton({ onClick: newThread, disabled: promptAction.newThreadDisabled, primary: true, children: (<><GitBranch className="size-[14px]" />New thread<ArrowUp className="size-[14px]" /></>) })
            ) : (
              <>
                {actionButton({ onClick: reply, disabled: promptAction.replyDisabled, children: (<><MessageCircle className="size-[14px]" />Reply here</>) })}
                {actionButton({ onClick: newThread, disabled: promptAction.newThreadDisabled, primary: true, children: (<><GitBranch className="size-[14px]" />New thread<ArrowUp className="size-[14px]" /></>) })}
              </>
            )}
          </div>
        ) : (
          <div className={cn("flex", promptAction ? "shrink-0 items-center" : "w-full flex-col")}>
            {promptAction && actions.length > 0 && <span className="mx-[4px] h-[20px] w-px shrink-0 bg-(--ui-stroke-secondary)" />}
            {actions.map((action) => (
              <button
                className={cn(
                  "flex shrink-0 items-center gap-[8px] text-left text-[14px] font-medium text-foreground outline-none transition-colors hover:bg-(--ui-control-hover-background) focus-visible:bg-(--ui-control-hover-background)",
                  promptAction ? "h-[36px] rounded-[8px] px-[10px]" : "w-full px-[14px] py-[10px]",
                )}
                key={action.label}
                onClick={action.onClick}
                onMouseDown={(event) => event.preventDefault()}
                role={promptAction ? undefined : "menuitem"}
                type="button"
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export const SELECTION_ICONS = {
  note: <StickyNote className="size-[16px]" />,
  highlight: <Highlighter className="size-[16px]" />,
  remove: <X className="size-[16px]" />,
};
