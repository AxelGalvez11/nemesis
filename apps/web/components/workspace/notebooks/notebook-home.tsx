"use client";

// The notebook home (Claude's project landing): a breadcrumb back to the list, the editable title, a
// central composer that starts a new chat, the Recents list of this notebook's chats, and the right
// rail — rounded Instructions + Sources cards (each opens a centered zoom-in dialog) plus Memory /
// Scheduled placeholders. Typing a prompt creates a chat and hands off to the full chat view.

import { useCallback, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useWorkspacePreview } from "@/components/workspace/preview-context";
import { Codicon } from "@/components/desktop-ui/codicon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/desktop-ui/dropdown-menu";
import { notebookChatStore, sendNotebookTurn, type NotebookWireSource } from "@/lib/notebooks/chat";
import { cn } from "@/lib/utils";

import { NotebookComposer } from "./notebook-composer";
import { NotebookInstructionsDialog } from "./notebook-instructions-dialog";
import { NotebookSourcesCard } from "./notebook-sources-card";
import { useNotebooks } from "./notebooks-store";

const PREVIEW_REPLY =
  "This is a preview build — replies here are canned. Sign in on the real app to chat about this notebook.";

function titleFromPrompt(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= 48 ? t : `${t.slice(0, 48).trimEnd()}…`;
}

