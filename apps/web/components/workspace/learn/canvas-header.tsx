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

import { Codicon } from "@/components/desktop-ui/codicon";
import type { LearningCanvas } from "@/lib/learn/canvas-model";

import { ObjectivesControl, SessionControl, SourcesControl } from "./canvas-controls";

interface CanvasHeaderProps {
  canvas: LearningCanvas;
  onFiles: (files: FileList | File[]) => void;
  onExit: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  /** The card or question being answered right now, so the objectives panel can say which one
   *  the canvas is actually working on rather than guessing from state alone. */
  activeTaskId?: string | null;
}

export function CanvasHeader({
  canvas,
  onFiles,
  onExit,
  onRename,
  onDelete,
  activeTaskId,
}: CanvasHeaderProps) {
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

      {/* §1: three compact controls, floating. Not a toolbar — see the note at the top of
          canvas-controls.tsx for what that costs when it slips. */}
      <SourcesControl canvas={canvas} onFiles={onFiles} />
      <ObjectivesControl activeTaskId={activeTaskId} canvas={canvas} />
      <SessionControl canvas={canvas} onDelete={onDelete} onRename={onRename} />
    </header>
  );
}
