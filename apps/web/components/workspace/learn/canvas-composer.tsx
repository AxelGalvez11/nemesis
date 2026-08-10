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
  /** Adding material belongs here as well as in the sources panel: it is the one control the
   *  learner reaches for mid-lesson, and hunting for it inside a drawer is friction. */
  onFiles: (files: FileList | File[]) => void;
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
  onFiles,
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
    // The bar FLOATS: no footer container, no top border, canvas visible all around it. The
    // gradient is a scrim so text scrolling underneath does not collide with the input — page
    // colour fading to nothing, which draws no edge of its own.
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-6",
        "bg-gradient-to-t from-(--ui-bg-editor) via-(--ui-bg-editor)/85 to-transparent pt-14",
      )}
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-(--canvas-column) transition-opacity duration-300",
          dimmed && "opacity-45 focus-within:opacity-100 hover:opacity-100",
        )}
      >
        {/* The chip needs its own surface. It sits inside the composer's fade, where the
            gradient is nearly transparent, so without a background it was printed straight
            over the paragraph behind it and neither could be read. */}
        {selected.length > 0 && (
          <div className="mb-1.5 ml-1 flex w-fit max-w-full items-center gap-2 rounded-full bg-(--ui-bg-elevated) py-1 pl-3 pr-2 shadow-sm ring-1 ring-(--ui-stroke-tertiary)">
            <span className="truncate text-[0.75rem] text-(--ui-text-tertiary)">
              {selected.length === 1
                ? `“${selected[0]?.content.slice(0, 60) ?? ""}${(selected[0]?.content.length ?? 0) > 60 ? "…" : ""}”`
                : `${selected.length} sections selected`}
            </span>
            <button
              aria-label="Clear selection"
              className="shrink-0 text-(--ui-text-quaternary) hover:text-(--ui-text-secondary)"
              onClick={onClearSelection}
              type="button"
            >
              <Codicon name="close" size="0.6875rem" />
            </button>
          </div>
        )}

        <div
          className={cn(
            "flex min-h-[52px] items-end gap-1 rounded-[26px] bg-(--ui-bg-elevated) p-2",
            "shadow-[0_2px_18px_rgba(0,0,0,0.07)] ring-1 ring-(--ui-stroke-tertiary)",
            selected.length > 0 && "ring-(--ui-accent)/50",
          )}
        >
          <label
            aria-label="Add material"
            className="mb-0.5 flex h-[32px] w-[32px] shrink-0 cursor-pointer items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) has-[:focus-visible]:bg-(--ui-bg-tertiary) has-[:focus-visible]:text-(--ui-text-primary) has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--ui-accent)"
            title="Add material"
          >
            <Codicon name="add" size="0.875rem" />
            {/* 🔴 `sr-only`, NOT `hidden`. A hidden input is out of the tab order and out of the
                accessibility tree, so the label around it becomes unreachable by keyboard and
                adding material has no non-pointer path at all. */}
            <input
              accept=".pdf,.docx,.pptx,.md,.txt,.png,.jpg,.jpeg,.webp,.heic"
              className="sr-only"
              multiple
              onChange={(event) => {
                if (event.target.files?.length) onFiles(event.target.files);
                event.target.value = "";
              }}
              type="file"
            />
          </label>

          <textarea
            className="max-h-40 min-h-[1.75rem] flex-1 resize-none self-center bg-transparent py-1 text-[0.9375rem] leading-relaxed text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
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
            className="mb-0.5 flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) disabled:opacity-40"
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
