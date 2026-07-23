"use client";

// Shared row affordances for Study's lists (owner ask 2026-07-22): every item —
// deck, folder, test, mindmap — gets a "…" menu at the right end and the same
// Rename/Delete on right-click. Obsidian's graph does the same thing ("Right-
// click a note to open a context menu"), so the gesture is consistent.
//
// Right-click, NOT double-click: a double click fires the row's single-click
// action first, so renaming a deck would open the review session on the way.
// Disambiguating that needs a delay on every single click — which taxes the
// common action (opening a deck) to pay for the rare one. Right-click has no
// such collision and needs no delay.
//
// The one trap worth knowing: menu content is portaled to <body>, but React
// bubbles synthetic events through the REACT tree, not the DOM tree. Without
// stopPropagation on the content, choosing "Rename" also fires the row's
// onClick and opens the deck behind the rename field — and a native listener on
// the row never sees it, so it looks like the row was never clicked at all.
// This applies to BOTH menus.

import { IconDots, IconPencil, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/desktop-ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";

/** Both menus render these — one definition so they can't drift apart. */
type MenuItemComponent = React.ComponentType<{
  children: React.ReactNode;
  onSelect: () => void;
  variant?: "default" | "destructive";
}>;

function RowActionItems({ Item, onRename, onDelete }: { Item: MenuItemComponent; onRename: () => void; onDelete: () => void }) {
  return (
    <>
      <Item onSelect={onRename}><IconPencil /> Rename</Item>
      <Item onSelect={onDelete} variant="destructive"><IconTrash /> Delete</Item>
    </>
  );
}

/** Guards every portaled menu surface — see the React-tree note above. */
const menuSurfaceProps = {
  onClick: (event: React.MouseEvent) => event.stopPropagation(),
  // Radix returns focus to the trigger on close, yanking it straight back out
  // of the rename field that just mounted.
  onCloseAutoFocus: (event: Event) => event.preventDefault(),
  onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
} as const;

interface StudyRowMenuProps {
  /** Spoken name of the thing being acted on, e.g. "Deck" or "Folder". */
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
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <IconDots size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36" {...menuSurfaceProps}>
        <RowActionItems Item={DropdownMenuItem} onDelete={onDelete} onRename={onRename} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Wraps a row so right-clicking it offers the same Rename/Delete. */
export function StudyRowContextMenu({ children, onRename, onDelete }: { children: React.ReactNode; onRename: () => void; onDelete: () => void }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-36" {...menuSurfaceProps}>
        <RowActionItems Item={ContextMenuItem} onDelete={onDelete} onRename={onRename} />
      </ContextMenuContent>
    </ContextMenu>
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
      onContextMenu={(event) => event.stopPropagation()}
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
