"use client";

// "Projects" half-pill under the sessions landing composer (owner ask
// 2026-07-20, ChatGPT "Choose project" reference). Projects ARE notebooks:
// picking one makes the next message start a chat inside that notebook —
// its instructions and sources apply and the chat is saved there.

import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import type { Notebook } from "@/lib/notebooks/api";
import { cn } from "@/lib/utils";

interface ProjectPillProps {
  notebooks: Notebook[];
  value: string | null;
  onChange: (notebookId: string | null) => void;
  onNewProject: () => void;
}

export function ProjectPill({ notebooks, value, onChange, onNewProject }: ProjectPillProps) {
  const selected = value ? notebooks.find((notebook) => notebook.id === value) ?? null : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "pointer-events-auto flex max-w-64 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.8rem] transition-colors",
            selected
              ? "bg-(--ui-control-active-background) text-foreground"
              : "bg-[color-mix(in_srgb,var(--ui-base)_7%,transparent)] text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground",
          )}
          type="button"
        >
          <Codicon className="shrink-0" name="folder" size="0.85rem" />
          <span className="min-w-0 truncate">{selected ? selected.name : "Projects"}</span>
          <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="chevron-down" size="0.7rem" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6}>
        {notebooks.length === 0 && (
          <DropdownMenuItem onSelect={onNewProject}>
            <Codicon name="add" size="0.85rem" /> New project…
          </DropdownMenuItem>
        )}
        {notebooks.map((notebook) => (
          <DropdownMenuItem key={notebook.id} onSelect={() => onChange(notebook.id)}>
            <Codicon name={notebook.id === value ? "check" : "folder"} size="0.85rem" />
            <span className="min-w-0 max-w-56 truncate">{notebook.name}</span>
          </DropdownMenuItem>
        ))}
        {(selected || notebooks.length > 0) && <DropdownMenuSeparator />}
        {selected && (
          <DropdownMenuItem onSelect={() => onChange(null)}>
            <Codicon name="close" size="0.85rem" /> No project
          </DropdownMenuItem>
        )}
        {notebooks.length > 0 && (
          <DropdownMenuItem onSelect={onNewProject}>
            <Codicon name="add" size="0.85rem" /> New project…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
