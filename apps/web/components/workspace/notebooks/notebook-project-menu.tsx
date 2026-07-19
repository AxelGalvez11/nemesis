"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";

import { useNotebooks } from "./notebooks-store";

const LIBRARY_ACCESS_KEY = "nemesis.web.notebook-library-access";

function readAccess(id: string): boolean {
  try {
    const value = JSON.parse(window.localStorage.getItem(LIBRARY_ACCESS_KEY) ?? "[]");
    return Array.isArray(value) && value.includes(id);
  } catch {
    return false;
  }
}

export function NotebookProjectMenu() {
  const notebooks = useNotebooks();
  const selected = notebooks.selected;
  const [libraryAccess, setLibraryAccess] = useState(false);

  useEffect(() => {
    if (selected) setLibraryAccess(readAccess(selected.id));
  }, [selected]);

  if (!selected) return null;
  const selectedId = selected.id;

  function rename() {
    const next = window.prompt("Rename project", selected?.name)?.trim();
    if (selected && next && next !== selected.name) void notebooks.rename(selected.id, next);
  }

  function remove() {
    if (!selected || !window.confirm(`Delete “${selected.name}”? Its sources and chats are removed. This can't be undone.`)) return;
    void notebooks.remove(selected.id);
  }

  function updateAccess(checked: boolean) {
    setLibraryAccess(checked);
    try {
      const parsed = JSON.parse(window.localStorage.getItem(LIBRARY_ACCESS_KEY) ?? "[]");
      const ids = new Set<string>(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
      if (checked) ids.add(selectedId);
      else ids.delete(selectedId);
      window.localStorage.setItem(LIBRARY_ACCESS_KEY, JSON.stringify(Array.from(ids)));
    } catch {
      // Best effort until this permission is persisted with notebook settings.
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Project actions" className="size-8 rounded-lg" size="icon" variant="ghost"><Codicon name="ellipsis" size="1.05rem" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={rename}><Codicon name="edit" size="0.875rem" /> Rename project</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={libraryAccess} onCheckedChange={updateAccess}><Codicon name="library" size="0.875rem" /> Allow Library access</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={remove} variant="destructive"><Codicon name="trash" size="0.875rem" /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
