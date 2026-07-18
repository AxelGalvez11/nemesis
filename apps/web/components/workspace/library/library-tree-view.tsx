"use client";

// Library folder tree — recursive render of the LibraryTreeFolder built by
// lib/workspace/library-tree.ts. Read-only slice 1: no expand/collapse state (folders always
// render open), no drag/reorder, no context menu — just folders and notes, indented by depth,
// in the same row chrome as the chat sidebar's session rows
// (components/workspace/shell/sidebar-primitives.tsx), so it reads as one system with the
// rest of the desktop-parity shell.

import type * as React from "react";

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
  depth?: number;
}

/** Renders one folder's children (subfolders first, then notes — both already
 *  alphabetically sorted by buildLibraryTree). Recurses for nested subfolders. */
export function LibraryTreeView({ folder, selectedPath, onSelect, depth = 0 }: LibraryTreeViewProps) {
  return (
    <SidebarRowStack className="gap-px">
      {folder.folders.map((child) => (
        <LibraryFolderNode depth={depth} folder={child} key={child.path} onSelect={onSelect} selectedPath={selectedPath} />
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
}: {
  folder: LibraryTreeFolder;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <div>
      <div style={indentStyle(depth)}>
        <SidebarRowShell>
          <SidebarRowBody className="cursor-default" disabled>
            <SidebarRowLead>
              <Codicon className="text-(--ui-text-quaternary)" name="folder" size="0.875rem" />
            </SidebarRowLead>
            <SidebarRowLabel className="font-medium text-(--ui-text-tertiary)">{folder.name}</SidebarRowLabel>
          </SidebarRowBody>
        </SidebarRowShell>
      </div>
      <LibraryTreeView depth={depth + 1} folder={folder} onSelect={onSelect} selectedPath={selectedPath} />
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
    <div style={indentStyle(depth)}>
      <SidebarRowShell className={cn("row-hover", isSelected && "bg-(--ui-row-active-background)")}>
        <SidebarRowBody onClick={() => onSelect(note.path)}>
          <SidebarRowLead>
            <Codicon className="text-(--ui-text-quaternary)" name="note" size="0.875rem" />
          </SidebarRowLead>
          <SidebarRowLabel className={cn(isSelected && "text-foreground")}>{note.title}</SidebarRowLabel>
        </SidebarRowBody>
      </SidebarRowShell>
    </div>
  );
}
