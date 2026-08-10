"use client";

// The canvas's top controls.
//
// 🔴 THIS IS NOT A HEADER BAR, and it must never become one again. It is a transparent layer
// of controls floating ON the canvas: no container, no background of its own, no border-bottom,
// no shadow beneath it, no backdrop-filter. The whole surface is one uninterrupted sheet from
// the top of the viewport to the composer, and the title is navigational context sitting on
// that sheet — not the top edge of a page component.
//
// The regression this replaced was measurable: a full-width `border-b` painted a 1px line
// across every one of the viewport's pixels at y≈54, which is exactly what makes a workspace
// read as "an app page with a header" instead of a document. `canvas-shell.test.ts` asserts the
// class list still carries no border/background utility, and the browser check in the PR walks
// every element in the top 120px looking for a full-width painted edge.
//
// The layer is also deliberately `pointer-events-none` with only its children re-enabled, so
// the invisible strip cannot swallow clicks on the content underneath it.

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { LearningCanvas } from "@/lib/learn/canvas-model";

interface CanvasHeaderProps {
  canvas: LearningCanvas;
  onFiles: (files: FileList | File[]) => void;
  onExit: () => void;
}

export function CanvasHeader({ canvas, onFiles, onExit }: CanvasHeaderProps) {
  const [showSources, setShowSources] = useState(false);
  const sources = useRef<HTMLDivElement>(null);

  // The drawer floats over the canvas rather than hanging off a bar, so it needs to close the
  // way an overlay does — clicking the page behind it, or Escape.
  useEffect(() => {
    if (!showSources) return;
    const onDown = (event: MouseEvent) => {
      if (!sources.current?.contains(event.target as Node)) setShowSources(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowSources(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [showSources]);

  return (
    <header className="pointer-events-none absolute inset-x-[16px] top-[16px] z-30 flex h-[36px] items-center gap-2">
      <button
        aria-label="Leave the canvas"
        className="pointer-events-auto flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-lg text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
        onClick={onExit}
        title="Leave the canvas"
        type="button"
      >
        <Codicon name="arrow-left" size="0.9375rem" />
      </button>

      {/* Navigational context, not the page's heading — the lesson supplies its own hierarchy
          and a second large title on the same screen competes with it.
          🔴 Stays `pointer-events-none` (inherited). It is `flex-1`, so making it clickable
          turned a full-width strip of dead label into a click trap: the document scrolls
          underneath it, and selecting the top line of text hit the title instead. */}
      <span className="min-w-0 flex-1 truncate text-[0.875rem] text-(--ui-text-secondary)">
        {canvas.title || "New canvas"}
      </span>

      <div className="pointer-events-auto relative shrink-0" ref={sources}>
        <button
          aria-expanded={showSources}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[0.8125rem] text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
          onClick={() => setShowSources((current) => !current)}
          type="button"
        >
          Sources
          <span className="text-(--ui-text-quaternary)">· {canvas.sources.length}</span>
        </button>

        {/* A panel attached to the canvas, not a dropdown belonging to a bar. */}
        {showSources && (
          <div className="absolute right-0 top-full z-40 mt-2 max-h-[70vh] w-[17rem] overflow-y-auto rounded-2xl bg-(--ui-bg-elevated) p-2 shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-(--ui-stroke-tertiary)">
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

            <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-[0.8125rem] text-(--ui-text-secondary) hover:bg-(--ui-bg-tertiary)">
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
