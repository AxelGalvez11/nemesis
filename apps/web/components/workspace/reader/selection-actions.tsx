"use client";

// The little bar that appears when you select text in a document. Same actions
// as the right panel, but under your cursor, because the moment you have just
// highlighted something is the moment you want to do something with it.

import { useLayoutEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { READER_ACTIONS, type ReaderActionId } from "@/lib/reader/reader-actions";

export interface SelectionAnchor {
  /** Viewport coordinates of the selection's bounding box. */
  left: number;
  top: number;
  width: number;
}

export function SelectionActions({ anchor, onAction }: { anchor: SelectionAnchor; onAction: (action: ReaderActionId) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Measured, not guessed: the bar is centred on the selection and then pulled
  // back inside the window, so a selection at the right edge or at the very top
  // of the page still lands somewhere clickable.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    const margin = 8;
    const wantedLeft = anchor.left + anchor.width / 2 - box.width / 2;
    const left = Math.min(Math.max(margin, wantedLeft), window.innerWidth - box.width - margin);
    const above = anchor.top - box.height - 10;
    setPosition({ left, top: above < margin ? anchor.top + 26 : above });
  }, [anchor.left, anchor.top, anchor.width]);

  return (
    <div
      className="fixed z-[120] flex items-center gap-0.5 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-1 shadow-lg"
      data-testid="reader-selection-actions"
      // Keeps the browser selection alive: a mousedown on a button would
      // otherwise clear it before the click handler ever reads it.
      onMouseDown={(event) => event.preventDefault()}
      ref={ref}
      style={position ? { left: position.left, top: position.top } : { left: -9999, top: -9999 }}
    >
      {READER_ACTIONS.map((action) => (
        <button
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.6875rem] font-medium text-(--ui-text-secondary) hover:bg-(--ui-bg-tertiary) hover:text-foreground"
          key={action.id}
          onClick={() => onAction(action.id)}
          title={action.hint}
          type="button"
        >
          <Codicon name={action.icon} size="0.75rem" />
          {action.label}
        </button>
      ))}
    </div>
  );
}
