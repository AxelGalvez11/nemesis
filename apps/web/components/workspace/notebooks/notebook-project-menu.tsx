"use client";

// Kebab menu on the notebook home: Rename / Find sources / Delete.
// "Find sources" (owner ask 2026-07-20): the agent web-searches a topic and
// attaches the top results as URL sources (extracted text), so the grounded
// notebook chat has something to stand on. The old "Allow Library access"
// checkbox was a dead localStorage stub and is gone — sources are explicit.

import { useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { searchWebContext } from "@/lib/workspace/chat-api";

import { extractAndAddUrl } from "./notebook-source-actions";
import { useNotebooks } from "./notebooks-store";

const MAX_FOUND_SOURCES = 3;

export function NotebookProjectMenu() {
  const notebooks = useNotebooks();
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const selected = notebooks.selected;
  const [finding, setFinding] = useState(false);

  if (!selected) return null;

  function rename() {
    const next = window.prompt("Rename project", selected?.name)?.trim();
    if (selected && next && next !== selected.name) void notebooks.rename(selected.id, next);
  }

  function remove() {
    if (!selected || !window.confirm(`Are you sure you want to delete “${selected.name}”? Its sources and chats are removed. This can't be undone.`)) return;
    void notebooks.remove(selected.id);
  }

  async function findSources() {
    if (!selected || finding) return;
    const topic = window.prompt("What should Nemesis find sources about?", selected.name)?.trim();
    if (!topic) return;
    setFinding(true);
    try {
      if (!uid) throw new Error("Sign in to find sources.");
      const result = await searchWebContext(uid, topic);
      const candidates = result.sources.filter((source) => source.url).slice(0, MAX_FOUND_SOURCES);
      if (candidates.length === 0) throw new Error("No sources found — try a more specific topic.");
      let added = 0;
      for (const candidate of candidates) {
        try {
          await extractAndAddUrl({ addExtracted: notebooks.addExtracted, notebookId: selected.id, uid, url: candidate.url });
          added += 1;
        } catch {
          // Unreadable page — skip it and keep going.
        }
      }
      window.alert(added > 0
        ? `Added ${added} source${added === 1 ? "" : "s"} about “${topic}”. They're in the Sources card now.`
        : "Found pages, but none could be read. Try a different topic.");
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : "Couldn't find sources. Try again.");
    } finally {
      setFinding(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Project actions" className="size-8 rounded-lg" size="icon" variant="ghost"><Codicon name="ellipsis" size="1.05rem" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={rename}><Codicon name="edit" size="0.875rem" /> Rename project</DropdownMenuItem>
        <DropdownMenuItem disabled={finding} onSelect={() => void findSources()}>
          <Codicon name="search" size="0.875rem" /> {finding ? "Finding sources…" : "Find sources"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={remove} variant="destructive"><Codicon name="trash" size="0.875rem" /> Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
