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

import { IconCards, IconDots, IconFolderMinus, IconPencil, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

import { Tip } from "@/components/desktop-ui/tooltip";

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

/** How a row's removal reads. Folder removal keeps everything inside it, so it
 *  must not borrow the red "Delete" that really does lose data. */
export interface RowRemoval {
  label: string;
  icon: React.ReactNode;
  destructive: boolean;
}

const DELETE_ROW: RowRemoval = { label: "Delete", icon: <IconTrash />, destructive: true };
export const REMOVE_FOLDER: RowRemoval = { label: "Remove folder", icon: <IconFolderMinus />, destructive: false };

function RowActionItems({ Item, onRename, onDelete, removal, onDeleteForever, onBrowse }: { Item: MenuItemComponent; onRename: () => void; onDelete: () => void; removal: RowRemoval; onDeleteForever?: () => void; onBrowse?: () => void }) {
  return (
    <>
      {/* Browse leads (owner 2026-08-04: "allow right click for the browse
          cards in the study page"). It is the only non-destructive entry here
          and by far the most common thing to want from a deck, so it sits
          above the pair that changes or removes it. Absent on folder rows —
          a folder has no cards of its own to browse. */}
      {onBrowse && <Item onSelect={onBrowse}><IconCards /> Browse cards</Item>}
      <Item onSelect={onRename}><IconPencil /> Rename</Item>
      <Item onSelect={onDelete} variant={removal.destructive ? "destructive" : "default"}>{removal.icon} {removal.label}</Item>
      {/* Folders carry BOTH verbs (owner 2026-08-03: "card deck folders still
          cannot be deleted"): "Remove folder" above keeps the decks and stays
          grey; this one takes the decks with it and is red like every other
          real delete. Its caller owns the confirmation. */}
      {onDeleteForever && <Item onSelect={onDeleteForever} variant="destructive"><IconTrash /> Delete folder and decks</Item>}
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
  /** Defaults to the red "Delete"; pass REMOVE_FOLDER when nothing is lost. */
  removal?: RowRemoval;
  /** Folder rows only: the destructive delete-with-contents. */
  onDeleteForever?: () => void;
  /** Deck rows only: open the card browser on this deck. */
  onBrowse?: () => void;
}

export function StudyRowMenu({ kindLabel, onRename, onDelete, removal = DELETE_ROW, onDeleteForever, onBrowse }: StudyRowMenuProps) {
  return (
    <DropdownMenu>
      {/* 🔴 THE TIP GOES OUTSIDE THE DROPDOWN TRIGGER, not around the button.
          Both Tip and DropdownMenuTrigger use asChild, and Radix composes
          nested slots fine in this order. The other way round — a Tip sitting
          between the trigger and its button — puts a plain function component
          where the trigger expects an element, so the props that open the menu
          are handed to something that drops them and the menu stops working.
          This is a raw <button> rather than our Button, so it does not get the
          automatic tooltip and has to say so itself. */}
      <Tip label={`${kindLabel} actions`}>
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
      </Tip>
      <DropdownMenuContent align="end" className="min-w-36" {...menuSurfaceProps}>
        <RowActionItems Item={DropdownMenuItem} onBrowse={onBrowse} onDelete={onDelete} onDeleteForever={onDeleteForever} onRename={onRename} removal={removal} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Wraps a row so right-clicking it offers the same Rename/Delete. */
export function StudyRowContextMenu({ children, onRename, onDelete, removal = DELETE_ROW, onDeleteForever, onBrowse }: { children: React.ReactNode; onRename: () => void; onDelete: () => void; removal?: RowRemoval; onDeleteForever?: () => void; onBrowse?: () => void }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-36" {...menuSurfaceProps}>
        <RowActionItems Item={ContextMenuItem} onBrowse={onBrowse} onDelete={onDelete} onDeleteForever={onDeleteForever} onRename={onRename} removal={removal} />
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