function formatModified(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotebookHome() {
  const { session } = useAuth();
  const preview = Boolean(useWorkspacePreview());
  const uid = preview ? "preview-user" : (session?.user.id ?? null);

  const notebooks = useNotebooks();
  const { selected, sources, sourcesStatus, chats, chatsStatus } = notebooks;

  const [nameDraft, setNameDraft] = useState(selected?.name ?? "");
  const [nameEditing, setNameEditing] = useState(false);
  const [instrOpen, setInstrOpen] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const wireSources: NotebookWireSource[] = useMemo(
    () => sources.map((s) => ({ name: s.name, content: s.content })),
    [sources],
  );

  const startFromPrompt = useCallback(
    async (text: string) => {
      if (!selected) return;
      setStartError(null);
      if (preview) {
        const existing = chats[0];
        if (!existing) return;
        notebooks.openChat(existing.id);
        notebookChatStore.append(existing.id, { role: "user", content: text, at: new Date().toISOString() });
        notebookChatStore.setWorking(existing.id, true);
        window.setTimeout(() => {
          notebookChatStore.append(existing.id, { role: "assistant", content: PREVIEW_REPLY, at: new Date().toISOString() });
          notebookChatStore.setWorking(existing.id, false);
        }, 600);
        return;
      }
      const chat = await notebooks.startChat(selected.id, titleFromPrompt(text));
      if (!chat) {
        setStartError("Couldn't start a chat — check your connection and that you're signed in.");
        return;
      }
      if (!uid) return;
      void sendNotebookTurn({ uid, notebookId: selected.id, chatId: chat.id, instructions: selected.instructions, sources: wireSources, userText: text });
    },
    [selected, preview, chats, uid, wireSources, notebooks],
  );

  if (!selected) return null;

  const commitName = () => {
    setNameEditing(false);
    const next = nameDraft.trim();
    if (next && next !== selected.name) void notebooks.rename(selected.id, next);
    else setNameDraft(selected.name);
  };

  const onDelete = () => {
    if (typeof window !== "undefined" && !window.confirm(`Delete “${selected.name}”? Its sources and chats are removed. This can't be undone.`)) return;
    void notebooks.remove(selected.id);
  };

  const onRename = () => {
    if (typeof window === "undefined") return;
    const next = window.prompt("Rename notebook", selected.name)?.trim();
    if (next && next !== selected.name) void notebooks.rename(selected.id, next);
  };

  const instructions = selected.instructions?.trim() ?? "";

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 px-6 pb-2 pt-[calc(var(--titlebar-height)+1rem)] text-[0.85rem]">
        <button
          type="button"
          onClick={() => notebooks.select(null)}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
        >
          <Codicon name="chevron-left" size="0.8rem" /> Notebooks
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Center: title + composer + Recents */}
        <div className="mx-auto flex min-w-0 flex-1 flex-col overflow-y-auto px-6 pb-8">
          <div className="mx-auto w-full max-w-2xl pt-2">
            {nameEditing ? (
              <input
                aria-label="Notebook name"
                autoFocus
                className="mb-6 w-full min-w-0 bg-transparent text-3xl font-semibold tracking-tight text-foreground outline-none"
                onBlur={commitName}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setNameDraft(selected.name);
                    setNameEditing(false);
                  }
                }}
                value={nameDraft}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNameDraft(selected.name);
                  setNameEditing(true);
                }}
                className="mb-6 block max-w-full truncate text-left text-3xl font-semibold tracking-tight text-foreground hover:opacity-80"
              >
                {selected.name}
              </button>
            )}

            <NotebookComposer onSubmit={startFromPrompt} placeholder="Ask a question" large autoFocus />
            {startError && <p className="mt-2 text-[0.8rem] text-(--dt-destructive)">{startError}</p>}

            <div className="mt-8">
              <h2 className="mb-2 text-[0.8rem] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">Recents</h2>
              {chatsStatus === "loading" ? (
                <p className="py-3 text-[0.85rem] text-(--ui-text-tertiary)">Loading chats…</p>
              ) : chats.length === 0 ? (
                <p className="py-3 text-[0.85rem] text-(--ui-text-tertiary)">No chats yet — ask something above to start one.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {chats.map((c) => (
                    <li key={c.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => notebooks.openChat(c.id)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)/40 px-3.5 py-3 pr-10 text-left transition-colors hover:bg-(--ui-control-hover-background)"
                      >
                        <Codicon name="comment-discussion" size="0.9rem" className="shrink-0 text-(--ui-text-tertiary)" />
                        <span className="min-w-0 flex-1 truncate text-[0.9rem] text-foreground">{c.title}</span>
                        {formatModified(c.updatedAt) && (
                          <span className="shrink-0 text-[0.7rem] tabular-nums text-(--ui-text-quaternary)">{formatModified(c.updatedAt)}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${c.title}`}
                        onClick={() => void notebooks.removeChat(c.id)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-active-background) hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Codicon name="trash" size="0.75rem" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Right rail — floats on the page background (no distinct column/slab), like Claude's. */}
        <aside className="flex w-[22rem] shrink-0 flex-col overflow-y-auto px-3 pb-6 pt-5">
          {/* Notebook controls — pin + actions menu, top-right above the panel. */}
          <div className="mb-2 flex items-center justify-end gap-0.5">
            <button
              type="button"
              disabled
              aria-label="Pin notebook (coming soon)"
              title="Pin — coming soon"
              className="rounded-md p-1 text-(--ui-text-quaternary) opacity-60"
            >
              <Codicon name="pin" size="0.9rem" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Notebook actions"
                  className="rounded-md p-1 text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground data-[state=open]:bg-(--ui-control-active-background) data-[state=open]:text-foreground"
                >
                  <Codicon name="kebab-vertical" size="0.9rem" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom">
                <DropdownMenuItem onSelect={onRename}>
                  <Codicon name="edit" size="0.875rem" /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Codicon name="archive" size="0.875rem" /> Archive
                  <span className="ml-auto rounded-full bg-(--ui-bg-elevated) px-1.5 py-0.5 text-[0.6rem] font-medium text-(--ui-text-quaternary)">Soon</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onDelete} variant="destructive">
                  <Codicon name="trash" size="0.875rem" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* One rounded panel; dividers separate the sections (no nested boxes). */}
          <div className="divide-y divide-(--ui-stroke-tertiary) overflow-hidden rounded-[1.5rem] border border-(--ui-stroke-tertiary) bg-(--ui-bg-elevated)/40">
            <section className="flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[0.8rem] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">Instructions</h2>
                <button
                  type="button"
                  aria-label="Edit instructions"
                  onClick={() => setInstrOpen(true)}
                  className="rounded-md p-1 text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
                >
                  <Codicon name={instructions ? "pencil" : "add"} size="0.8rem" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setInstrOpen(true)}
                className={cn(
                  "rounded-lg px-1 py-1 text-left text-[0.82rem] leading-relaxed transition-colors hover:bg-(--ui-control-hover-background)",
                  instructions ? "text-(--ui-text-secondary)" : "text-(--ui-text-quaternary)",
                )}
              >
                {instructions ? (
                  <span className="line-clamp-4 whitespace-pre-wrap">{instructions}</span>
                ) : (
                  "Add instructions to tailor Nemesis's answers in this notebook."
                )}
              </button>
            </section>

            <NotebookSourcesCard
              notebookId={selected.id}
              uid={uid}
              sources={sources}
              sourcesStatus={sourcesStatus}
              addLibrary={notebooks.addLibrary}
              addExtracted={notebooks.addExtracted}
              removeSource={notebooks.removeSource}
            />

            <SoonSegment icon="lightbulb" title="Memory" subtitle="What this notebook remembers about you." />
            <SoonSegment icon="clock" title="Scheduled" subtitle="Recurring tasks for this notebook." />
          </div>
        </aside>
      </div>

      <NotebookInstructionsDialog
        open={instrOpen}
        onOpenChange={setInstrOpen}
        initialValue={selected.instructions ?? ""}
        onSave={(value) => void notebooks.saveInstructions(selected.id, value)}
      />
    </div>
  );
}

function SoonSegment({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <section className="flex flex-col gap-1 p-3 opacity-75">
      <div className="flex items-center gap-1.5">
        <h2 className="text-[0.8rem] font-semibold uppercase tracking-wide text-(--ui-text-tertiary)">{title}</h2>
        <span className="rounded-full bg-(--ui-bg-elevated) px-1.5 py-0.5 text-[0.6rem] font-medium text-(--ui-text-quaternary)">Soon</span>
      </div>
      <div className="flex items-center gap-2 text-(--ui-text-quaternary)">
        <Codicon name={icon} size="0.85rem" className="shrink-0" />
        <span className="text-[0.74rem]">{subtitle}</span>
      </div>
    </section>
  );
}
