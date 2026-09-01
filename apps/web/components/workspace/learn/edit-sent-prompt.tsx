"use client";

// Editing a prompt you already sent.
//
// Owner, 2026-09-01: *"add edit prompt"*. Measured in his own ChatGPT: the control appears under
// the learner's own bubble, and choosing it swaps the bubble for a field holding the same words,
// with Cancel and Send beneath.
//
// 🔴 IT RE-ASKS, IT DOES NOT REWRITE HISTORY. `converse` is the one path a turn has ever taken, so
// an edited prompt goes down it like any other sentence: the previous exchange files into the
// thread exactly as it would have, and the new one becomes the current turn. Nothing is deleted and
// nothing is retro-edited, which means a learner can always see what they actually asked before.
// The reference forks the conversation at the edited message; doing that here would mean deleting
// turns a learner has already read, and that is a much larger claim than "add edit prompt".
//
// 🔴 THE FIELD IS THE BUBBLE'S OWN SHAPE. Same radius, same padding, same type as
// `LearnerUtterance`, because a field that arrives in a different shape reads as a different
// object and the learner loses the thread of what they are editing.

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

/** The control that opens the editor. Sits under the bubble, right-aligned with it. */
export function EditSentPrompt({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      aria-label="Edit message"
      className={cn(
        // 🔴 THE SAME 32px SQUARE AS THE ANSWER'S ACTIONS, so the two rows read as one system.
        // Measured off the reference 2026-08-31 with the rest of the action geometry.
        "flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[8px]",
        "text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-secondary)",
      )}
      onClick={onOpen}
      title="Edit message"
      type="button"
    >
      <Codicon name="edit" size="20px" />
    </button>
  );
}

export function SentPromptEditor({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: string;
  onCancel: () => void;
  onSubmit: (next: string) => void;
}) {
  const [text, setText] = useState(initial);
  const field = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.focus();
    // 🔴 CARET AT THE END, NOT A SELECTION. Selecting the whole thing means the first keystroke
    // destroys what they were trying to amend, which is the opposite of what "edit" promised.
    node.setSelectionRange(node.value.length, node.value.length);
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, []);

  const send = () => {
    const next = text.trim();
    // 🔴 UNCHANGED OR EMPTIED IS A CANCEL, NOT A SEND. Re-asking the identical question spends a
    // turn to produce the same answer, and an emptied field is somebody backing out.
    if (!next || next === initial.trim()) {
      onCancel();
      return;
    }
    onSubmit(next);
  };

  return (
    <div className="flex w-full flex-col items-end gap-[8px]">
      <textarea
        aria-label="Edit your message"
        className={cn(
          "w-full max-w-[70%] resize-none rounded-[22px] px-[16px] py-[10px] text-left",
          "text-[length:var(--canvas-text-body)] leading-[24px]",
          "bg-(--ui-bg-tertiary) text-(--ui-text-primary) outline-none",
          "ring-1 ring-(--ui-stroke-secondary) focus:ring-(--ui-action)",
        )}
        onChange={(event) => {
          setText(event.target.value);
          event.target.style.height = "auto";
          event.target.style.height = `${event.target.scrollHeight}px`;
        }}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter is a newline, Escape backs out — the composer's own contract,
          // because this IS a composer and a second set of keys here would be a second answer.
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
        ref={field}
        rows={1}
        value={text}
      />
      <div className="flex items-center gap-[8px]">
        <button
          className="h-[32px] rounded-[8px] px-[12px] text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary)"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="h-[32px] rounded-[8px] bg-(--ui-action) px-[12px] text-[length:var(--canvas-text-small)] font-medium text-(--ui-action-glyph) transition-opacity hover:opacity-90"
          onClick={send}
          type="button"
        >
          Send
        </button>
      </div>
    </div>
  );
}
