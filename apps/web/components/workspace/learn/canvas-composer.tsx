"use client";

// The command bar. Visually secondary on purpose (§3, §22): it sits low, narrow and quiet,
// and it never grows a transcript. What the learner types changes the page — that is the
// whole interaction model.

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { CanvasBlock } from "@/lib/learn/canvas-model";
import { cn } from "@/lib/utils";

interface CanvasComposerProps {
  selected: readonly CanvasBlock[];
  onClearSelection: () => void;
  onSubmit: (text: string) => void;
  busy: boolean;
  busyLabel?: string;
  placeholder?: string;
  /** Fades the bar down during focused reading and testing; any keystroke brings it back. */
  dimmed?: boolean;
}

export function CanvasComposer({
  selected,
  onClearSelection,
  onSubmit,
  busy,
  busyLabel,
  placeholder,
  dimmed,
}: CanvasComposerProps) {
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  // Summonable from anywhere: "/" focuses the bar unless the learner is already typing
  // somewhere. Without this the bar being quiet would also make it hard to reach.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    onSubmit(value);
  };

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-6",
        "bg-gradient-to-t from-(--ui-bg-editor) via-(--ui-bg-editor)/85 to-transparent pt-14",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-[42rem] transition-opacity duration-300",
          dimmed && "opacity-45 focus-within:opacity-100 hover:opacity-100",
        )}
      >
        {selected.length > 0 && (
          <div className="mb-1.5 flex items-center gap-2 px-1">
            <span className="truncate text-[0.75rem] text-(--ui-text-tertiary)">
              {selected.length === 1
                ? `“${selected[0]?.content.slice(0, 60) ?? ""}${(selected[0]?.content.length ?? 0) > 60 ? "…" : ""}”`
                : `${selected.length} sections selected`}
            </span>
            <button
              aria-label="Clear selection"
              className="text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
              onClick={onClearSelection}
              type="button"
            >
              <Codicon name="close" size="0.6875rem" />
            </button>
          </div>
        )}

        <div
          className={cn(
            "flex items-end gap-2 rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) px-3 py-2 shadow-lg",
            selected.length > 0 && "border-(--ui-accent)/50",
          )}
        >
          <textarea
            className="max-h-40 min-h-[1.5rem] flex-1 resize-none bg-transparent text-[0.9375rem] leading-relaxed text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
            disabled={busy}
            onChange={(event) => {
              setText(event.target.value);
              const element = event.target;
              element.style.height = "auto";
              element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
              if (event.key === "Escape" && selected.length > 0) onClearSelection();
            }}
            placeholder={
              busy
                ? `${busyLabel ?? "Working"}…`
                : selected.length > 0
                  ? "What should Nemesis do with this?"
                  : (placeholder ?? "Ask Nemesis or change how you're learning…")
            }
            ref={input}
            rows={1}
            value={text}
          />
          <button
            aria-label="Send"
            className="mb-0.5 rounded-lg p-1.5 text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) disabled:opacity-40"
            disabled={busy || !text.trim()}
            onClick={submit}
            type="button"
          >
            <Codicon name={busy ? "loading" : "arrow-up"} size="0.875rem" />
          </button>
        </div>
      </div>
    </div>
  );
}
