"use client";

// Shared row affordances for Study's lists (owner ask 2026-07-22): every item —
// deck, folder, test, mindmap — gets a "…" menu at the right end and renames on
// double-click.
//
// Two collisions make this trickier than it looks, so both are handled here
// once rather than in each tab:
//  1. Rows already act on a single click (open a deck, collapse a folder, open a
//     test). A double click fires that single click FIRST, so renaming a deck
//     would open the review session on the way. useRowClick defers the row's
//     normal action just long enough to see whether a second click lands.
//  2. Rows own pointerdown for drag-and-drop. The "…" trigger sits inside the
//     row, so without stopPropagation, opening the menu starts a drag.

import { IconDots, IconPencil, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";

/** Long enough to catch a deliberate double click, short enough that opening a
 *  deck still feels immediate. */
export const ROW_CLICK_GRACE_MS = 250;

export interface RowClickHandler {
  /** Run `action` unless a second click arrives within the grace window. */
  click: (action: () => void) => void;
  /** Called by the double-click handler to swallow the pending single click. */
  cancel: () => void;
}

export function useRowClick(): RowClickHandler {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => clear, []);
  return {
    cancel: clear,
    click(action) {
      clear();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        action();
      }, ROW_CLICK_GRACE_MS);
    },
  };
}

interface StudyRowMenuProps {
  /** Spoken name of the thing being acted on, e.g. "deck" or "folder". */
  kindLabel: string;
  onRename: () => void;
  onDelete: () => void;
}

export function StudyRowMenu({ kindLabel, onRename, onDelete }: StudyRowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`${kindLabel} actions`}
          // Always visible, not hover-only: the owner asked for a "…" on every
          // row, and a control you have to hover to discover isn't one.
          className="grid size-6 shrink-0 place-items-center justify-self-end rounded-md text-(--ui-text-quaternary) transition-colors hover:bg-black/[0.06] hover:text-foreground data-[state=open]:bg-black/[0.06] data-[state=open]:text-foreground dark:hover:bg-white/[0.09] dark:data-[state=open]:bg-white/[0.09]"
          data-testid="study-row-menu"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <IconDots size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-36"
        // The menu is portaled to <body>, but React bubbles synthetic events
        // through the REACT tree, not the DOM tree — so without this, choosing
        // "Rename" also fires the row's onClick and opens the deck behind the
        // rename field. A native listener on the row never sees it, which makes
        // this look like the row was never clicked at all.
        onClick={(event) => event.stopPropagation()}
        // Radix returns focus to the trigger on close, which yanks it straight
        // back out of the rename field that just mounted.
        onCloseAutoFocus={(event) => event.preventDefault()}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onSelect={onRename}><IconPencil /> Rename</DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete} variant="destructive"><IconTrash /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface StudyRowRenameProps {
  value: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}

/** Inline rename field. Enter or blur commits, Escape abandons. Pointer events
 *  stop here so typing inside a draggable row never starts a drag. */
export function StudyRowRename({ value, onCommit, onCancel }: StudyRowRenameProps) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Select the whole name on open so typing REPLACES it. Plain autoFocus drops
  // the caret at the end, which silently turns "Exam 1" + "Midterm" into
  // "Exam 1Midterm" — every other rename field in every OS preselects.
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  function commit() {
    if (committed.current) return;
    committed.current = true;
    const next = draft.trim();
    if (!next || next === value) onCancel();
    else onCommit(next);
  }

  return (
    <input
      aria-label="New name"
      autoFocus
      className="min-w-0 flex-1 rounded-md border border-(--theme-primary) bg-background px-1.5 py-0.5 text-xs outline-none"
      data-testid="study-row-rename"
      onBlur={commit}
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          committed.current = true;
          onCancel();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onSelect={(event) => event.stopPropagation()}
      ref={inputRef}
      value={draft}
    />
  );
}
