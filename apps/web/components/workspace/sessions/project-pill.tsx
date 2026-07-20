"use client";

// "Notebooks" half-pill attached under the sessions landing composer (owner
// asks 2026-07-20): picking a notebook makes the next message start a chat
// inside it — its instructions and sources apply and the chat is saved there.
// Renamed from "Projects" (owner 2026-07-20 evening); projects ARE notebooks.

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
            // Attached tab: the top edge slides up behind the composer surface
            // (surface is z-4, this is z-3) so the chip reads as part of the pill.
            "pointer-events-auto flex max-w-64 items-center gap-1.5 rounded-b-2xl rounded-t-none border border-t-0 border-[color-mix(in_srgb,var(--dt-composer-ring)_calc(18%*var(--composer-ring-strength)),var(--dt-input))] bg-(--composer-fill) px-3.5 pb-1.5 pt-2 text-[0.8rem] backdrop-blur-[0.75rem] transition-colors",
            selected
              ? "text-foreground"
              : "text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground",
          )}
          type="button"
        >
          <Codicon className="shrink-0" name="book" size="0.85rem" />
          <span className="min-w-0 truncate">{selected ? selected.name : "Notebooks"}</span>
          <Codicon className="shrink-0 text-(--ui-text-quaternary)" name="chevron-down" size="0.7rem" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6}>
        {notebooks.length === 0 && (
          <DropdownMenuItem onSelect={onNewProject}>
            <Codicon name="add" size="0.85rem" /> New notebook…
          </DropdownMenuItem>
        )}
        {notebooks.map((notebook) => (
          <DropdownMenuItem key={notebook.id} onSelect={() => onChange(notebook.id)}>
            <Codicon name={notebook.id === value ? "check" : "book"} size="0.85rem" />
            <span className="min-w-0 max-w-56 truncate">{notebook.name}</span>
          </DropdownMenuItem>
        ))}
        {(selected || notebooks.length > 0) && <DropdownMenuSeparator />}
        {selected && (
          <DropdownMenuItem onSelect={() => onChange(null)}>
            <Codicon name="close" size="0.85rem" /> No notebook
          </DropdownMenuItem>
        )}
        {notebooks.length > 0 && (
          <DropdownMenuItem onSelect={onNewProject}>
            <Codicon name="add" size="0.85rem" /> New notebook…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
