"use client";

// Title on the left, sources on the right, and the one move the canvas offers next. Nothing
// else — the chrome must not compete with the document (§22).

import { useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { NextAction } from "@/lib/learn/canvas-state";
import type { LearningCanvas } from "@/lib/learn/canvas-model";

interface CanvasHeaderProps {
  canvas: LearningCanvas;
  next: NextAction | null;
  onAdvance: () => void;
  onFiles: (files: FileList | File[]) => void;
  onExit: () => void;
  busy: boolean;
}

export function CanvasHeader({ canvas, next, onAdvance, onFiles, onExit, busy }: CanvasHeaderProps) {
  const [showSources, setShowSources] = useState(false);

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-3 border-b border-(--ui-stroke-tertiary) px-4">
      <button
        aria-label="Leave the canvas"
        className="rounded-md p-1 text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
        onClick={onExit}
        title="Leave the canvas"
        type="button"
      >
        <Codicon name="arrow-left" size="0.875rem" />
      </button>

      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-(--ui-text-secondary)">
        {canvas.title || "New canvas"}
      </span>

      {next && (
        <button
          className="rounded-lg bg-(--ui-text-primary) px-3 py-1 text-[0.75rem] font-medium text-(--ui-bg-editor) disabled:opacity-40"
          disabled={busy}
          onClick={onAdvance}
          type="button"
        >
          {next.label}
        </button>
      )}

      <div className="relative">
        <button
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.75rem] text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
          onClick={() => setShowSources((current) => !current)}
          type="button"
        >
          Sources
          <span className="text-(--ui-text-quaternary)">· {canvas.sources.length}</span>
        </button>

        {showSources && (
          <div className="absolute right-0 top-full z-40 mt-1 w-[22rem] rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-2 shadow-xl">
            {canvas.sources.length === 0 ? (
              <p className="px-2 py-3 text-[0.8125rem] text-(--ui-text-quaternary)">Nothing attached yet.</p>
            ) : (
              canvas.sources.map((source) => (
                <div className="px-2 py-1.5" key={source.id}>
                  <p className="truncate text-[0.8125rem] text-(--ui-text-primary)">{source.title}</p>
                  <p className="text-[0.6875rem] text-(--ui-text-quaternary)">
                    {source.kind} · {source.excerpts.length} excerpt{source.excerpts.length === 1 ? "" : "s"}
                  </p>
                  {/* A source Nemesis could only half read says so here, not silently. */}
                  {source.coverageNote && (
                    <p className="mt-1 text-[0.6875rem] leading-relaxed text-amber-500">
                      {source.coverageNote.replace(/^\[|\]$/g, "")}
                    </p>
                  )}
                </div>
              ))
            )}

            <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[0.8125rem] text-(--ui-text-secondary) hover:bg-(--ui-bg-tertiary)">
              <Codicon name="add" size="0.75rem" />
              Add material
              <input
                accept=".pdf,.docx,.pptx,.md,.txt,.png,.jpg,.jpeg,.webp,.heic"
                className="hidden"
                multiple
                onChange={(event) => {
                  if (event.target.files) onFiles(event.target.files);
                  setShowSources(false);
                }}
                type="file"
              />
            </label>
          </div>
        )}
      </div>
    </header>
  );
}
