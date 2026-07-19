"use client";

// Notebook detail — Claude Projects shape: the scoped chat fills the center; the right rail stacks
// Instructions, Sources (Context), and Memory / Scheduled placeholders. A breadcrumb returns to the
// notebooks list. Reads the shared notebooks store; auth/preview come from the workspace context.

import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

import { NotebookChatPanel } from "./notebook-chat-panel";
import { NotebookSourcesPanel } from "./notebook-sources-panel";
import { useNotebooks } from "./notebooks-store";

const INSTRUCTIONS_DEBOUNCE_MS = 800;

export function NotebookDetail() {
  const { session } = useAuth();
  const preview = Boolean(useWorkspacePreview());
  const uid = preview ? "preview-user" : (session?.user.id ?? null);

  const notebooks = useNotebooks();
  const { selected, sources, sourcesStatus, selectedId } = notebooks;

  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setName(selected?.name ?? "");
    setInstructions(selected?.instructions ?? "");
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selected) return null;

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
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* Breadcrumb */}
      <div className="flex shrink-0 items-center gap-1 px-6 pb-2 pt-[calc(var(--titlebar-height)+1rem)] text-sm">
        <button
          type="button"
          onClick={() => notebooks.select(null)}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
        >
          <Codicon name="chevron-left" size="0.8rem" /> Notebooks
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Center: title + chat */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-6 pb-6">
          <input
            aria-label="Notebook name"
            className="mb-3 min-w-0 truncate bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none"
            onBlur={commitName}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            value={name}
          />
          <NotebookChatPanel
            instructions={selected.instructions}
            notebookId={selected.id}
            preview={preview}
            sources={sources.map((s) => ({ name: s.name, content: s.content }))}
            uid={uid}
          />
        </div>

        {/* Right rail */}
        <aside className="flex w-[22rem] shrink-0 flex-col gap-6 overflow-y-auto border-l border-(--ui-stroke-tertiary) bg-(--ui-sidebar-surface-background) px-4 py-5">
          <section className="flex flex-col gap-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">Instructions</h2>
              <p className="mt-0.5 text-[0.7rem] text-(--ui-text-quaternary)">Tell Nemesis how to help in this notebook.</p>
            </div>
            <textarea
              aria-label="Notebook instructions"
              className="min-h-24 resize-y rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated) px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-(--ui-text-quaternary)"
              onBlur={commitInstructions}
              onChange={(e) => onInstructionsChange(e.target.value)}
              placeholder="e.g. “You're my pharmacology tutor — keep answers exam-focused and cite the guideline I added.”"
              value={instructions}
            />
          </section>

          <NotebookSourcesPanel
            api={notebooks}
            notebookId={selected.id}
            sources={sources}
            sourcesStatus={sourcesStatus}
            uid={uid}
          />

          <SoonSection icon="lightbulb" title="Memory" subtitle="What this notebook remembers about you." />
          <SoonSection icon="clock" title="Scheduled" subtitle="Recurring tasks for this notebook." />

          <button
            type="button"
            onClick={onDelete}
            className="mt-auto flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-xs text-(--dt-destructive) transition-colors hover:bg-(--dt-destructive)/10"
          >
            <Codicon name="trash" size="0.75rem" /> Delete notebook
          </button>
        </aside>
      </div>
    </div>
  );
}

function SoonSection({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <section className={cn("flex flex-col gap-1 opacity-70")}>
      <div className="flex items-center gap-1.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">{title}</h2>
        <span className="rounded-full bg-(--ui-bg-elevated) px-1.5 py-0.5 text-[0.6rem] font-medium text-(--ui-text-quaternary)">Soon</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-(--ui-stroke-tertiary) px-2.5 py-2 text-(--ui-text-quaternary)">
        <Codicon name={icon} size="0.85rem" className="shrink-0" />
        <span className="text-[0.72rem]">{subtitle}</span>
      </div>
    </section>
  );
}
