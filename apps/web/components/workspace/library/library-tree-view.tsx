"use client";

import type * as React from "react";
import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import type { LibraryTreeFolder, LibraryTreeNote } from "@/lib/workspace/library-tree";
import { cn } from "@/lib/utils";

import { SidebarRowBody, SidebarRowLabel, SidebarRowLead, SidebarRowShell, SidebarRowStack } from "../shell/sidebar-primitives";

const INDENT_REM_PER_DEPTH = 0.875;
type DragItem = { kind: "note"; id: string; title: string } | { kind: "folder"; path: string; title: string };
type ContextPoint = { item: DragItem; x: number; y: number };

function indentStyle(depth: number): React.CSSProperties {
  return { paddingLeft: `${depth * INDENT_REM_PER_DEPTH}rem` };
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
  const dragItemRef = useRef<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  const ignoreClickUntilRef = useRef(0);
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const [context, setContext] = useState<ContextPoint | null>(null);

  useEffect(() => () => pointerCleanupRef.current?.(), []);

  function moveItem(item: DragItem, targetFolder: string) {
    if (item.kind === "folder" && (item.path === targetFolder || targetFolder.startsWith(`${item.path}/`))) return;
    if (item.kind === "note") onMoveNote?.(item.id, targetFolder);
    else onMoveFolder?.(item.path, targetFolder);
  }

  function changeDropTarget(target: string | null) {
    dropTargetRef.current = target;
    setDropTarget(target);
  }

  function startDrag(item: DragItem) {
    dragItemRef.current = item;
    setDragItem(item);
  }

  function endDrag() {
    dragItemRef.current = null;
    setDragItem(null);
    changeDropTarget(null);
  }

  function beginPointerDrag(event: React.PointerEvent, item: DragItem) {
    if (event.button !== 0) return;
    pointerCleanupRef.current?.();
    const origin = { x: event.clientX, y: event.clientY };
    let dragging = false;

    const move = (pointerEvent: PointerEvent) => {
      if (!dragging && Math.hypot(pointerEvent.clientX - origin.x, pointerEvent.clientY - origin.y) < 5) return;
      if (!dragging) {
        dragging = true;
        startDrag(item);
        document.body.style.userSelect = "none";
      }
      const hit = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY) as HTMLElement | null;
      const folderTarget = hit?.closest<HTMLElement>("[data-library-drop-folder]")?.dataset.libraryDropFolder;
      const noteParent = hit?.closest<HTMLElement>("[data-library-parent-folder]")?.dataset.libraryParentFolder;
      const target = folderTarget ?? noteParent ?? "";
      const invalid = item.kind === "folder" && (item.path === target || target.startsWith(`${item.path}/`));
      changeDropTarget(invalid ? null : target);
    };
    const cleanup = () => {
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      if (pointerCleanupRef.current === cleanup) pointerCleanupRef.current = null;
    };
    const up = () => {
      if (dragging) {
        const target = dropTargetRef.current;
        if (target !== null) moveItem(item, target);
        ignoreClickUntilRef.current = performance.now() + 250;
      }
      endDrag();
      cleanup();
    };
    pointerCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
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
      className={cn(
        "relative min-h-full rounded-lg transition-[background-color,outline-color]",
        dragItem && dropTarget === "" && "bg-[color-mix(in_srgb,var(--theme-primary)_7%,transparent)] outline outline-2 -outline-offset-2 outline-[var(--theme-primary)]",
      )}
      data-library-drop-folder=""
    >
      <TreeContents
        {...props}
        depth={depth}
        dragItem={dragItem}
        dropTarget={dropTarget}
        onContext={setContext}
        onPointerDragStart={beginPointerDrag}
        onPointerClick={() => performance.now() < ignoreClickUntilRef.current}
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
  onContext: (point: ContextPoint) => void;
  onPointerDragStart: (event: React.PointerEvent, item: DragItem) => void;
  onPointerClick: () => boolean;
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
          onPointerClick={props.onPointerClick}
          onPointerDragStart={(event) => props.onPointerDragStart(event, { kind: "note", id: note.id, title: note.title })}
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
      <div style={indentStyle(depth)}>
        <SidebarRowShell className={cn(highlighted && "outline outline-2 outline-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_9%,transparent)]", dragItem?.kind === "folder" && dragItem.path === folder.path && "opacity-50")}>
          <SidebarRowBody
            aria-expanded={open}
            className="cursor-grab active:cursor-grabbing"
            data-library-drag-folder={folder.path}
            data-library-drop-folder={folder.path}
            onClick={() => { if (!props.onPointerClick()) setOpen((value) => !value); }}
            onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); props.onContext({ item: { kind: "folder", path: folder.path, title: folder.name }, x: event.clientX, y: event.clientY }); }}
            onPointerDown={(event) => props.onPointerDragStart(event, { kind: "folder", path: folder.path, title: folder.name })}
          >
            <SidebarRowLead><Codicon className="text-(--ui-text-quaternary)" name={open ? "chevron-down" : "chevron-right"} size="0.75rem" /></SidebarRowLead>
            <SidebarRowLabel className="font-medium text-foreground">{folder.name}</SidebarRowLabel>
          </SidebarRowBody>
        </SidebarRowShell>
      </div>
      {open && <TreeContents {...props} depth={depth + 1} folder={folder} />}
    </div>
  );
}

export function LibraryNoteRow({ note, depth = 0, isSelected, onSelect, onContext, onPointerDragStart, onPointerClick }: { note: LibraryTreeNote; depth?: number; isSelected: boolean; onSelect: (path: string) => void; onContext?: (point: ContextPoint) => void; onPointerDragStart?: (event: React.PointerEvent<HTMLButtonElement>) => void; onPointerClick?: () => boolean }) {
  const parentFolder = note.path.split("/").slice(0, -1).join("/");
  return (
    <div style={indentStyle(depth)}>
      <SidebarRowShell className={cn("row-hover", isSelected && "bg-(--ui-row-active-background)")}>
        <SidebarRowBody
          className={cn(onPointerDragStart && "cursor-grab active:cursor-grabbing")}
          data-library-drag-note={note.id}
          data-library-parent-folder={parentFolder}
          onClick={() => { if (!onPointerClick?.()) onSelect(note.path); }}
          onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); onContext?.({ item: { kind: "note", id: note.id, title: note.title }, x: event.clientX, y: event.clientY }); }}
          onPointerDown={onPointerDragStart}
        >
          <SidebarRowLabel className={cn(isSelected && "text-foreground")}>{note.title}</SidebarRowLabel>
        </SidebarRowBody>
      </SidebarRowShell>
    </div>
  );
}
