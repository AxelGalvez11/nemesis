"use client";

import type * as React from "react";
import { useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { LibraryTreeFolder, LibraryTreeNote } from "@/lib/workspace/library-tree";
import { cn } from "@/lib/utils";

import { SidebarRowBody, SidebarRowLabel, SidebarRowLead, SidebarRowShell, SidebarRowStack } from "../shell/sidebar-primitives";

const INDENT_REM_PER_DEPTH = 0.875;
const DRAG_TYPE = "application/x-nemesis-library-item";

type DragItem = { kind: "note"; id: string } | { kind: "folder"; path: string };

function indentStyle(depth: number): React.CSSProperties {
  return { paddingLeft: `${depth * INDENT_REM_PER_DEPTH}rem` };
}

function writeDragItem(event: React.DragEvent, item: DragItem) {
  event.stopPropagation();
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
}

interface LibraryTreeViewProps {
  folder: LibraryTreeFolder;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onMoveNote?: (id: string, folder: string) => void;
  onMoveFolder?: (sourcePath: string, folder: string) => void;
  depth?: number;
}

export function LibraryTreeView({ folder, selectedPath, onSelect, onMoveNote, onMoveFolder, depth = 0 }: LibraryTreeViewProps) {
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  function finishDrop(targetFolder: string) {
    if (!dragItem) return;
    if (dragItem.kind === "note") onMoveNote?.(dragItem.id, targetFolder);
    if (dragItem.kind === "folder") onMoveFolder?.(dragItem.path, targetFolder);
    setDragItem(null);
    setDropTarget(null);
  }

  return (
    <div className="min-h-full">
      {dragItem && (
        <div
          className={cn(
            "mb-1 grid min-h-8 place-items-center rounded-lg border border-dashed px-2 text-[0.6875rem] font-medium transition-colors",
            dropTarget === ""
              ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_9%,transparent)] text-foreground"
              : "border-(--ui-stroke-secondary) text-(--ui-text-tertiary)",
          )}
          onDragEnter={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDropTarget("");
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            finishDrop("");
          }}
        >
          Move to Library root
        </div>
      )}
      <TreeContents
        depth={depth}
        dragItem={dragItem}
        dropTarget={dropTarget}
        folder={folder}
        onDragEnd={() => {
          setDragItem(null);
          setDropTarget(null);
        }}
        onDragStart={setDragItem}
        onDropTarget={finishDrop}
        onMoveFolder={onMoveFolder}
        onMoveNote={onMoveNote}
        onSelect={onSelect}
        onTargetChange={setDropTarget}
        selectedPath={selectedPath}
      />
    </div>
  );
}

interface TreeContentsProps extends LibraryTreeViewProps {
  dragItem: DragItem | null;
  dropTarget: string | null;
  onDragStart: (item: DragItem) => void;
  onDragEnd: () => void;
  onDropTarget: (folder: string) => void;
  onTargetChange: (folder: string | null) => void;
}

function TreeContents({
  folder,
  selectedPath,
  onSelect,
  onMoveNote,
  onMoveFolder,
  depth = 0,
  dragItem,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDropTarget,
  onTargetChange,
}: TreeContentsProps) {
  return (
    <SidebarRowStack className="gap-px">
      {folder.folders.map((child) => (
        <LibraryFolderNode
          depth={depth}
          dragItem={dragItem}
          dropTarget={dropTarget}
          folder={child}
          key={child.path}
          onDragEnd={onDragEnd}
          onDragStart={onDragStart}
          onDropTarget={onDropTarget}
          onMoveFolder={onMoveFolder}
          onMoveNote={onMoveNote}
          onSelect={onSelect}
          onTargetChange={onTargetChange}
          selectedPath={selectedPath}
        />
      ))}
      {folder.notes.map((note) => (
        <LibraryNoteRow
          depth={depth}
          isSelected={note.path === selectedPath}
          key={note.path}
          note={note}
          onDragEnd={onDragEnd}
          onDragStart={(event) => {
            const item = { kind: "note", id: note.id } satisfies DragItem;
            writeDragItem(event, item);
            onDragStart(item);
          }}
          onSelect={onSelect}
        />
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
  dragItem,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDropTarget,
  onTargetChange,
}: {
  folder: LibraryTreeFolder;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onMoveNote?: (id: string, folder: string) => void;
  onMoveFolder?: (sourcePath: string, folder: string) => void;
  dragItem: DragItem | null;
  dropTarget: string | null;
  onDragStart: (item: DragItem) => void;
  onDragEnd: () => void;
  onDropTarget: (folder: string) => void;
  onTargetChange: (folder: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const invalidTarget = dragItem?.kind === "folder" && (dragItem.path === folder.path || folder.path.startsWith(`${dragItem.path}/`));
  const highlighted = !invalidTarget && dropTarget === folder.path;

  return (
    <div>
      <div
        draggable
        onDragEnd={onDragEnd}
        onDragEnter={(event) => {
          if (invalidTarget) return;
          event.preventDefault();
          event.stopPropagation();
          onTargetChange(folder.path);
          setOpen(true);
        }}
        onDragOver={(event) => {
          if (invalidTarget) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
        }}
        onDragStart={(event) => {
          const item = { kind: "folder", path: folder.path } satisfies DragItem;
          writeDragItem(event, item);
          onDragStart(item);
        }}
        onDrop={(event) => {
          if (invalidTarget) return;
          event.preventDefault();
          event.stopPropagation();
          onDropTarget(folder.path);
        }}
        style={indentStyle(depth)}
      >
        <SidebarRowShell
          className={cn(
            highlighted && "outline outline-2 outline-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_9%,transparent)]",
            dragItem?.kind === "folder" && dragItem.path === folder.path && "opacity-50",
          )}
        >
          <SidebarRowBody aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <SidebarRowLead><Codicon className="text-(--ui-text-quaternary)" name={open ? "chevron-down" : "chevron-right"} size="0.75rem" /></SidebarRowLead>
            <SidebarRowLabel className="font-medium text-foreground">{folder.name}</SidebarRowLabel>
          </SidebarRowBody>
        </SidebarRowShell>
      </div>
      {open && (
        <TreeContents
          depth={depth + 1}
          dragItem={dragItem}
          dropTarget={dropTarget}
          folder={folder}
          onDragEnd={onDragEnd}
          onDragStart={onDragStart}
          onDropTarget={onDropTarget}
          onMoveFolder={onMoveFolder}
          onMoveNote={onMoveNote}
          onSelect={onSelect}
          onTargetChange={onTargetChange}
          selectedPath={selectedPath}
        />
      )}
    </div>
  );
}

export function LibraryNoteRow({
  note,
  depth = 0,
  isSelected,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  note: LibraryTreeNote;
  depth?: number;
  isSelected: boolean;
  onSelect: (path: string) => void;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}) {
  return (
    <div draggable={Boolean(onDragStart)} onDragEnd={onDragEnd} onDragStart={onDragStart} style={indentStyle(depth)}>
      <SidebarRowShell className={cn("row-hover", isSelected && "bg-(--ui-row-active-background)")}>
        <SidebarRowBody onClick={() => onSelect(note.path)}>
          <SidebarRowLabel className={cn(isSelected && "text-foreground")}>{note.title}</SidebarRowLabel>
        </SidebarRowBody>
      </SidebarRowShell>
    </div>
  );
}
