"use client";

// Library folder tree — recursive render of the LibraryTreeFolder built by
// lib/workspace/library-tree.ts. Folders own their disclosure state while notes
// remain compact, text-first rows in the same chrome as the chat sidebar
// (components/workspace/shell/sidebar-primitives.tsx), so it reads as one system with the
// rest of the desktop-parity shell.

import type * as React from "react";
import { useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { LibraryTreeFolder, LibraryTreeNote } from "@/lib/workspace/library-tree";
import { cn } from "@/lib/utils";

import { SidebarRowBody, SidebarRowLabel, SidebarRowLead, SidebarRowShell, SidebarRowStack } from "../shell/sidebar-primitives";

const INDENT_REM_PER_DEPTH = 0.875;

function indentStyle(depth: number): React.CSSProperties {
  return { paddingLeft: `${depth * INDENT_REM_PER_DEPTH}rem` };
}

interface LibraryTreeViewProps {
  folder: LibraryTreeFolder;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onMoveNote?: (id: string, folder: string) => void;
  onMoveFolder?: (sourcePath: string, folder: string) => void;
  depth?: number;
}

/** Renders one folder's children (subfolders first, then notes — both already
 *  alphabetically sorted by buildLibraryTree). Recurses for nested subfolders. */
const DRAG_TYPE = "application/x-nemesis-library-item";

type DragItem = { kind: "note"; id: string } | { kind: "folder"; path: string };

function readDragItem(event: React.DragEvent): DragItem | null {
  try {
    const parsed = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as DragItem;
    return parsed?.kind === "note" || parsed?.kind === "folder" ? parsed : null;
  } catch {
    return null;
  }
}

export function LibraryTreeView({ folder, selectedPath, onSelect, onMoveNote, onMoveFolder, depth = 0 }: LibraryTreeViewProps) {
  const drop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const item = readDragItem(event);
    if (item?.kind === "note") onMoveNote?.(item.id, folder.path);
    if (item?.kind === "folder") onMoveFolder?.(item.path, folder.path);
  };
  return (
    <SidebarRowStack className="gap-px" onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={drop}>
      {folder.folders.map((child) => (
        <LibraryFolderNode depth={depth} folder={child} key={child.path} onMoveFolder={onMoveFolder} onMoveNote={onMoveNote} onSelect={onSelect} selectedPath={selectedPath} />
      ))}
      {folder.notes.map((note) => (
        <LibraryNoteRow depth={depth} isSelected={note.path === selectedPath} key={note.path} note={note} onSelect={onSelect} />
      ))}
    </SidebarRowStack>
  );
}

function LibraryFolderNode({
  folder,
  depth,
  selectedPath,
  onSelect,
  onMoveNote,
  onMoveFolder,
}: {
  folder: LibraryTreeFolder;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onMoveNote?: (id: string, folder: string) => void;
  onMoveFolder?: (sourcePath: string, folder: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: "folder", path: folder.path } satisfies DragItem)); }}>
      <div onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const item = readDragItem(event); if (item?.kind === "note") onMoveNote?.(item.id, folder.path); if (item?.kind === "folder") onMoveFolder?.(item.path, folder.path); }} style={indentStyle(depth)}>
        <SidebarRowShell>
          <SidebarRowBody aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <SidebarRowLead><Codicon className="text-(--ui-text-quaternary)" name={open ? "chevron-down" : "chevron-right"} size="0.75rem" /></SidebarRowLead>
            <SidebarRowLabel className="font-medium text-foreground">{folder.name}</SidebarRowLabel>
          </SidebarRowBody>
        </SidebarRowShell>
      </div>
      {open && <LibraryTreeView depth={depth + 1} folder={folder} onMoveFolder={onMoveFolder} onMoveNote={onMoveNote} onSelect={onSelect} selectedPath={selectedPath} />}
    </div>
  );
}

/** A single note row. Exported so the sidebar's flat search-results list (title match,
 *  outside any folder context) can reuse the exact same row chrome as the tree. */
export function LibraryNoteRow({
  note,
  depth = 0,
  isSelected,
  onSelect,
}: {
  note: LibraryTreeNote;
  depth?: number;
  isSelected: boolean;
  onSelect: (path: string) => void;
}) {
  return (
    <div draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: "note", id: note.id } satisfies DragItem)); }} style={indentStyle(depth)}>
      <SidebarRowShell className={cn("row-hover", isSelected && "bg-(--ui-row-active-background)")}>
        <SidebarRowBody onClick={() => onSelect(note.path)}>
          <SidebarRowLabel className={cn(isSelected && "text-foreground")}>{note.title}</SidebarRowLabel>
        </SidebarRowBody>
      </SidebarRowShell>
    </div>
  );
}
