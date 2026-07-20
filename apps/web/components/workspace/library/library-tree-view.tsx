"use client";

import type * as React from "react";
import { useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { LibraryTreeFolder, LibraryTreeNote } from "@/lib/workspace/library-tree";
import { cn } from "@/lib/utils";

import { SidebarRowBody, SidebarRowLabel, SidebarRowLead, SidebarRowShell, SidebarRowStack } from "../shell/sidebar-primitives";

const INDENT_REM_PER_DEPTH = 0.875;
const DRAG_TYPE = "application/x-nemesis-library-item";

type DragItem = { kind: "note"; id: string; title: string } | { kind: "folder"; path: string; title: string };
type ContextPoint = { item: DragItem; x: number; y: number };

function indentStyle(depth: number): React.CSSProperties {
  return { paddingLeft: `${depth * INDENT_REM_PER_DEPTH}rem` };
}

function writeDragItem(event: React.DragEvent, item: DragItem) {
  event.stopPropagation();
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
  event.dataTransfer.setData("text/plain", item.kind === "note" ? item.id : item.path);
}

function readDragItem(event: React.DragEvent, fallback: DragItem | null): DragItem | null {
  if (fallback) return fallback;
  try {
    const parsed = JSON.parse(event.dataTransfer.getData(DRAG_TYPE)) as DragItem;
    return parsed?.kind === "note" || parsed?.kind === "folder" ? parsed : null;
  } catch {
    return null;
  }
}

interface LibraryTreeViewProps {
  folder: LibraryTreeFolder;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onMoveNote?: (id: string, folder: string) => void;
  onMoveFolder?: (sourcePath: string, folder: string) => void;
  onDeleteNote?: (id: string) => void;
  onDeleteFolder?: (path: string) => void;
  onRenameNote?: (id: string, title: string) => void;
  onRenameFolder?: (path: string, title: string) => void;
  onCreateFolder?: (path: string) => void;
  depth?: number;
}

export function LibraryTreeView(props: LibraryTreeViewProps) {
  const { folder, onMoveNote, onMoveFolder, depth = 0 } = props;
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [context, setContext] = useState<ContextPoint | null>(null);

  function finishDrop(targetFolder: string, event?: React.DragEvent) {
    const item = event ? readDragItem(event, dragItem) : dragItem;
    if (!item) return;
    if (item.kind === "note") onMoveNote?.(item.id, targetFolder);
    else onMoveFolder?.(item.path, targetFolder);
    setDragItem(null);
    setDropTarget(null);
  }

  function runMenuAction(action: "delete" | "move" | "rename" | "folder") {
    const item = context?.item;
    if (!item) return;
    setContext(null);
    if (action === "delete") {
      const noun = item.kind === "note" ? "note" : "folder and everything inside it";
      if (!window.confirm(`Are you sure you want to delete this ${noun}?`)) return;
      if (item.kind === "note") props.onDeleteNote?.(item.id);
      else props.onDeleteFolder?.(item.path);
      return;
    }
    if (action === "move") {
      const target = window.prompt("Move to folder (leave blank for Library root):", "");
      if (target === null) return;
      if (item.kind === "note") props.onMoveNote?.(item.id, target);
      else props.onMoveFolder?.(item.path, target);
      return;
    }
    if (action === "rename") {
      const title = window.prompt(`Rename ${item.kind}:`, item.title)?.trim();
      if (!title) return;
      if (item.kind === "note") props.onRenameNote?.(item.id, title);
      else props.onRenameFolder?.(item.path, title);
      return;
    }
    const parent = item.kind === "folder" ? item.path : "";
    const name = window.prompt("New folder name:")?.trim();
    if (name) props.onCreateFolder?.(parent ? `${parent}/${name}` : name);
  }

  return (
    <div
      className="min-h-full"
      onDragOver={(event) => {
        if (!readDragItem(event, dragItem)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTarget("");
      }}
      onDrop={(event) => {
        event.preventDefault();
        finishDrop("", event);
      }}
    >
      {dragItem && (
        <div className={cn("mb-1 grid min-h-9 place-items-center rounded-lg border border-dashed px-2 text-[0.6875rem] font-medium", dropTarget === "" ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_9%,transparent)] text-foreground" : "border-(--ui-stroke-secondary) text-(--ui-text-tertiary)")}>Move to Library root</div>
      )}
      <TreeContents
        {...props}
        depth={depth}
        dragItem={dragItem}
        dropTarget={dropTarget}
        onContext={setContext}
        onDragEnd={() => { setDragItem(null); setDropTarget(null); }}
        onDragStart={setDragItem}
        onDropTarget={finishDrop}
        onTargetChange={setDropTarget}
      />
      {context && (
        <>
          <button aria-label="Close note menu" className="fixed inset-0 z-50 cursor-default" onClick={() => setContext(null)} type="button" />
          <div className="fixed z-[51] min-w-44 rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) p-1 text-xs shadow-xl" role="menu" style={{ left: Math.min(context.x, window.innerWidth - 190), top: Math.min(context.y, window.innerHeight - 180) }}>
            <ContextAction onClick={() => runMenuAction("delete")}>Delete {context.item.kind}</ContextAction>
            <ContextAction onClick={() => runMenuAction("move")}>Move {context.item.kind} to…</ContextAction>
            <ContextAction onClick={() => runMenuAction("rename")}>Rename {context.item.kind}</ContextAction>
            <ContextAction onClick={() => runMenuAction("folder")}>Create new folder</ContextAction>
          </div>
        </>
      )}
    </div>
  );
}

function ContextAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-(--ui-control-hover-background)" onClick={onClick} role="menuitem" type="button">{children}</button>;
}

interface TreeContentsProps extends LibraryTreeViewProps {
  dragItem: DragItem | null;
  dropTarget: string | null;
  onDragStart: (item: DragItem) => void;
  onDragEnd: () => void;
  onDropTarget: (folder: string, event?: React.DragEvent) => void;
  onTargetChange: (folder: string | null) => void;
  onContext: (point: ContextPoint) => void;
}

function TreeContents(props: TreeContentsProps) {
  const { folder, depth = 0 } = props;
  return (
    <SidebarRowStack className="gap-px">
      {folder.folders.map((child) => <LibraryFolderNode {...props} depth={depth} folder={child} key={child.path} />)}
      {folder.notes.map((note) => (
        <LibraryNoteRow
          depth={depth}
          isSelected={note.path === props.selectedPath}
          key={note.path}
          note={note}
          onContext={props.onContext}
          onDragEnd={props.onDragEnd}
          onDragStart={(event) => {
            const item = { kind: "note", id: note.id, title: note.title } satisfies DragItem;
            writeDragItem(event, item);
            props.onDragStart(item);
          }}
          onSelect={props.onSelect}
        />
      ))}
    </SidebarRowStack>
  );
}

function LibraryFolderNode(props: TreeContentsProps & { folder: LibraryTreeFolder }) {
  const { folder, depth = 0, dragItem, dropTarget } = props;
  const [open, setOpen] = useState(false);
  const invalidTarget = dragItem?.kind === "folder" && (dragItem.path === folder.path || folder.path.startsWith(`${dragItem.path}/`));
  const highlighted = !invalidTarget && dropTarget === folder.path;
  return (
    <div>
      <div
        draggable
        onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); props.onContext({ item: { kind: "folder", path: folder.path, title: folder.name }, x: event.clientX, y: event.clientY }); }}
        onDragEnd={props.onDragEnd}
        onDragEnter={(event) => { if (invalidTarget) return; event.preventDefault(); event.stopPropagation(); props.onTargetChange(folder.path); setOpen(true); }}
        onDragOver={(event) => { if (invalidTarget) return; event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; }}
        onDragStart={(event) => { const item = { kind: "folder", path: folder.path, title: folder.name } satisfies DragItem; writeDragItem(event, item); props.onDragStart(item); }}
        onDrop={(event) => { if (invalidTarget) return; event.preventDefault(); event.stopPropagation(); props.onDropTarget(folder.path, event); }}
        style={indentStyle(depth)}
      >
        <SidebarRowShell className={cn(highlighted && "outline outline-2 outline-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_9%,transparent)]", dragItem?.kind === "folder" && dragItem.path === folder.path && "opacity-50")}>
          <SidebarRowBody aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            <SidebarRowLead><Codicon className="text-(--ui-text-quaternary)" name={open ? "chevron-down" : "chevron-right"} size="0.75rem" /></SidebarRowLead>
            <SidebarRowLabel className="font-medium text-foreground">{folder.name}</SidebarRowLabel>
          </SidebarRowBody>
        </SidebarRowShell>
      </div>
      {open && <TreeContents {...props} depth={depth + 1} folder={folder} />}
    </div>
  );
}

export function LibraryNoteRow({ note, depth = 0, isSelected, onSelect, onDragStart, onDragEnd, onContext }: { note: LibraryTreeNote; depth?: number; isSelected: boolean; onSelect: (path: string) => void; onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void; onDragEnd?: () => void; onContext?: (point: ContextPoint) => void }) {
  return (
    <div draggable={Boolean(onDragStart)} onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); onContext?.({ item: { kind: "note", id: note.id, title: note.title }, x: event.clientX, y: event.clientY }); }} onDragEnd={onDragEnd} onDragStart={onDragStart} style={indentStyle(depth)}>
      <SidebarRowShell className={cn("row-hover", isSelected && "bg-(--ui-row-active-background)")}>
        <SidebarRowBody onClick={() => onSelect(note.path)}><SidebarRowLabel className={cn(isSelected && "text-foreground")}>{note.title}</SidebarRowLabel></SidebarRowBody>
      </SidebarRowShell>
    </div>
  );
}
