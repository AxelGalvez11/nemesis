"use client";

// The rounded chat composer used both as the project-home central bar (`large`) and inside the chat
// view. Owns only its draft; the parent decides what submitting does (start a new chat vs. continue
// one). Enter sends, Shift+Enter newlines.

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

interface NotebookComposerProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  working?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** The project-home bar is larger and roomier than the in-chat one. */
  large?: boolean;
}

export function NotebookComposer({
  onSubmit,
  disabled,
  working,
  placeholder = "Ask about this notebook…",
  autoFocus,
  large,
}: NotebookComposerProps) {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || disabled || working) return;
    setDraft("");
    onSubmit(text);
  }, [draft, disabled, working, onSubmit]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={cn(
        "flex items-end gap-2 rounded-[1.375rem] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-3.5 py-2.5 shadow-sm transition-colors focus-within:border-(--ui-stroke-secondary)",
        large && "gap-3 px-4 py-3.5",
      )}
    >
      <textarea
        ref={ref}
        autoFocus={autoFocus}
        className={cn(
          "flex-1 resize-none bg-transparent py-1 leading-relaxed text-foreground outline-none placeholder:text-(--ui-text-quaternary)",
          large ? "max-h-56 min-h-11 text-base" : "max-h-48 min-h-8 text-[0.95rem]",
        )}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={large ? 2 : 1}
        value={draft}
      />
      <Button
        aria-label="Send"
        className="shrink-0 rounded-full"
        disabled={!draft.trim() || disabled || working}
        onClick={submit}
        size="icon-sm"
        type="button"
        variant="secondary"
      >
        <Codicon name="send" size="0.9rem" />
      </Button>
    </div>
  );
}
