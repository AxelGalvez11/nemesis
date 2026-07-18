"use client";

// Notebook detail pane — the selected notebook's editable name, a sources panel, an instructions
// editor (debounced autosave), and the scoped chat. Left rail = sources + instructions; right =
// chat. Reads the shared notebooks store; auth/preview come from the workspace context (the chat +
// URL/file adders need the signed-in user's device key).

import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { Button } from "@/components/desktop-ui/button";
import { Codicon } from "@/components/desktop-ui/codicon";
import { EmptyState } from "@/components/desktop-ui/empty-state";

import { NotebookChatPanel } from "./notebook-chat-panel";
import { NotebookSourcesPanel } from "./notebook-sources-panel";
import { useNotebooks } from "./notebooks-store";

const INSTRUCTIONS_DEBOUNCE_MS = 800;

export function NotebooksMain() {
  const { session } = useAuth();
  const preview = Boolean(useWorkspacePreview());
  const uid = preview ? "preview-user" : (session?.user.id ?? null);

  const notebooks = useNotebooks();
  const { selected, sources, sourcesStatus, selectedId } = notebooks;

  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reseed the editable fields whenever the selected notebook changes.
  useEffect(() => {
    setName(selected?.name ?? "");
    setInstructions(selected?.instructions ?? "");
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selected) {
    return (
      <main className="flex h-full min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-(--ui-bg-editor)">
        <EmptyState description="Pick a notebook on the left, or create one to gather sources and chat about them." title="No notebook open" />
      </main>
    );
  }

  const commitName = () => {
    const next = name.trim();
    if (next && next !== selected.name) void notebooks.rename(selected.id, next);
    else setName(selected.name);
  };

  const onInstructionsChange = (value: string) => {
    setInstructions(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void notebooks.saveInstructions(selected.id, value);
    }, INSTRUCTIONS_DEBOUNCE_MS);
  };

  const commitInstructions = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (instructions !== (selected.instructions ?? "")) void notebooks.saveInstructions(selected.id, instructions);
  };

  const onDelete = () => {
    if (typeof window !== "undefined" && !window.confirm(`Delete “${selected.name}”? Its sources and chat are removed. This can't be undone.`)) return;
    void notebooks.remove(selected.id);
  };

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-(--ui-bg-editor)">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-(--ui-stroke-tertiary) px-6 pb-3 pt-[calc(var(--titlebar-height)+1rem)]">
        <input
          aria-label="Notebook name"
          className="min-w-0 flex-1 truncate bg-transparent text-xl font-semibold tracking-tight text-foreground outline-none"
          onBlur={commitName}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          value={name}
        />
        <Button aria-label="Delete notebook" onClick={onDelete} size="icon-sm" type="button" variant="ghost">
          <Codicon name="trash" size="0.85rem" className="text-(--ui-text-tertiary)" />
        </Button>
      </div>

      {/* Body: left rail (sources + instructions) + chat */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-r border-(--ui-stroke-tertiary) px-4 py-4">
          <NotebookSourcesPanel
            api={notebooks}
            notebookId={selected.id}
            sources={sources}
            sourcesStatus={sourcesStatus}
            uid={uid}
          />

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">Instructions</h2>
            <textarea
              aria-label="Notebook instructions"
              className="min-h-28 resize-y rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-(--ui-text-quaternary)"
              onBlur={commitInstructions}
              onChange={(e) => onInstructionsChange(e.target.value)}
              placeholder="How should Nemesis help in this notebook? e.g. “You're my pharmacology tutor — keep answers exam-focused and cite the guideline I added.”"
              value={instructions}
            />
          </section>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
          <NotebookChatPanel
            instructions={selected.instructions}
            notebookId={selected.id}
            preview={preview}
            sourceNames={sources.map((s) => s.name)}
            uid={uid}
          />
        </div>
      </div>
    </main>
  );
}
